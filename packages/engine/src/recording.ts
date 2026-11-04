import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { findMoments, type ScreenWindow } from "@u-cut/planner-rules";
import type { Demo, DemoWord, MediaItem } from "@u-cut/schema";
import { listenWith } from "./connections/index.ts";
import { run } from "./exec.ts";
import { hf } from "./hf.ts";
import { derived } from "./store.ts";

export const speechModel = "small.en";

/** Takes the model from setup, so a job never downloads anything. */
export function speechReady(): boolean {
  return existsSync(
    join(homedir(), ".cache/hyperframes/whisper/models", `ggml-${speechModel}.bin`),
  );
}

function json<T>(output: string): T {
  return JSON.parse(output.slice(output.indexOf("{"))) as T;
}

async function hasSound(path: string): Promise<boolean> {
  const streams = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a",
    "-show_entries",
    "stream=index",
    "-of",
    "csv=p=0",
    path,
  ]);
  return streams.trim().length > 0;
}

/** Whisper writes what it hears in silence, such as "[BLANK_AUDIO]" or "(wind blowing)". */
export function cleanWords(words: { text: string; start: number; end: number }[]): DemoWord[] {
  return words
    .map((word) => ({ text: word.text.trim(), start: word.start, end: word.end }))
    .filter((word) => /[\p{L}\p{N}]/u.test(word.text) && !/^[[(].*[\])]$/.test(word.text));
}

async function listen(path: string, duration: number): Promise<DemoWord[]> {
  const folder = await mkdtemp(join(tmpdir(), "ucut-listen-"));
  try {
    const output = await hf(
      ["transcribe", path, "--model", speechModel, "--no-runtime-install", "--json"],
      { cwd: folder, nice: 5, timeoutMs: Math.max(120_000, duration * 4000) },
    );
    const { transcriptPath } = json<{ transcriptPath: string }>(output);
    return cleanWords(JSON.parse(await readFile(transcriptPath, "utf8")));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Small mono sound, so a recording uploads quickly and fits every service's size limit. */
async function soundOf(path: string, folder: string): Promise<Uint8Array> {
  const target = join(folder, "sound.m4a");
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    path,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "aac",
    "-b:a",
    "48k",
    target,
  ]);
  return new Uint8Array(await readFile(target));
}

/** Sends the sound to the chosen service. Its words are cleaned the same way Whisper's are. */
async function listenElsewhere(
  path: string,
  service: string,
  hints: string[],
  signal?: AbortSignal,
): Promise<DemoWord[]> {
  const folder = await mkdtemp(join(tmpdir(), "ucut-listen-"));
  try {
    const audio = await soundOf(path, folder);
    return cleanWords(await listenWith(service, { audio, hints, ...(signal ? { signal } : {}) }));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export interface ListenOptions {
  /** `whisper` on this Mac, or a connected service such as `deepgram`. */
  listen?: string;
  /** Names to listen for, such as the product's, so "Claude" isn't heard as "clock". */
  hints?: string[];
  signal?: AbortSignal;
}

interface ScreenActivity {
  windows: ScreenWindow[];
  grid: { cols: number; rows: number };
}

async function watch(path: string, duration: number): Promise<ScreenActivity> {
  const folder = await mkdtemp(join(tmpdir(), "ucut-watch-"));
  try {
    const output = await hf(["measure", "events", path, "--map", "--json", "--out", folder], {
      nice: 5,
      timeoutMs: Math.max(60_000, duration * 2000),
    });
    const report = json<{ grid?: string; windows?: ScreenWindow[] }>(output);
    const [cols = 4, rows = 4] = (report.grid ?? "4x4").split("x").map(Number);
    return { windows: report.windows ?? [], grid: { cols, rows } };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export type Reading = Pick<Demo, "sound" | "words" | "moments" | "speech">;

/** What was heard and seen. Moments are worked out from this, so better planning needs no re-read. */
interface Signals extends ScreenActivity {
  sound: boolean;
  words: DemoWord[];
  speech: Demo["speech"];
}

async function read(item: MediaItem, options: ListenOptions): Promise<Signals> {
  const duration = item.duration ?? 0;
  const service = options.listen ?? "whisper";
  const screen = await watch(item.path, duration).catch(
    (): ScreenActivity => ({ windows: [], grid: { cols: 4, rows: 4 } }),
  );
  const sound = await hasSound(item.path);
  if (sound && service !== "whisper") {
    // A service that fails says why, rather than quietly leaving the demo without captions.
    const words = await listenElsewhere(item.path, service, options.hints ?? [], options.signal);
    return { ...screen, sound, words, speech: words.length > 0 ? "heard" : "none" };
  }
  // A recording U-Cut can't hear is still a recording it can watch.
  const words = sound && speechReady() ? await listen(item.path, duration).catch(() => []) : [];
  const speech = words.length > 0 ? "heard" : sound && !speechReady() ? "no-model" : "none";
  return { ...screen, sound, words, speech };
}

function signalsName(options: ListenOptions): string {
  const service = options.listen ?? "whisper";
  if (service === "whisper") {
    // Installing the model later has to give the next try a fresh listen.
    return speechReady() ? "recording-signals.json" : "recording-signals-silent.json";
  }
  const hints = createHash("sha256")
    .update((options.hints ?? []).join("\n"))
    .digest("hex")
    .slice(0, 8);
  return `recording-signals-${service}-${hints}.json`;
}

/** Works out the moments in a recording, listening to and watching each file only once. */
export async function readRecording(
  item: MediaItem,
  options: ListenOptions = {},
): Promise<Reading> {
  const name = signalsName(options);
  const path = await derived(item.id, name, async (partial) => {
    await writeFile(partial, JSON.stringify(await read(item, options)));
  });
  const { sound, words, speech, windows, grid } = JSON.parse(
    await readFile(path, "utf8"),
  ) as Signals;
  const moments = findMoments({ duration: item.duration ?? 0, words, windows, grid });
  return { sound, words, moments, speech };
}

/** Fetches the speech model by asking for it on a moment of silence. */
export async function installSpeech(): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), "ucut-speech-"));
  try {
    const silence = join(folder, "silence.wav");
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=16000:cl=mono",
      "-t",
      "1",
      silence,
    ]);
    await hf(["transcribe", silence, "--model", speechModel, "--json"], {
      cwd: folder,
      timeoutMs: 1_800_000,
      env: { HYPERFRAMES_NO_AUTO_INSTALL: "", HYPERFRAMES_NO_OPTIONAL_INSTALL: "" },
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
