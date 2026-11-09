import { mkdir } from "node:fs/promises";
import { cpus, platform, totalmem } from "node:os";
import { run } from "./exec.ts";
import { hf } from "./hf.ts";
import { homeDir } from "./paths.ts";
import { speechReady } from "./recording.ts";
import { bundledRuntime } from "./runtime.ts";
import { freeDisk, minimumFreeDisk } from "./server/capacity.ts";
import { browserPath, onPath } from "./setup/index.ts";
import { voiceReady } from "./voice.ts";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

async function version(command: string): Promise<string | undefined> {
  const output = await run(command, ["-version"]).catch(() => undefined);
  return output?.split("\n")[0]?.split(" ").slice(0, 3).join(" ");
}

async function chrome(): Promise<boolean> {
  const output = await hf(["doctor", "--json"], { timeoutMs: 60_000 }).catch(() => "{}");
  const report = JSON.parse(output.slice(output.indexOf("{"))) as {
    checks?: { name: string; ok: boolean }[];
  };
  return report.checks?.find((check) => /chrome/i.test(check.name))?.ok ?? false;
}

/** Plain answers to "why won't it work on my machine?" */
export async function doctor(): Promise<Check[]> {
  const major = Number(process.versions.node.split(".")[0]);
  const ffmpeg = await version("ffmpeg");
  const ffprobe = await version("ffprobe");
  await mkdir(homeDir(), { recursive: true });
  const disk = await freeDisk(homeDir());
  // Looking for the file is instant. Asking HyperFrames also finds a Chrome installed elsewhere.
  const ownBrowser = Boolean(browserPath());
  const hasChrome = ownBrowser || (await chrome());
  const app = bundledRuntime();
  const whisper = process.env.HYPERFRAMES_WHISPER_PATH ?? onPath("whisper-cli");
  return [
    {
      name: "Node",
      ok: major >= 22,
      detail: major >= 22 ? process.version : `${process.version}. U-Cut needs 22 or newer.`,
    },
    {
      name: "FFmpeg",
      ok: Boolean(ffmpeg),
      detail: ffmpeg
        ? `${ffmpeg}${app ? " (inside the app)" : ""}`
        : "Not found. Install it with: brew install ffmpeg",
    },
    {
      name: "ffprobe",
      ok: Boolean(ffprobe),
      detail: ffprobe ?? "Not found. It comes with FFmpeg.",
    },
    {
      name: "Rendering browser",
      ok: hasChrome,
      detail: ownBrowser
        ? "Ready"
        : hasChrome
          ? "Using the Chrome on this computer, which exports more slowly. Run: ucut setup"
          : "Not installed. Run: ucut setup",
    },
    {
      name: "Speech",
      ok: true,
      detail: !whisper
        ? "Optional, for captions. It needs whisper-cli: brew install whisper-cpp"
        : speechReady()
          ? "Ready"
          : "Optional, for captions on screen recordings. Run: ucut setup --speech",
    },
    {
      name: "Voice",
      ok: true,
      detail: voiceReady() ? "Ready" : "Optional, for written reels. Run: ucut setup --voice",
    },
    { name: "Disk", ok: disk > minimumFreeDisk, detail: `${gigabytes(disk)} free in ${homeDir()}` },
    {
      name: "This computer",
      ok: true,
      detail: `${platform()}, ${cpus().length} cores, ${gigabytes(totalmem())} memory`,
    },
  ];
}
