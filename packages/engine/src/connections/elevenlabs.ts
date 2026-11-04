import type { DemoWord } from "@u-cut/schema";
import { bytes, call, type Fetch, json } from "./http.ts";
import type { Heard, Spoken, Voice } from "./types.ts";

const name = "ElevenLabs";
const base = "https://api.elevenlabs.io";
export const elevenLabsModel = "eleven_multilingual_v2";
const listenModel = "scribe_v2";

const headers = (key: string) => ({ "xi-api-key": key });

/** Listing one voice works with any key that can read aloud, including restricted ones. */
export async function checkElevenLabs(key: string, fetchImpl?: Fetch): Promise<void> {
  await call(
    name,
    `${base}/v2/voices?page_size=1`,
    { headers: headers(key), timeoutMs: 15_000 },
    fetchImpl,
  );
}

interface VoiceList {
  voices?: { voice_id: string; name?: string; labels?: Record<string, string> }[];
}

export async function elevenLabsVoices(key: string, fetchImpl?: Fetch): Promise<Voice[]> {
  const response = await call(
    name,
    `${base}/v2/voices?page_size=100&sort=name&sort_direction=asc`,
    { headers: headers(key), timeoutMs: 15_000 },
    fetchImpl,
  );
  const { voices = [] } = await json<VoiceList>(response, name);
  return voices.map((voice) => {
    const labels = voice.labels ?? {};
    const detail = [labels.accent, labels.gender, labels.descriptive ?? labels.description]
      .filter(Boolean)
      .join(", ");
    return {
      id: voice.voice_id,
      name: voice.name ?? voice.voice_id,
      ...(detail ? { detail } : {}),
    };
  });
}

/** ElevenLabs keeps speed between 0.7 and 1.2, so faster lines are capped there. */
export async function elevenLabsSpeak(
  key: string,
  input: { voice: string; text: string; speed: number; signal?: AbortSignal },
  fetchImpl?: Fetch,
): Promise<Spoken> {
  const speed = Math.min(1.2, Math.max(0.7, input.speed));
  const response = await call(
    name,
    `${base}/v1/text-to-speech/${encodeURIComponent(input.voice)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { ...headers(key), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: input.text,
        model_id: elevenLabsModel,
        ...(speed === 1 ? {} : { voice_settings: { speed } }),
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    fetchImpl,
  );
  return { data: await bytes(response, name), extension: ".mp3" };
}

interface Transcript {
  words?: { text: string; type?: string; start?: number | null; end?: number | null }[];
}

export async function elevenLabsListen(
  key: string,
  input: Heard,
  fetchImpl?: Fetch,
): Promise<DemoWord[]> {
  const form = new FormData();
  form.set("model_id", listenModel);
  form.set("file", new Blob([input.audio], { type: "audio/mp4" }), "recording.m4a");
  form.set("timestamps_granularity", "word");
  form.set("tag_audio_events", "false");
  for (const term of input.hints) form.append("keyterms", term);
  const response = await call(
    name,
    `${base}/v1/speech-to-text`,
    {
      method: "POST",
      headers: headers(key),
      body: form,
      timeoutMs: 600_000,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    fetchImpl,
  );
  const { words = [] } = await json<Transcript>(response, name);
  return words
    .filter((word) => (word.type ?? "word") === "word" && word.start != null && word.end != null)
    .map((word) => ({ text: word.text, start: word.start ?? 0, end: word.end ?? 0 }));
}
