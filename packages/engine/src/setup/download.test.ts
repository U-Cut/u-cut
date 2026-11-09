import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DownloadError, download } from "./download.ts";

const file = randomBytes(256 * 1024);
const sha256 = createHash("sha256").update(file).digest("hex");
const noWait = async () => {};

interface Behaviour {
  /** Stop sending after this many bytes, on the first request only. */
  dropAfter?: number;
  ignoreRange?: boolean;
  /** Send half the file with no length, then end cleanly, as a flaky proxy can. */
  shortBody?: boolean;
  status?: number;
  body?: Buffer;
}

let behaviour: Behaviour = {};
let requests: (string | undefined)[] = [];
let server: Server;
let url = "";

beforeAll(async () => {
  server = createServer((request, response) => {
    requests.push(request.headers.range);
    const body = behaviour.body ?? file;
    if (behaviour.status) {
      response.writeHead(behaviour.status).end();
      return;
    }
    const range = behaviour.ignoreRange ? undefined : request.headers.range;
    const start = range ? Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0) : 0;
    if (start >= body.length) {
      response.writeHead(416).end();
      return;
    }
    if (behaviour.shortBody) {
      response.writeHead(range ? 206 : 200);
      response.end(body.subarray(start, start + Math.ceil((body.length - start) / 2)));
      return;
    }
    response.writeHead(range ? 206 : 200, { "content-length": body.length - start });
    const rest = body.subarray(start);
    if (behaviour.dropAfter !== undefined && requests.length === 1) {
      response.write(rest.subarray(0, behaviour.dropAfter));
      // Cutting the socket mid-body is what a dropped Wi-Fi connection looks like.
      setTimeout(() => response.socket?.destroy(), 20);
      return;
    }
    response.end(rest);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/file.bin`;
});

afterAll(() => {
  server.close();
});

let folder = "";
afterEach(() => {
  behaviour = {};
  requests = [];
  if (folder) rmSync(folder, { recursive: true, force: true });
});

const target = () => {
  folder = mkdtempSync(join(tmpdir(), "ucut-download-"));
  return join(folder, "nested", "file.bin");
};

describe("download", () => {
  it("fetches a file, checks it, and reports progress up to its size", async () => {
    const to = target();
    const seen: number[] = [];
    await download({
      url,
      to,
      sha256,
      bytes: file.length,
      onProgress: (done) => seen.push(done),
      wait: noWait,
    });
    expect(readFileSync(to).equals(file)).toBe(true);
    expect(seen.at(-1)).toBe(file.length);
    expect(existsSync(`${to}.part`)).toBe(false);
  });

  it("carries on from a part left by an earlier run, asking only for the rest", async () => {
    const to = target();
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(`${to}.part`, file.subarray(0, 100_000));
    await download({ url, to, sha256, bytes: file.length, wait: noWait });
    expect(readFileSync(to).equals(file)).toBe(true);
    expect(requests).toEqual(["bytes=100000-"]);
  });

  it("survives a dropped connection by resuming where it stopped", async () => {
    const to = target();
    behaviour = { dropAfter: 64 * 1024 };
    const waits: number[] = [];
    await download({
      url,
      to,
      sha256,
      bytes: file.length,
      onWaiting: (seconds) => waits.push(seconds),
      wait: noWait,
    });
    expect(readFileSync(to).equals(file)).toBe(true);
    expect(waits.length).toBeGreaterThan(0);
    expect(requests[0]).toBeUndefined();
    expect(requests[1]).toMatch(/^bytes=\d+-$/);
  });

  it("starts over when the server ignores the range and sends the whole file", async () => {
    const to = target();
    behaviour = { ignoreRange: true };
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(`${to}.part`, Buffer.alloc(5000, 1));
    await download({ url, to, sha256, bytes: file.length, wait: noWait });
    expect(readFileSync(to).equals(file)).toBe(true);
  });

  it("refuses a file that doesn't match its checksum, and keeps nothing", async () => {
    const to = target();
    behaviour = { body: randomBytes(file.length) };
    const failure = await download({ url, to, sha256, bytes: file.length, wait: noWait }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(DownloadError);
    expect((failure as Error).message).toMatch(/didn't match/);
    expect(existsSync(to)).toBe(false);
    expect(existsSync(`${to}.part`)).toBe(false);
  });

  it("gives up at once on a missing file, in a plain sentence", async () => {
    const to = target();
    behaviour = { status: 404 };
    await expect(download({ url, to, sha256, bytes: file.length, wait: noWait })).rejects.toThrow(
      "The download server answered 404.",
    );
    expect(requests).toHaveLength(1);
  });

  it("says how much is kept when the connection never comes back", async () => {
    const to = target();
    behaviour = { dropAfter: 32 * 1024 };
    const failing: typeof fetch = async (input, init) => {
      if (requests.length >= 1) throw new TypeError("fetch failed");
      return fetch(input, init);
    };
    const failure = await download({
      url,
      to,
      sha256,
      bytes: file.length,
      retries: 2,
      fetchImpl: failing,
      wait: noWait,
    }).catch((error: unknown) => error as Error);
    expect((failure as Error).message).toMatch(/is saved, so trying again carries on from there/);
    expect(statSync(`${to}.part`).size).toBeGreaterThan(0);
  });

  it("backs off and gives up on a server that keeps ending early, instead of looping", async () => {
    const to = target();
    behaviour = { shortBody: true };
    const waits: number[] = [];
    const failure = await download({
      url,
      to,
      sha256,
      bytes: file.length,
      retries: 3,
      onWaiting: (seconds) => waits.push(seconds),
      wait: noWait,
    }).catch((error: unknown) => error as Error);
    expect((failure as Error).message).toMatch(/closed before the file finished/);
    expect(waits).toEqual([2, 4, 8]);
    // Each try asks only for the rest, so it never starts over.
    expect(requests.slice(1).every((range) => range?.startsWith("bytes="))).toBe(true);
  });

  it("stops when asked, keeping what arrived", async () => {
    const to = target();
    const controller = new AbortController();
    controller.abort(new Error("Stopped."));
    await expect(
      download({ url, to, sha256, bytes: file.length, signal: controller.signal, wait: noWait }),
    ).rejects.toThrow("Stopped.");
  });
});
