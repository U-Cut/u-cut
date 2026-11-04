import type { DemoWord } from "@u-cut/schema";
import { bytes, call, type Fetch, json } from "./http.ts";
import type { Heard, Spoken, Voice } from "./types.ts";

const name = "Deepgram";
const base = "https://api.deepgram.com";
const listenModel = "nova-3";

const auth = (key: string) => ({ Authorization: `Token ${key}` });

/** Deepgram has no voice list to ask for, so these are its English Aura-2 voices. */
export const deepgramVoices: Voice[] = [
  { id: "aura-2-thalia-en", name: "Thalia", detail: "American, feminine" },
  { id: "aura-2-andromeda-en", name: "Andromeda", detail: "American, feminine" },
  { id: "aura-2-helena-en", name: "Helena", detail: "American, feminine" },
  { id: "aura-2-athena-en", name: "Athena", detail: "American, feminine" },
  { id: "aura-2-apollo-en", name: "Apollo", detail: "American, masculine" },
  { id: "aura-2-arcas-en", name: "Arcas", detail: "American, masculine" },
  { id: "aura-2-orion-en", name: "Orion", detail: "American, masculine" },
  { id: "aura-2-zeus-en", name: "Zeus", detail: "American, masculine" },
  { id: "aura-2-draco-en", name: "Draco", detail: "British, masculine" },
  { id: "aura-2-pandora-en", name: "Pandora", detail: "British, feminine" },
  { id: "aura-2-hyperion-en", name: "Hyperion", detail: "Australian, masculine" },
  { id: "aura-2-theia-en", name: "Theia", detail: "Australian, feminine" },
];

function speakUrl(voice: string, speed: number): string {
  const query = new URLSearchParams({
    model: voice,
    encoding: "linear16",
    container: "wav",
    sample_rate: "48000",
    ...(speed === 1 ? {} : { speed: String(speed) }),
  });
  return `${base}/v1/speak?${query}`;
}

/**
 * A two-word line is the cheapest check that works for every key. Listing projects needs a key
 * with management rights, which a key made only for speech doesn't have.
 */
export async function checkDeepgram(key: string, fetchImpl?: Fetch): Promise<void> {
  await call(
    name,
    speakUrl("aura-2-thalia-en", 1),
    {
      method: "POST",
      headers: { ...auth(key), "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hi." }),
      timeoutMs: 15_000,
    },
    fetchImpl,
  );
}

export async function deepgramSpeak(
  key: string,
  input: { voice: string; text: string; speed: number; signal?: AbortSignal },
  fetchImpl?: Fetch,
): Promise<Spoken> {
  if (!deepgramVoices.some((voice) => voice.id === input.voice)) {
    throw new Error("That isn't one of Deepgram's voices.");
  }
  const response = await call(
    name,
    speakUrl(input.voice, Math.min(1.5, Math.max(0.7, input.speed))),
    {
      method: "POST",
      headers: { ...auth(key), "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    fetchImpl,
  );
  return { data: await bytes(response, name), extension: ".wav" };
}

interface Listened {
  results?: {
    channels?: {
      alternatives?: {
        words?: { word: string; punctuated_word?: string; start: number; end: number }[];
      }[];
    }[];
  };
}

export async function deepgramListen(
  key: string,
  input: Heard,
  fetchImpl?: Fetch,
): Promise<DemoWord[]> {
  const query = new URLSearchParams({
    model: listenModel,
    smart_format: "true",
    punctuate: "true",
  });
  for (const term of input.hints) query.append("keyterm", term);
  const response = await call(
    name,
    `${base}/v1/listen?${query}`,
    {
      method: "POST",
      headers: { ...auth(key), "Content-Type": "audio/mp4" },
      body: input.audio,
      timeoutMs: 600_000,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    fetchImpl,
  );
  const listened = await json<Listened>(response, name);
  const words = listened.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
  return words.map((word) => ({
    text: word.punctuated_word ?? word.word,
    start: word.start,
    end: word.end,
  }));
}
