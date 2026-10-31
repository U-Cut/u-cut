import { platform } from "node:os";
import { extname } from "node:path";
import type { MediaItem } from "@u-cut/schema";
import { run } from "./exec.ts";
import { derived } from "./store.ts";

// Small copies for the interface. They're made once per file and shared by every reel.

export const thumbName = "thumb.jpg";
export const displayName = "display.jpg";
export const previewName = "preview.mp4";

const quiet = ["-hide_banner", "-loglevel", "error", "-y"];
const heic = (path: string) => /\.hei[cf]$/i.test(extname(path));

/** Makes a JPEG of at most `size` pixels on its long side, honouring rotation. */
async function resizePhoto(source: string, target: string, size: number) {
  if (platform() === "darwin") {
    await run("sips", [
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      "82",
      "-Z",
      String(size),
      source,
      "--out",
      target,
    ]);
    return;
  }
  await run("ffmpeg", [
    ...quiet,
    "-i",
    source,
    "-frames:v",
    "1",
    "-update",
    "1",
    "-vf",
    `scale='min(${size},iw)':-2:force_original_aspect_ratio=decrease`,
    "-q:v",
    "4",
    target,
  ]);
}

export async function grabFrame(source: string, at: number, target: string, size: number) {
  await run("ffmpeg", [
    ...quiet,
    "-ss",
    String(at),
    "-i",
    source,
    "-frames:v",
    "1",
    "-update",
    "1",
    "-vf",
    `scale=${size}:${size}:force_original_aspect_ratio=decrease,format=yuvj420p`,
    "-q:v",
    "5",
    target,
  ]);
}

function encoderArguments(): string[] {
  if (platform() === "darwin")
    return ["-c:v", "h264_videotoolbox", "-b:v", "1600k", "-allow_sw", "1"];
  return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "27"];
}

/** A small H.264 copy every browser can play, with frequent keyframes for quick seeking. */
async function makePreview(source: string, target: string, signal?: AbortSignal) {
  await run(
    "ffmpeg",
    [
      ...quiet,
      "-i",
      source,
      "-an",
      "-vf",
      "scale=540:540:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,format=yuv420p",
      ...encoderArguments(),
      "-g",
      "15",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
      "-movflags",
      "+faststart",
      target,
    ],
    { nice: 5, ...(signal ? { signal } : {}) },
  );
}

export interface DerivedPaths {
  thumb: string;
  display: string;
}

export async function deriveMedia(item: MediaItem, signal?: AbortSignal): Promise<void> {
  if (item.kind === "photo") {
    await derived(item.id, displayName, (partial) => resizePhoto(item.path, partial, 1440));
    await derived(item.id, thumbName, (partial) => resizePhoto(item.path, partial, 360));
    return;
  }
  const middle = (item.duration ?? 0) / 2;
  await derived(item.id, thumbName, (partial) => grabFrame(item.path, middle, partial, 360));
  await derived(item.id, previewName, (partial) => makePreview(item.path, partial, signal));
}

/** The sorter only needs a photo's display copy. Clips sample their own frames. */
export async function deriveForSorting(item: MediaItem): Promise<void> {
  if (item.kind !== "photo") return;
  await derived(item.id, displayName, (partial) => resizePhoto(item.path, partial, 1440));
}

/** Photos are shrunk before rendering, because 48 MP images cost Chrome far more than they show. */
export function renderPhoto(item: MediaItem): Promise<string> {
  if (!heic(item.path) && Math.max(item.w, item.h) <= 2880) return Promise.resolve(item.path);
  return derived(item.id, "render.jpg", (partial) => resizePhoto(item.path, partial, 2880));
}
