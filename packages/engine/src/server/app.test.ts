import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

const validPlan = {
  schemaVersion: 1,
  template: "travel-montage",
  vibe: "chill",
  aspect: "9:16",
  fps: 30,
  seed: 1,
  duration: 2,
  music: { src: "chill.m4a", bpm: 84, start: 0, length: 60 },
  grade: { temp: 0, contrast: 0, sat: 0 },
  shots: [
    {
      media: "a",
      in: 0,
      out: 2,
      start: 0,
      end: 2,
      motion: {
        type: "none",
        from: { x: 0.5, y: 0.5, scale: 1 },
        to: { x: 0.5, y: 0.5, scale: 1 },
      },
      crop: { x: 0, y: 0, w: 1, h: 1 },
    },
  ],
  texts: [],
  transitions: [],
  sfx: [],
};

describe("server", () => {
  let home: string;
  const { app } = createApp({ hosts: ["localhost:4173"] });

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), "ucut-app-"));
    process.env.UCUT_HOME = home;
  });
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  const local = "http://localhost:4173";
  const request = (path: string, init: RequestInit = {}) =>
    app.request(`${local}${path}`, {
      ...init,
      headers: { host: "localhost:4173", ...(init.headers as Record<string, string>) },
    });

  async function session() {
    const response = await request("/api/catalog");
    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  async function createJob(cookie: string) {
    const response = await request("/api/jobs", { method: "POST", headers: { cookie } });
    return (await response.json()) as { id: string };
  }

  it("serves the catalog of templates and tracks", async () => {
    const body = (await (await request("/api/catalog")).json()) as {
      templates: { manifest: { id: string } }[];
      tracks: { vibe: string; beats: { times: number[] } }[];
    };
    expect(body.templates.map((template) => template.manifest.id)).toContain("travel-montage");
    expect(body.tracks).toHaveLength(4);
    expect(body.tracks[0]?.beats.times.length).toBeGreaterThan(50);
  });

  it("refuses an unknown Host, which stops DNS rebinding", async () => {
    const response = await app.request("http://evil.example/api/catalog", {
      headers: { host: "evil.example" },
    });
    expect(response.status).toBe(403);
  });

  it("refuses writes from another website", async () => {
    const response = await request("/api/jobs", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
  });

  it("asks for the access code from other machines", async () => {
    const shared = createApp({ hosts: ["192.168.1.5:4173"], accessCode: "secret" }).app;
    const url = "http://192.168.1.5:4173/api/catalog";
    const headers = { host: "192.168.1.5:4173" };
    expect((await shared.request(url, { headers })).status).toBe(401);
    expect((await shared.request(`${url}?code=wrong`, { headers })).status).toBe(401);
    expect((await shared.request(`${url}?code=secret`, { headers })).status).toBe(200);
  });

  it("keeps one person's reel private from another", async () => {
    const mine = await session();
    const theirs = await session();
    expect(mine).not.toBe(theirs);
    const job = await createJob(mine);
    const own = await request(`/api/jobs/${job.id}`, { headers: { cookie: mine } });
    expect(own.status).toBe(200);
    const other = await request(`/api/jobs/${job.id}`, { headers: { cookie: theirs } });
    expect(other.status).toBe(404);
  });

  it("rejects a file that isn't media, by name", async () => {
    const cookie = await session();
    const job = await createJob(cookie);
    const response = await request(`/api/jobs/${job.id}/media/notes.txt`, {
      method: "PUT",
      headers: { cookie },
      body: "hello",
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "notes.txt isn't a photo or video." });
  });

  it("explains a bad plan in plain sentences", async () => {
    const cookie = await session();
    const job = await createJob(cookie);
    const response = await request(`/api/jobs/${job.id}/plan`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...validPlan, fps: "fast" }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "plan: fps must be a number." });
  });

  it("saves a valid plan", async () => {
    const cookie = await session();
    const job = await createJob(cookie);
    const response = await request(`/api/jobs/${job.id}/plan`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(validPlan),
    });
    expect(response.status).toBe(200);
  });

  it("won't export with no plan", async () => {
    const cookie = await session();
    const job = await createJob(cookie);
    const response = await request(`/api/jobs/${job.id}/export`, {
      method: "POST",
      headers: { cookie },
    });
    expect(response.status).toBe(409);
  });

  it("doesn't leak files outside the web folder", async () => {
    const response = await request("/..%2f..%2f..%2fpackage.json");
    expect(await response.text()).not.toContain('"u-cut"');
  });

  it("refuses a malformed media hash", async () => {
    expect((await request("/media/not-a-hash/thumb")).status).toBe(404);
  });
});
