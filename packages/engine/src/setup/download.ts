import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface DownloadOptions {
  url: string;
  /** Where the finished file goes. A `.part` file beside it holds what has arrived so far. */
  to: string;
  sha256: string;
  bytes: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Called while waiting to try again after the connection dropped. */
  onWaiting?: (seconds: number) => void;
  fetchImpl?: typeof fetch;
  /** How many times to carry on after a dropped connection before giving up. */
  retries?: number;
  /** Gives up on a connection that sends nothing for this long. */
  stallMs?: number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** A failure that trying again won't fix, such as a missing file or a damaged download. */
export class DownloadError extends Error {
  constructor(
    message: string,
    readonly retry: boolean,
  ) {
    super(message);
  }
}

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 ** 2)} MB`;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export async function sha256Of(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

const sizeOf = (path: string) => (existsSync(path) ? statSync(path).size : 0);

/** One request, carrying on from what's already in the `.part` file. */
async function fetchRest(part: string, options: DownloadOptions): Promise<void> {
  const have = sizeOf(part);
  if (have >= options.bytes) return;
  const attempt = new AbortController();
  const stop = () => attempt.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", stop, { once: true });
  let stalled = false;
  let timer: NodeJS.Timeout | undefined;
  const watch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      attempt.abort();
    }, options.stallMs ?? 30_000);
  };
  try {
    watch();
    const response = await (options.fetchImpl ?? fetch)(options.url, {
      headers: have > 0 ? { Range: `bytes=${have}-` } : {},
      signal: attempt.signal,
      redirect: "follow",
    });
    if (response.status === 416) {
      // The server says there's nothing left to send, so start again from the beginning.
      await rm(part, { force: true });
      throw new DownloadError("The download didn't line up, so it's starting again.", true);
    }
    if (!response.ok || !response.body) {
      throw new DownloadError(
        `The download server answered ${response.status}.`,
        response.status >= 500 || response.status === 429,
      );
    }
    // A server that ignores the range sends the whole file, so it replaces what was there.
    const resumed = response.status === 206;
    let done = resumed ? have : 0;
    options.onProgress?.(done, options.bytes);
    const count = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        done += chunk.length;
        watch();
        options.onProgress?.(done, options.bytes);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
      count,
      createWriteStream(part, { flags: resumed ? "a" : "w" }),
    );
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (error instanceof DownloadError) throw error;
    throw new DownloadError(
      stalled ? "The connection stopped sending." : "The connection dropped.",
      true,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", stop);
  }
}

/**
 * Downloads a file and checks it against its checksum. It survives a dropped connection by
 * carrying on from where it stopped, both within one run and the next time it's asked.
 */
export async function download(options: DownloadOptions): Promise<void> {
  const part = `${options.to}.part`;
  const wait = options.wait ?? sleep;
  const retries = options.retries ?? 8;
  await mkdir(dirname(options.to), { recursive: true });
  if (sizeOf(part) > options.bytes) await rm(part, { force: true });
  let failures = 0;
  let restarted = false;
  for (;;) {
    options.signal?.throwIfAborted();
    try {
      await fetchRest(part, options);
      // A connection can close cleanly before the end. That counts as a drop, with its back-off.
      if (sizeOf(part) < options.bytes) {
        throw new DownloadError("The connection closed before the file finished.", true);
      }
    } catch (error) {
      if (!(error instanceof DownloadError) || !error.retry || failures >= retries) {
        const kept = sizeOf(part);
        const detail =
          error instanceof DownloadError && error.retry && kept > 0
            ? ` ${megabytes(kept)} of ${megabytes(options.bytes)} is saved, so trying again carries on from there.`
            : "";
        throw new DownloadError(`${(error as Error).message}${detail}`, false);
      }
      failures += 1;
      const seconds = Math.min(30, 2 ** failures);
      options.onWaiting?.(seconds);
      await wait(seconds * 1000, options.signal);
      continue;
    }
    if (sizeOf(part) === options.bytes && (await sha256Of(part)) === options.sha256) break;
    await rm(part, { force: true });
    // One damaged download can be bad luck. Two in a row means the file itself has changed.
    if (restarted) {
      throw new DownloadError(
        "The downloaded file didn't match what U-Cut expects, so it wasn't used. Please report this.",
        false,
      );
    }
    restarted = true;
  }
  await rename(part, options.to);
}
