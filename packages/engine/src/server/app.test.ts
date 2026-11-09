import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      focus: { x: 0.5, y: 0.5 },
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

  describe("sharing on a network", () => {
    const address = "http://192.168.1.5:4173";
    const headers = { host: "192.168.1.5:4173" };
    let webRoot: string;
    let shared: ReturnType<typeof createApp>["app"];

    beforeAll(() => {
      webRoot = mkdtempSync(join(tmpdir(), "ucut-web-"));
      writeFileSync(join(webRoot, "index.html"), "<!doctype html><title>U-Cut</title>");
      shared = createApp({ hosts: ["192.168.1.5:4173"], accessCode: "secret", webRoot }).app;
    });
    afterAll(() => rmSync(webRoot, { recursive: true, force: true }));

    it("lets someone in from the shared link, and keeps them in", async () => {
      const opened = await shared.request(`${address}/?code=secret`, { headers });
      expect(opened.status).toBe(302);
      expect(opened.headers.get("location")).toBe("/");
      const cookies = opened.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
      const access = cookies.find((cookie) => cookie?.startsWith("ucut_access="));
      expect(access).toBe("ucut_access=secret");

      const cookie = cookies.join("; ");
      const page = await shared.request(`${address}/`, { headers: { ...headers, cookie } });
      expect(page.status).toBe(200);
      const api = await shared.request(`${address}/api/status`, {
        headers: { ...headers, cookie },
      });
      expect(api.status).toBe(200);
    });

    it("gives a file response its cookies too", async () => {
      const page = await app.request(`${local}/index.html`, {
        headers: { host: "localhost:4173" },
      });
      expect(page.status).toBeLessThan(500);
      const served = await shared.request(`${address}/?other=1`, {
        headers: { ...headers, cookie: "ucut_access=secret" },
      });
      expect(served.status).toBe(200);
      expect(served.headers.getSetCookie().join()).toContain("ucut_session=");
    });
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

  // Anyone on the network can send "Host: localhost". Only the socket says where they are.
  const fromNetwork = { incoming: { socket: { remoteAddress: "192.168.1.20" } } };
  const fromHere = { incoming: { socket: { remoteAddress: "127.0.0.1" } } };

  it("doesn't let a network guest pass for local by faking the Host", async () => {
    const shared = createApp({ hosts: ["192.168.1.5:4173"], accessCode: "secret" }).app;
    const headers = { host: "localhost:4173" };
    expect((await shared.request(`${local}/api/catalog`, { headers }, fromNetwork)).status).toBe(
      401,
    );
    expect((await shared.request(`${local}/api/catalog`, { headers }, fromHere)).status).toBe(200);
    // A socket that has lost its address isn't trusted as this Mac.
    const unknown = { incoming: { socket: {} } };
    expect((await shared.request(`${local}/api/catalog`, { headers }, unknown)).status).toBe(401);
  });

  describe("setup", () => {
    it("lists what U-Cut downloads once, with sizes, in the catalog too", async () => {
      const response = await request("/api/setup");
      const { parts } = (await response.json()) as {
        parts: { id: string; bytes: number; required: boolean }[];
      };
      expect(parts.map((part) => part.id)).toEqual(["browser", "speech", "voice"]);
      expect(parts.find((part) => part.id === "browser")).toMatchObject({ required: true });
      expect(parts.every((part) => part.bytes > 0)).toBe(true);
      const catalog = (await (await request("/api/catalog")).json()) as { setup: unknown[] };
      expect(catalog.setup).toHaveLength(3);
    });

    it("only lets the person at this Mac start or stop a download", async () => {
      const init = { method: "POST", headers: { host: "localhost:4173" } };
      for (const path of ["/api/setup/speech", "/api/setup/speech/stop", "/api/voice/install"]) {
        expect((await app.request(`${local}${path}`, init, fromNetwork)).status).toBe(403);
      }
      const unknown = await request("/api/setup/everything", { method: "POST" });
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toEqual({ error: "U-Cut has nothing to add by that name." });
      // Names every object has, such as "constructor", aren't parts either.
      expect((await request("/api/setup/constructor", { method: "POST" })).status).toBe(404);
      // Stopping something that isn't downloading is harmless.
      expect((await request("/api/setup/speech/stop", { method: "POST" })).status).toBe(200);
    });
  });

  describe("connections", () => {
    it("shows the person at this Mac what's set up, and nobody else", async () => {
      const here = await request("/api/connections");
      expect(await here.json()).toMatchObject({
        local: true,
        choices: { write: "rules", voice: "kokoro", listen: "whisper" },
      });
      const away = await app.request(
        `${local}/api/connections`,
        { headers: { host: "localhost:4173" } },
        fromNetwork,
      );
      expect(await away.json()).toMatchObject({ local: false, services: [] });
    });

    it("only lets the person at this Mac add keys or choose services", async () => {
      const init = {
        method: "PUT",
        headers: { host: "localhost:4173", "content-type": "application/json" },
        body: JSON.stringify({ key: "sk_abcdefgh" }),
      };
      const key = await app.request(`${local}/api/connections/elevenlabs/key`, init, fromNetwork);
      expect(key.status).toBe(403);
      const choice = await app.request(
        `${local}/api/connections/choices`,
        { ...init, body: JSON.stringify({ voice: "elevenlabs" }) },
        fromNetwork,
      );
      expect(choice.status).toBe(403);
      const unconnected = await request("/api/connections/choices", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ write: "claude" }),
      });
      expect(unconnected.status).toBe(422);
      expect(await unconnected.json()).toEqual({ error: "Connect Claude first." });
    });

    it("tells the catalog what each job uses", async () => {
      const body = (await (await request("/api/catalog")).json()) as {
        local: boolean;
        uses: Record<string, string>;
      };
      expect(body).toMatchObject({ local: true, uses: { write: "rules", voice: "kokoro" } });
    });

    it("won't read with a service voice that isn't chosen here", async () => {
      const cookie = await session();
      const { id } = await createJob(cookie);
      const response = await request(`/api/jobs/${id}/speak`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ voice: "elevenlabs:abc", lines: [{ text: "Hi.", speed: 1 }] }),
      });
      expect(response.status).toBe(403);
    });

    it("won't ask Claude to write unless Claude is chosen", async () => {
      const cookie = await session();
      const { id } = await createJob(cookie);
      const response = await request(`/api/jobs/${id}/write`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "a reel about Goa",
          vibe: "chill",
          duration: 15,
          scenes: [],
        }),
      });
      expect(response.status).toBe(409);
    });
  });

  describe("handing a reel to an assistant", () => {
    async function linkFor(cookie: string, id: string) {
      const response = await request(`/api/jobs/${id}/assistant`, {
        method: "POST",
        headers: { cookie },
      });
      expect(response.status).toBe(200);
      const { link } = (await response.json()) as { link: string };
      return new URL(link).pathname.split("/").pop() ?? "";
    }

    it("makes a one-time link that reads that reel, from this Mac only", async () => {
      const cookie = await session();
      const { id } = await createJob(cookie);
      const token = await linkFor(cookie, id);
      expect(token).toMatch(/^[a-f0-9]{48}$/);
      const read = await request(`/api/assistant/${token}`);
      expect(await read.json()).toMatchObject({ kind: "photos", open: false, script: null });
      const away = await app.request(
        `${local}/api/assistant/${token}`,
        { headers: { host: "localhost:4173" } },
        fromNetwork,
      );
      expect(away.status).toBe(404);
      expect((await request(`/api/assistant/${"0".repeat(48)}`)).status).toBe(404);
    });

    it("checks a change, and says so when the reel isn't open", async () => {
      const cookie = await session();
      const { id } = await createJob(cookie);
      const token = await linkFor(cookie, id);
      const send = (change: unknown) =>
        request(`/api/assistant/${token}/change`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(change),
        });
      expect((await send({ vibe: "loud" })).status).toBe(422);
      expect((await send({})).status).toBe(422);
      expect((await send({ lines: ["A new first line."] })).status).toBe(422);
      const closed = await send({ title: "Long way home" });
      expect(closed.status).toBe(409);
    });

    it("won't make a link for someone else's reel, or from the network", async () => {
      const { id } = await createJob(await session());
      const other = await session();
      expect(
        (await request(`/api/jobs/${id}/assistant`, { method: "POST", headers: { cookie: other } }))
          .status,
      ).toBe(404);
      const away = await app.request(
        `${local}/api/jobs/${id}/assistant`,
        { method: "POST", headers: { host: "localhost:4173" } },
        fromNetwork,
      );
      expect(away.status).toBe(403);
    });
  });
});
