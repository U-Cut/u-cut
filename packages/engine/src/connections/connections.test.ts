import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deepgramListen, deepgramSpeak } from "./deepgram.ts";
import { elevenLabsListen, elevenLabsSpeak, elevenLabsVoices } from "./elevenlabs.ts";
import { call, ServiceError } from "./http.ts";
import {
  allowVoiceStudio,
  choose,
  connect,
  connectionsStatus,
  currentChoices,
  defaultVoiceFor,
  disconnect,
  speakWith,
  splitVoice,
} from "./index.ts";
import { openAiListen } from "./openai.ts";
import { checkKeyShape } from "./secrets.ts";
import { voiceStudioSpeak, voiceStudioVoices } from "./voicestudio.ts";

interface Seen {
  url: string;
  init: RequestInit;
}

/** A pretend service: records what was asked, and answers with what the test gives it. */
function fake(answer: (seen: Seen) => Response) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const entry = { url: String(url), init };
    seen.push(entry);
    return answer(entry);
  }) as typeof fetch;
  return { seen, fetchImpl };
}

const audio = () =>
  new Response(new Uint8Array(4000), { headers: { "content-type": "audio/wav" } });
const heard = { audio: new Uint8Array(1000), hints: ["Claude", "U-Cut"] };

describe("ElevenLabs", () => {
  it("asks for a voice by id with the key in its own header, and caps the speed", async () => {
    const { seen, fetchImpl } = fake(audio);
    const spoken = await elevenLabsSpeak(
      "sk_key",
      { voice: "abc", text: "Hello there.", speed: 1.4 },
      fetchImpl,
    );
    expect(spoken.extension).toBe(".mp3");
    const [request] = seen;
    expect(request?.url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/abc?output_format=mp3_44100_128",
    );
    expect((request?.init.headers as Record<string, string> | undefined)?.["xi-api-key"]).toBe(
      "sk_key",
    );
    expect(JSON.parse(String(request?.init.body))).toEqual({
      text: "Hello there.",
      model_id: "eleven_multilingual_v2",
      voice_settings: { speed: 1.2 },
    });
  });

  it("lists voices with a short description from their labels", async () => {
    const { fetchImpl } = fake(() =>
      Response.json({
        voices: [
          { voice_id: "v1", name: "Rachel", labels: { accent: "American", gender: "female" } },
        ],
      }),
    );
    expect(await elevenLabsVoices("sk_key", fetchImpl)).toEqual([
      { id: "v1", name: "Rachel", detail: "American, female" },
    ]);
  });

  it("keeps only timed words from a transcript, and sends hints as key terms", async () => {
    const { seen, fetchImpl } = fake(() =>
      Response.json({
        words: [
          { text: "Open", type: "word", start: 0.1, end: 0.4 },
          { text: " ", type: "spacing", start: 0.4, end: 0.45 },
          { text: "Claude.", type: "word", start: 0.45, end: 0.9 },
          { text: "(laughs)", type: "audio_event", start: 1, end: 1.2 },
        ],
      }),
    );
    const words = await elevenLabsListen("sk_key", heard, fetchImpl);
    expect(words).toEqual([
      { text: "Open", start: 0.1, end: 0.4 },
      { text: "Claude.", start: 0.45, end: 0.9 },
    ]);
    const form = seen[0]?.init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.getAll("keyterms")).toEqual(["Claude", "U-Cut"]);
  });
});

describe("Deepgram", () => {
  it("reads aloud as 48 kHz WAV with a token header", async () => {
    const { seen, fetchImpl } = fake(audio);
    await deepgramSpeak("dg", { voice: "aura-2-thalia-en", text: "Hi.", speed: 1 }, fetchImpl);
    const url = new URL(seen[0]?.url ?? "");
    expect(url.pathname).toBe("/v1/speak");
    expect(url.searchParams.get("model")).toBe("aura-2-thalia-en");
    expect(url.searchParams.get("container")).toBe("wav");
    expect(url.searchParams.get("sample_rate")).toBe("48000");
    expect((seen[0]?.init.headers as Record<string, string> | undefined)?.Authorization).toBe(
      "Token dg",
    );
  });

  it("refuses a voice it doesn't have before sending anything", async () => {
    const { seen, fetchImpl } = fake(audio);
    await expect(
      deepgramSpeak("dg", { voice: "nobody", text: "Hi.", speed: 1 }, fetchImpl),
    ).rejects.toThrow("Deepgram's voices");
    expect(seen).toHaveLength(0);
  });

  it("asks for each hint as its own key term and keeps punctuated words", async () => {
    const { seen, fetchImpl } = fake(() =>
      Response.json({
        results: {
          channels: [
            {
              alternatives: [
                { words: [{ word: "claude", punctuated_word: "Claude.", start: 1, end: 1.5 }] },
              ],
            },
          ],
        },
      }),
    );
    expect(await deepgramListen("dg", heard, fetchImpl)).toEqual([
      { text: "Claude.", start: 1, end: 1.5 },
    ]);
    const url = new URL(seen[0]?.url ?? "");
    expect(url.searchParams.get("model")).toBe("nova-3");
    expect(url.searchParams.getAll("keyterm")).toEqual(["Claude", "U-Cut"]);
  });
});

describe("OpenAI and Voice Studio", () => {
  it("asks whisper-1 for word timings, with hints as the prompt", async () => {
    const { seen, fetchImpl } = fake(() =>
      Response.json({ words: [{ word: "Hello", start: 0, end: 0.5 }] }),
    );
    expect(await openAiListen("sk-test", heard, fetchImpl)).toEqual([
      { text: "Hello", start: 0, end: 0.5 },
    ]);
    const form = seen[0]?.init.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.getAll("timestamp_granularities[]")).toEqual(["word"]);
    expect(form.get("prompt")).toBe("Claude, U-Cut");
  });

  it("refuses a recording too long for OpenAI before uploading it", async () => {
    const { seen, fetchImpl } = fake(audio);
    const huge = { audio: new Uint8Array(26 * 1024 * 1024), hints: [] };
    await expect(openAiListen("sk-test", huge, fetchImpl)).rejects.toThrow("too long");
    expect(seen).toHaveLength(0);
  });

  it("lists Voice Studio's own voices and leaves out OpenAI's aliases", async () => {
    const { fetchImpl } = fake(() =>
      Response.json({
        voices: [
          { voice_id: "alloy", name: "Alloy", type: "openai_alias" },
          { voice_id: "p1", name: "My voice", type: "profile", language: "en" },
        ],
      }),
    );
    expect(await voiceStudioVoices(fetchImpl)).toEqual([
      { id: "default", name: "Voice Studio's voice" },
      { id: "p1", name: "My voice", detail: "en" },
    ]);
  });

  it("asks Voice Studio for WAV, and says to open it when it isn't answering", async () => {
    const { seen, fetchImpl } = fake(audio);
    await voiceStudioSpeak({ voice: "default", text: "Hi.", speed: 0.9 }, fetchImpl);
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual({
      input: "Hi.",
      voice: "alloy",
      response_format: "wav",
      speed: 0.9,
    });
    const refused = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(voiceStudioSpeak({ voice: "p1", text: "Hi.", speed: 1 }, refused)).rejects.toThrow(
      "Voice Studio isn't answering. Open it and try again.",
    );
  });
});

describe("talking to services", () => {
  it("turns refusals and limits into sentences someone can act on", async () => {
    const refused = fake(() => new Response("nope", { status: 401 })).fetchImpl;
    await expect(call("ElevenLabs", "https://x", {}, refused)).rejects.toThrow(
      "ElevenLabs didn't accept the key. Check it and connect again.",
    );
    const limited = fake(() => new Response("slow down", { status: 429 })).fetchImpl;
    await expect(call("Deepgram", "https://x", {}, limited)).rejects.toBeInstanceOf(ServiceError);
  });

  it("says when a service is out of credits rather than blaming the key", async () => {
    const broke = fake(
      () => new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 }),
    ).fetchImpl;
    await expect(call("ElevenLabs", "https://x", {}, broke)).rejects.toThrow(
      "ElevenLabs says you've run out of credits.",
    );
  });

  it("gives up on a service that doesn't answer in time", async () => {
    const hangs = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    await expect(call("Deepgram", "https://x", { timeoutMs: 30 }, hangs)).rejects.toThrow(
      "Deepgram didn't answer in time.",
    );
  });

  it("only accepts keys that look like keys", () => {
    expect(checkKeyShape("  sk-ant-api03-abc_DEF.123  ")).toBe("sk-ant-api03-abc_DEF.123");
    expect(() => checkKeyShape("my key")).toThrow("doesn't look like an API key");
    expect(() => checkKeyShape('sk"; rm -rf ~')).toThrow();
  });

  it("reads voices as Kokoro ids or service:id", () => {
    expect(splitVoice("af_heart")).toEqual({ service: "kokoro", id: "af_heart" });
    expect(splitVoice("elevenlabs:abc:def")).toEqual({ service: "elevenlabs", id: "abc:def" });
  });
});

describe("connections", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ucut-connections-"));
    process.env.UCUT_HOME = home;
    process.env.UCUT_VOICESTUDIO_URL = "http://127.0.0.1:9";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(home, { recursive: true, force: true });
  });
  afterAll(() => {
    delete process.env.UCUT_VOICESTUDIO_URL;
  });

  it("starts with everything on this Mac", async () => {
    expect(await currentChoices()).toEqual({ write: "rules", voice: "kokoro", listen: "whisper" });
  });

  it("checks a key before keeping it, keeps it private, and uses it only once chosen", async () => {
    vi.stubGlobal("fetch", fake(() => Response.json({ user_id: "u" })).fetchImpl);
    await connect("elevenlabs", "sk_abcdef1234");
    const status = await connectionsStatus();
    const service = status.services.find((entry) => entry.id === "elevenlabs");
    expect(service).toMatchObject({ connected: true, keyEnding: "1234" });
    expect(JSON.stringify(status)).not.toContain("sk_abcdef1234");
    expect(status.choices.voice).toBe("kokoro");
    expect(statSync(join(home, "connection-keys.json")).mode & 0o777).toBe(0o600);

    await choose("voice", "elevenlabs");
    expect((await currentChoices()).voice).toBe("elevenlabs");
    await disconnect("elevenlabs");
    expect((await currentChoices()).voice).toBe("kokoro");
  });

  it("refuses a paste that can't be a key without sending it anywhere", async () => {
    const { seen, fetchImpl } = fake(() => Response.json({}));
    vi.stubGlobal("fetch", fetchImpl);
    await expect(connect("elevenlabs", "not a real key")).rejects.toThrow(
      "doesn't look like an API key",
    );
    expect(seen).toHaveLength(0);
  });

  it("keeps a key the service refused out of the store", async () => {
    vi.stubGlobal("fetch", fake(() => new Response("", { status: 401 })).fetchImpl);
    await expect(connect("deepgram", "dg_wrongkey1")).rejects.toThrow("didn't accept the key");
    const status = await connectionsStatus();
    expect(status.services.find((entry) => entry.id === "deepgram")?.connected).toBe(false);
  });

  it("won't choose a service that isn't connected or allowed", async () => {
    await expect(choose("write", "claude")).rejects.toThrow("Connect Claude first.");
    await expect(choose("voice", "voicestudio")).rejects.toThrow(
      "Let U-Cut use Voice Studio first.",
    );
    await expect(choose("voice", "openai")).rejects.toThrow(`can't use "openai" to read aloud`);
    await allowVoiceStudio(true);
    expect((await choose("listen", "voicestudio")).listen).toBe("voicestudio");
    await allowVoiceStudio(false);
    expect((await currentChoices()).listen).toBe("whisper");
  });

  it("uses a paid service only for the job it was chosen for", async () => {
    const { seen, fetchImpl } = fake(audio);
    vi.stubGlobal("fetch", fetchImpl);
    await connect("deepgram", "dg_0123456789");
    await choose("listen", "deepgram");
    const checks = seen.length;
    await expect(
      speakWith("deepgram", { voice: "aura-2-thalia-en", text: "Hi.", speed: 1 }),
    ).rejects.toThrow("isn't chosen to read aloud");
    expect(seen).toHaveLength(checks);
    expect(await defaultVoiceFor(await currentChoices())).toBe("af_heart");
    await choose("voice", "deepgram");
    expect(await defaultVoiceFor(await currentChoices())).toBe("deepgram:aura-2-thalia-en");
  });

  it("falls back to the built-in lanes when the settings file is damaged", async () => {
    writeFileSync(join(home, "connections.json"), "{ not json");
    expect(await currentChoices()).toEqual({ write: "rules", voice: "kokoro", listen: "whisper" });
  });
});
