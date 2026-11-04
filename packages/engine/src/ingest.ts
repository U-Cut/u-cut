import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { MediaItem } from "@u-cut/schema";
import { mediaKind, probe } from "./probe.ts";
import { storeFile } from "./store.ts";

export interface FoundFile {
  path: string;
  kind: "photo" | "video";
}

export interface Skipped {
  name: string;
  reason: string;
}

async function* walk(folder: string): AsyncGenerator<string> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

/**
 * Lists the usable media under some paths. Live Photos arrive as a still plus a short video with
 * the same name, and only the still is kept, so each moment appears once.
 */
export async function findMedia(
  paths: string[],
): Promise<{ files: FoundFile[]; skipped: Skipped[] }> {
  const all: string[] = [];
  for (const path of paths) {
    const info = await stat(path).catch(() => undefined);
    if (!info) throw new Error(`There's nothing at ${path}.`);
    if (info.isDirectory()) for await (const file of walk(path)) all.push(file);
    else all.push(path);
  }

  const key = (path: string) => join(path, "..", basename(path, extname(path))).toLowerCase();
  const stills = new Set(all.filter((path) => mediaKind(extname(path)) === "photo").map(key));
  const files: FoundFile[] = [];
  const skipped: Skipped[] = [];
  for (const path of all.sort()) {
    const name = basename(path);
    const kind = mediaKind(extname(path));
    if (!kind) skipped.push({ name, reason: "isn't a photo or video" });
    else if (kind === "video" && stills.has(key(path)))
      skipped.push({ name, reason: "is the moving part of a Live Photo" });
    else files.push({ path, kind });
  }
  return { files, skipped };
}

export async function ingestFile(file: FoundFile): Promise<MediaItem> {
  const stored = await storeFile(file.path);
  return probe(stored.hash, stored.path, file.kind);
}

/** Stores and reads every file, a few at a time. A bad file is skipped, not fatal. */
export async function ingest(
  paths: string[],
  options: { concurrency?: number; onItem?: (done: number, total: number) => void } = {},
): Promise<{ items: MediaItem[]; skipped: Skipped[]; names: Record<string, string> }> {
  const { files, skipped } = await findMedia(paths);
  const items = new Map<string, MediaItem>();
  const names: Record<string, string> = {};
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (let file = files[next++]; file; file = files[next++]) {
      try {
        const item = await ingestFile(file);
        items.set(item.id, item);
        names[item.id] ??= basename(file.path);
      } catch (error) {
        skipped.push({ name: basename(file.path), reason: (error as Error).message });
      }
      done += 1;
      options.onItem?.(done, files.length);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 4 }, worker));
  const sorted = [...items.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { items: sorted, skipped, names };
}
