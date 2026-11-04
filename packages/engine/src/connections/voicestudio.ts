import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { DemoWord } from "@u-cut/schema";
import { run } from "../exec.ts";
import { bytes, call, type Fetch, json } from "./http.ts";
import { listenOpenAiStyle } from "./openai.ts";
import type { Heard, Spoken, Voice } from "./types.ts";

const name = "Voice Studio";
const appPaths = ["/Applications/VoiceStudio.app", join(homedir(), "Applications/VoiceStudio.app")];
const installedAt = () => appPaths.find((path) => existsSync(path));
const notAnswering = "Voice Studio isn't answering. Open it and try again.";

/** Voice Studio serves its API here. Set UCUT_VOICESTUDIO_URL if yours uses another port. */
export const voiceStudioUrl = () => process.env.UCUT_VOICESTUDIO_URL ?? "http://127.0.0.1:3900";

const clientHeader = { "X-OmniVoice-Client-Id": "u-cut" };

export interface VoiceStudioState {
  installed: boolean;
  running: boolean;
}

/** Looks without sending anything: is the app there, and is it answering on this Mac? */
export async function voiceStudioState(fetchImpl?: Fetch): Promise<VoiceStudioState> {
  const installed = platform() === "darwin" && installedAt() !== undefined;
  const running = await call(
    name,
    `${voiceStudioUrl()}/v1/models`,
    { headers: clientHeader, timeoutMs: 1000 },
    fetchImpl,
  ).then(
    () => true,
    () => false,
  );
  return { installed: installed || running, running };
}

export async function openVoiceStudio(): Promise<void> {
  const app = platform() === "darwin" ? installedAt() : undefined;
  if (!app) throw new Error("Voice Studio isn't installed on this Mac.");
  await run("open", [app]);
}

interface VoiceList {
  voices?: { voice_id?: string; id?: string; name?: string; type?: string; language?: string }[];
}

/** Its own voices, including any you've cloned or designed. OpenAI's names are only aliases. */
export async function voiceStudioVoices(fetchImpl?: Fetch): Promise<Voice[]> {
  const response = await call(
    name,
    `${voiceStudioUrl()}/v1/audio/voices`,
    { headers: clientHeader, timeoutMs: 5000, unreachable: notAnswering },
    fetchImpl,
  );
  const { voices = [] } = await json<VoiceList>(response, name);
  const own = voices
    .filter((voice) => voice.type !== "openai_alias")
    .map((voice) => {
      const id = voice.voice_id ?? voice.id ?? "";
      return { id, name: voice.name ?? id, ...(voice.language ? { detail: voice.language } : {}) };
    })
    .filter((voice) => voice.id);
  return [{ id: "default", name: "Voice Studio's voice" }, ...own];
}

export async function voiceStudioSpeak(
  input: { voice: string; text: string; speed: number; signal?: AbortSignal },
  fetchImpl?: Fetch,
): Promise<Spoken> {
  const response = await call(
    name,
    `${voiceStudioUrl()}/v1/audio/speech`,
    {
      method: "POST",
      headers: { ...clientHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: input.text,
        // Any OpenAI voice name means the active engine's own default voice.
        voice: input.voice === "default" ? "alloy" : input.voice,
        response_format: "wav",
        speed: input.speed,
      }),
      timeoutMs: 180_000,
      unreachable: notAnswering,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    fetchImpl,
  );
  return { data: await bytes(response, name), extension: ".wav" };
}

export function voiceStudioListen(input: Heard, fetchImpl?: Fetch): Promise<DemoWord[]> {
  return listenOpenAiStyle(
    name,
    `${voiceStudioUrl()}/v1/audio/transcriptions`,
    { ...input, unreachable: notAnswering },
    fetchImpl,
  );
}
