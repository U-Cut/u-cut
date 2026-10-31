import { run } from "./exec.ts";

const target = { loudness: -14, truePeak: -2, range: 11 };
// Encoding to AAC can raise peaks, so the limiter sits a little below the −1 dBTP spec.
const limiter = "alimiter=limit=0.76:attack=2:release=60:level=false:asc=1";
const quiet = ["-hide_banner", "-nostats"];

interface LoudnessReport {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** Two-pass loudness mastering. The video stream is copied, so this takes seconds. */
export async function master(input: string, output: string, signal?: AbortSignal): Promise<void> {
  const filter = `loudnorm=I=${target.loudness}:TP=${target.truePeak}:LRA=${target.range}`;
  const options = signal ? { signal } : {};
  const measured = await measure(input, filter, options);
  await run(
    "ffmpeg",
    [
      ...quiet,
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-c:v",
      "copy",
      "-af",
      `${filter}:linear=true:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset},${limiter},aresample=48000`,
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      output,
    ],
    options,
  );
}

async function measure(input: string, filter: string, options: { signal?: AbortSignal }) {
  let log = "";
  await run(
    "ffmpeg",
    [...quiet, "-i", input, "-af", `${filter}:print_format=json`, "-vn", "-f", "null", "-"],
    {
      ...options,
      onLine: (line) => {
        log += `${line}\n`;
      },
    },
  );
  const json = log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1);
  return JSON.parse(json) as LoudnessReport;
}

export interface SpecReport {
  ok: boolean;
  problems: string[];
  width: number;
  height: number;
  duration: number;
  fps: number;
}

interface VerifyProbe {
  streams?: {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    pix_fmt?: string;
  }[];
  format?: { duration?: string };
}

/** Checks a finished file against the output spec in the brief. */
export async function verifyOutput(
  path: string,
  expected: { width: number; height: number; duration: number; fps: number },
): Promise<SpecReport> {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    path,
  ]);
  const info = JSON.parse(output) as VerifyProbe;
  const video = info.streams?.find((stream) => stream.codec_type === "video");
  const audio = info.streams?.find((stream) => stream.codec_type === "audio");
  const [numerator = 0, denominator = 1] = (video?.r_frame_rate ?? "0/1").split("/").map(Number);
  const fps = numerator / denominator;
  const duration = Number(info.format?.duration ?? 0);
  const problems: string[] = [];
  if (video?.codec_name !== "h264") problems.push(`Video is ${video?.codec_name}, not H.264.`);
  if (video?.pix_fmt !== "yuv420p") problems.push(`Pixels are ${video?.pix_fmt}, not 8-bit 4:2:0.`);
  if (audio?.codec_name !== "aac") problems.push("Audio isn't AAC.");
  if (video?.width !== expected.width || video?.height !== expected.height) {
    problems.push(
      `Size is ${video?.width}×${video?.height}, not ${expected.width}×${expected.height}.`,
    );
  }
  if (Math.abs(duration - expected.duration) > 0.12)
    problems.push(`Length is ${duration} s, not ${expected.duration} s.`);
  if (Math.abs(fps - expected.fps) > 0.01)
    problems.push(`Frame rate is ${fps}, not ${expected.fps}.`);
  return {
    ok: problems.length === 0,
    problems,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    duration,
    fps,
  };
}
