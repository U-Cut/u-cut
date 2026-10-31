import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { Context } from "hono";

export const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const immutable = "public, max-age=31536000, immutable";

interface SendOptions {
  type: string;
  /** Files named by their content never change, so browsers can keep them for good. */
  cacheForever?: boolean;
  download?: string;
}

/** Sends a file with Range support, which Safari requires for video. */
export async function sendFile(c: Context, path: string, options: SendOptions): Promise<Response> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) return c.json({ error: "That file isn't here any more." }, 404);

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": options.type,
    "Cache-Control": options.cacheForever ? immutable : "no-cache",
  });
  if (options.download) {
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(options.download)}`,
    );
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start >= info.size || start > end) {
      headers.set("Content-Range", `bytes */${info.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(createReadStream(path, { start, end }));
    return new Response(stream as ReadableStream, { status: 206, headers });
  }

  headers.set("Content-Length", String(info.size));
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers });
}
