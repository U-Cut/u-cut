import type { MediaItem } from "@u-cut/schema";
import exifr from "exifr";
import { run } from "./exec.ts";

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  side_data_list?: { rotation?: number }[];
  tags?: { rotate?: string };
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; tags?: Record<string, string> };
}

const photoExtensions = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"]);
const videoExtensions = new Set([".mov", ".mp4", ".m4v", ".webm", ".mkv"]);

export function mediaKind(extension: string): "photo" | "video" | undefined {
  const lower = extension.toLowerCase();
  if (photoExtensions.has(lower)) return "photo";
  if (videoExtensions.has(lower)) return "video";
  return undefined;
}

function rotationToOrientation(degrees: number): number {
  const turn = ((degrees % 360) + 360) % 360;
  return turn === 90 ? 6 : turn === 180 ? 3 : turn === 270 ? 8 : 1;
}

async function ffprobe(path: string): Promise<FfprobeOutput> {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    path,
  ]);
  return JSON.parse(output) as FfprobeOutput;
}

async function photoMetadata(path: string) {
  const data = (await exifr
    .parse(path, { gps: true, tiff: true, exif: true, translateValues: false })
    .catch(() => undefined)) as
    | {
        DateTimeOriginal?: Date;
        latitude?: number;
        longitude?: number;
        Orientation?: number;
        ImageWidth?: number;
        ImageHeight?: number;
        ExifImageWidth?: number;
        ExifImageHeight?: number;
      }
    | undefined;
  return data;
}

function validDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function probe(
  hash: string,
  path: string,
  kind: "photo" | "video",
): Promise<MediaItem> {
  const base = {
    id: hash,
    path,
    quality: { sharpness: null, exposure: null, faces: null, dupGroup: null },
    labels: [],
    moment: null,
  };
  const info = await ffprobe(path);
  const video = info.streams?.find((stream) => stream.codec_type === "video");
  if (!video?.width || !video.height) {
    throw new Error("U-Cut can't read this file as a photo or video.");
  }

  if (kind === "video") {
    const rotation = video.side_data_list?.find((data) => data.rotation !== undefined)?.rotation;
    const orientation = rotationToOrientation(rotation ?? Number(video.tags?.rotate ?? 0));
    const sideways = orientation === 6 || orientation === 8;
    const duration = Number(info.format?.duration ?? video.duration ?? 0);
    if (!(duration > 0)) throw new Error("This video has no length, so it may be damaged.");
    const takenAt = validDate(
      info.format?.tags?.["com.apple.quicktime.creationdate"] ?? info.format?.tags?.creation_time,
    );
    return {
      ...base,
      kind,
      w: sideways ? video.height : video.width,
      h: sideways ? video.width : video.height,
      duration: Math.round(duration * 1000) / 1000,
      orientation,
      ...(takenAt ? { takenAt } : {}),
    };
  }

  const exif = await photoMetadata(path);
  const orientation =
    exif?.Orientation && exif.Orientation >= 1 && exif.Orientation <= 8 ? exif.Orientation : 1;
  const sideways = orientation >= 5;
  const takenAt = validDate(exif?.DateTimeOriginal);
  const w = exif?.ExifImageWidth ?? exif?.ImageWidth ?? video.width;
  const h = exif?.ExifImageHeight ?? exif?.ImageHeight ?? video.height;
  return {
    ...base,
    kind,
    w: sideways ? h : w,
    h: sideways ? w : h,
    orientation,
    ...(takenAt ? { takenAt } : {}),
    ...(typeof exif?.latitude === "number" && typeof exif.longitude === "number"
      ? { gps: { lat: exif.latitude, lon: exif.longitude } }
      : {}),
  };
}
