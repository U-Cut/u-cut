import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { speakWith, splitVoice, voiceModel } from "./connections/index.ts";
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

export function speechHash(text: string, voice: string, speed: number, by = model): string {
  const line = [by, voice, speed, text].join("\n");
  return createHash("sha256").update(line).digest("hex").slice(0, 32);
}

export interface Spoken {
  src: string;
  length: number;
}

/** Turns a service's sound into the same mono 48 kHz WAV that Kokoro's lines are. */
async function saveAsWav(data: Uint8Array, extension: string, target: string) {
  const folder = await mkdtemp(join(tmpdir(), "ucut-voice-"));
  try {
    const raw = join(folder, `spoken${extension}`);
    await writeFile(raw, data);
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      raw,
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      target,
    ]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/**
 * Voices one line. The same words in the same voice are only ever spoken once. A voice is a
 * Kokoro id such as `af_heart`, or `service:id` for a connected service.
 */
export async function speak(
  line: { text: string; speed: number },
  voice: string,
  signal?: AbortSignal,
): Promise<Spoken> {
  const { service, id } = splitVoice(voice);
  if (service === "kokoro" && !voices.some((known) => known.id === id)) {
    throw new Error(
      `"${voice}" isn't a voice U-Cut has. Pick one from \`ucut voices\` or the catalog.`,
    );
  }
  const src =
    service === "kokoro"
      ? speechHash(line.text, voice, line.speed)
      : speechHash(line.text, voice, line.speed, voiceModel(service));
  const path = await derived(src, voiceFile, async (partial) => {
    if (service !== "kokoro") {
      const spoken = await speakWith(service, {
        voice: id,
        text: line.text,
        speed: line.speed,
        ...(signal ? { signal } : {}),
      });
      await saveAsWav(spoken.data, spoken.extension, partial);
      return;
    }
    await hf(["tts", line.text, "-o", partial, "--voice", id, "--speed", String(line.speed)], {
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
 * Sets up the voice's own Python, separate from U-Cut, with the uv it's given. The model files
 * are already downloaded by then (see setup/), so this fetches only Python and its packages.
 */
export async function prepareVoice(uv: string, signal?: AbortSignal): Promise<void> {
  const options = signal ? { signal } : {};
  await mkdir(dirname(environment), { recursive: true });
  await rm(environment, { recursive: true, force: true });
  await run(uv, ["venv", "--quiet", "--python", "3.12", environment], {
    timeoutMs: 600_000,
    ...options,
  });
  await run(uv, ["pip", "install", "--quiet", "--python", python, ...packages], {
    timeoutMs: 900_000,
    ...options,
  });
  // One line proves the voice works before anyone is waiting on a reel.
  const check = await hf(
    ["tts", "Ready.", "-o", join(environment, "check.wav"), "--voice", defaultVoice, "--json"],
    {
      env: {
        ...voiceEnv,
        HYPERFRAMES_NO_AUTO_INSTALL: "",
        HYPERFRAMES_NO_OPTIONAL_INSTALL: "",
      },
      timeoutMs: 1_800_000,
      ...options,
    },
  );
  if (!json<{ ok: boolean }>(check).ok) throw new Error("The voice didn't finish installing.");
  await rm(join(environment, "check.wav"), { force: true });
}
