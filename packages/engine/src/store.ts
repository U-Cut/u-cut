import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { storeDir } from "./paths.ts";

// Every file is stored once, named by its content. The same photo in two reels, or from two
// people, costs one copy and one round of analysis.

const hashLength = 32;

export function storedFolder(hash: string): string {
  return join(storeDir(), hash.slice(0, 2), hash);
}

export const originalPath = (hash: string, extension: string) =>
  join(storedFolder(hash), `original${extension.toLowerCase()}`);

export function isHash(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value);
}

export async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex").slice(0, hashLength);
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** Stores a file already on this disk. On APFS this is a clone, so it takes no extra space. */
export async function storeFile(path: string): Promise<{ hash: string; path: string }> {
  const hash = await hashFile(path);
  const target = originalPath(hash, extname(path));
  if (await exists(target)) return { hash, path: target };
  await mkdir(dirname(target), { recursive: true });
  const partial = `${target}.${randomUUID()}.partial`;
  await copyFile(path, partial, constants.COPYFILE_FICLONE);
  await rename(partial, target);
  return { hash, path: target };
}

/** Stores an upload, hashing it as it arrives so nothing is read twice. */
export async function storeStream(
  body: Readable,
  name: string,
): Promise<{ hash: string; path: string }> {
  await mkdir(storeDir(), { recursive: true });
  const partial = join(storeDir(), `${randomUUID()}.partial`);
  const digest = createHash("sha256");
  body.on("data", (chunk: Buffer) => digest.update(chunk));
  try {
    await pipeline(body, createWriteStream(partial));
    const hash = digest.digest("hex").slice(0, hashLength);
    const target = originalPath(hash, extname(name));
    await mkdir(dirname(target), { recursive: true });
    if (await exists(target)) await rm(partial);
    else await rename(partial, target);
    return { hash, path: target };
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

/** Builds a derived file once, even when several requests ask at the same moment. */
const building = new Map<string, Promise<string>>();

export function derived(
  hash: string,
  name: string,
  build: (partial: string) => Promise<void>,
): Promise<string> {
  const target = join(storedFolder(hash), name);
  const running = building.get(target);
  if (running) return running;
  const work = (async () => {
    if (await exists(target)) return target;
    await mkdir(dirname(target), { recursive: true });
    const partial = join(dirname(target), `${randomUUID()}.partial${extname(name)}`);
    try {
      await build(partial);
      await rename(partial, target);
      return target;
    } finally {
      await rm(partial, { force: true });
    }
  })().finally(() => building.delete(target));
  building.set(target, work);
  return work;
}
