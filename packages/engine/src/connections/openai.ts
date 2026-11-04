import type { DemoWord } from "@u-cut/schema";
import { call, type Fetch, json } from "./http.ts";
import type { Heard } from "./types.ts";

const base = "https://api.openai.com";
/**
 * whisper-1 is the only OpenAI model that times each word, which captions need. OpenAI has said
 * it shuts down in February 2027, so this is the one line to change when it does.
 */
const listenModel = "whisper-1";

export async function checkOpenAi(key: string, fetchImpl?: Fetch): Promise<void> {
  await call(
    "OpenAI",
    `${base}/v1/models`,
    { headers: { Authorization: `Bearer ${key}` }, timeoutMs: 15_000 },
    fetchImpl,
  );
}

interface Verbose {
  words?: { word: string; start: number; end: number }[];
}

/** OpenAI's transcription request. Voice Studio answers the same request on this Mac. */
export async function listenOpenAiStyle(
  service: string,
  endpoint: string,
  input: Heard & { key?: string; model?: string; unreachable?: string },
  fetchImpl?: Fetch,
): Promise<DemoWord[]> {
  const form = new FormData();
  form.set("file", new Blob([input.audio], { type: "audio/mp4" }), "recording.m4a");
  if (input.model) form.set("model", input.model);
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.set("language", "en");
  if (input.hints.length > 0) form.set("prompt", input.hints.join(", "));
  const response = await call(
    service,
    endpoint,
    {
      method: "POST",
      headers: input.key ? { Authorization: `Bearer ${input.key}` } : {},
      body: form,
      timeoutMs: 900_000,
      ...(input.unreachable ? { unreachable: input.unreachable } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    fetchImpl,
  );
  const { words = [] } = await json<Verbose>(response, service);
  return words.map((word) => ({ text: word.word, start: word.start, end: word.end }));
}

/** OpenAI takes files up to 25 MB. U-Cut sends small mono audio, so that's about 50 minutes. */
export const openAiLimit = 25 * 1024 * 1024;

export async function openAiListen(
  key: string,
  input: Heard,
  fetchImpl?: Fetch,
): Promise<DemoWord[]> {
  if (input.audio.byteLength > openAiLimit) {
    throw new Error("That recording is too long for OpenAI, which takes about 50 minutes.");
  }
  return listenOpenAiStyle(
    "OpenAI",
    `${base}/v1/audio/transcriptions`,
    { ...input, key, model: listenModel },
    fetchImpl,
  );
}
