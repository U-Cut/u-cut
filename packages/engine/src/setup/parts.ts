import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// What U-Cut downloads once, after it's installed, with each file's size and checksum pinned.
// Rendering needs the browser. Captions and the built-in voice are optional and wait to be asked.

export type PartId = "browser" | "speech" | "voice";

export interface PinnedFile {
  url: string;
  sha256: string;
  bytes: number;
}

/** The browser HyperFrames 0.8.223 renders with. It must match HyperFrames' own pin. */
export const browserVersion = "152.0.7977.30";

export const browserZip: PinnedFile = {
  url: `https://storage.googleapis.com/chrome-for-testing-public/${browserVersion}/mac-arm64/chrome-headless-shell-mac-arm64.zip`,
  sha256: "1db16c16e72bedfa747ed01c207a3fe8ee7370c35f2094279eb8878c996e8c79",
  bytes: 97_532_843,
};

/** The speech model for captions. The checksum is the one HyperFrames pins. */
export const speechFile: PinnedFile = {
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small.en.bin",
  sha256: "c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d",
  bytes: 487_614_201,
};

const kokoro = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0";

export const voiceFiles = {
  model: {
    url: `${kokoro}/kokoro-v1.0.onnx`,
    sha256: "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5",
    bytes: 325_532_387,
  },
  voices: {
    url: `${kokoro}/voices-v1.0.bin`,
    sha256: "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
    bytes: 28_214_398,
  },
} satisfies Record<string, PinnedFile>;

/** uv sets up the voice's Python. It's fetched only on a Mac without it. */
export const uvVersion = "0.13.7";
export const uvArchive: PinnedFile = {
  url: `https://github.com/astral-sh/uv/releases/download/${uvVersion}/uv-aarch64-apple-darwin.tar.gz`,
  sha256: "81b811b57e4624df7ed3aac148e0359100d9962f3d9dce00aec533dc2e086731",
  bytes: 14_347_867,
};

/** Python, the voice's packages and their own downloads, which uv fetches without a size. */
export const voiceEnvironmentBytes = 150 * 1024 ** 2;

/** Where U-Cut keeps the tools it downloads. Set UCUT_TOOLS to move it. */
export function toolsDir(): string {
  if (process.env.UCUT_TOOLS) return process.env.UCUT_TOOLS;
  return process.platform === "darwin"
    ? join(homedir(), "Library/Application Support/U-Cut/tools")
    : join(homedir(), ".cache/u-cut/tools");
}

const hyperframesCache = () => join(homedir(), ".cache/hyperframes");

export const speechModelPath = () =>
  join(hyperframesCache(), "whisper/models", "ggml-small.en.bin");
export const voiceModelPath = () => join(hyperframesCache(), "tts/models", "kokoro-v1.0.onnx");
export const voiceVoicesPath = () => join(hyperframesCache(), "tts/voices", "voices-v1.0.bin");

/** Where U-Cut's own copy of the browser goes, on an Apple Silicon Mac. */
export const ownBrowserPath = () =>
  join(
    toolsDir(),
    `browser-${browserVersion}`,
    "chrome-headless-shell-mac-arm64",
    "chrome-headless-shell",
  );

/** The copy `hyperframes browser ensure` puts in its own cache. */
function hyperframesBrowserPath(): string {
  const folder =
    process.platform === "darwin"
      ? `mac_arm-${browserVersion}/chrome-headless-shell-mac-arm64`
      : `linux-${browserVersion}/chrome-headless-shell-linux64`;
  return join(hyperframesCache(), "chrome/chrome-headless-shell", folder, "chrome-headless-shell");
}

/** U-Cut fetches the browser itself only where Google publishes this build: Apple Silicon. */
export const fetchesOwnBrowser = () => process.platform === "darwin" && process.arch === "arm64";

/** The browser to render with, if there is one. */
export function browserPath(): string | undefined {
  const set = process.env.HYPERFRAMES_BROWSER_PATH ?? process.env.PRODUCER_HEADLESS_SHELL_PATH;
  return [set, ownBrowserPath(), hyperframesBrowserPath()].find(
    (path): path is string => Boolean(path) && existsSync(path as string),
  );
}

export const uvPath = () => join(toolsDir(), `uv-${uvVersion}`, "uv-aarch64-apple-darwin", "uv");
