import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { run } from "./exec.ts";
import { hf } from "./hf.ts";
import { derived } from "./store.ts";

/** The voices U-Cut offers. Kokoro has more, but these read English best. */
export const voices = [
  { id: "af_heart", name: "Heart" },
  { id: "am_adam", name: "Adam" },
  { id: "bf_emma", name: "Emma" },
  { id: "bm_george", name: "George" },
];
export const defaultVoice = "af_heart";
export const voiceSize = "500 MB";
export const voiceFile = "voice.wav";

const model = "kokoro-v1.0";
// espeak can't open its data from a long path, so this stays short and out of U-Cut's own folder.
const environment = join(homedir(), ".cache/u-cut/voice");
const python = join(environment, "bin/python");
const modelFile = join(homedir(), ".cache/hyperframes/tts/models", `${model}.onnx`);
const packages = ["kokoro-onnx==0.6.1", "soundfile==0.14.0"];

export function voiceReady(): boolean {
  return existsSync(python) && existsSync(modelFile);
}

const voiceEnv = { HYPERFRAMES_PYTHON: python };

function json<T>(output: string): T {
  return JSON.parse(output.slice(output.indexOf("{"))) as T;
}

export function speechHash(text: string, voice: string, speed: number): string {
  const line = [model, voice, speed, text].join("\n");
  return createHash("sha256").update(line).digest("hex").slice(0, 32);
}

export interface Spoken {
  src: string;
  length: number;
}

/** Voices one line. The same words in the same voice are only ever spoken once. */
export async function speak(
  line: { text: string; speed: number },
  voice: string,
  signal?: AbortSignal,
): Promise<Spoken> {
  const src = speechHash(line.text, voice, line.speed);
  const path = await derived(src, voiceFile, async (partial) => {
    await hf(["tts", line.text, "-o", partial, "--voice", voice, "--speed", String(line.speed)], {
      env: voiceEnv,
      nice: 5,
      timeoutMs: 60_000,
      ...(signal ? { signal } : {}),
    });
  });
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    path,
  ]);
  return { src, length: Math.round(Number(output) * 1000) / 1000 };
}

/**
 * Sets up the voice in its own Python, separate from U-Cut. This is the one thing that downloads
 * outside of `ucut setup`, and it only happens when someone asks for it.
 */
export async function installVoice(): Promise<void> {
  if (voiceReady()) return;
  await run("uv", ["--version"]).catch(() => {
    throw new Error("The voice needs uv. Install it with: brew install uv");
  });
  await mkdir(dirname(environment), { recursive: true });
  await rm(environment, { recursive: true, force: true });
  await run("uv", ["venv", "--quiet", "--python", "3.12", environment], { timeoutMs: 600_000 });
  await run("uv", ["pip", "install", "--quiet", "--python", python, ...packages], {
    timeoutMs: 900_000,
  });
  // The first line fetches the model, so it's ready before anyone is waiting on a reel.
  const check = await hf(
    ["tts", "Ready.", "-o", join(environment, "check.wav"), "--voice", defaultVoice, "--json"],
    {
      env: {
        ...voiceEnv,
        HYPERFRAMES_NO_AUTO_INSTALL: "",
        HYPERFRAMES_NO_OPTIONAL_INSTALL: "",
      },
      timeoutMs: 1_800_000,
    },
  );
  if (!json<{ ok: boolean }>(check).ok) throw new Error("The voice didn't finish installing.");
  await rm(join(environment, "check.wav"), { force: true });
}
