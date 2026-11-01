import { randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { decodePrint, duplicateOf, type Printed } from "@u-cut/classify";
import { Demo, EditPlan, type MediaItem, type StyleRecipe, validate } from "@u-cut/schema";
import { type Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import {
  addLearned,
  applySignals,
  firstPrint,
  loadLearned,
  readSignals,
  sceneModel,
} from "../analyse.ts";
import {
  deriveMedia,
  deriveRecording,
  displayName,
  previewName,
  screenName,
  thumbName,
} from "../derive.ts";
import { ingest } from "../ingest.ts";
import {
  fontCss,
  fontsDir,
  loadScenes,
  loadTemplates,
  loadTracks,
  musicDir,
  samplesDir,
  trackBeats,
} from "../library.ts";
import { defaultExcludedScenes } from "../make.ts";
import { homeDir, jobsDir, repoRoot } from "../paths.ts";
import { mediaKind, probe } from "../probe.ts";
import { readRecording } from "../recording.ts";
import { type Quality, renderKey, renderPlan } from "../render.ts";
import { isHash, storedFolder, storeStream } from "../store.ts";
import { type Study, studyReel } from "../study.ts";
import { vision } from "../vision.ts";
import {
  type Capacity,
  freeDisk,
  measureCapacity,
  minimumFreeDisk,
  workersFor,
} from "./capacity.ts";
import { EventHub, type ServerEvent } from "./events.ts";
import { contentTypes, sendFile } from "./files.ts";
import { Scheduler } from "./scheduler.ts";

export interface Job {
  id: string;
  owner: string;
  createdAt: string;
  items: MediaItem[];
  plan: EditPlan | null;
  excludedScenes: string[];
  /** The style studied from a reel. The reel itself is deleted straight after. */
  recipe: StyleRecipe | null;
  /** Set when this job is a screen recording rather than a pile of photos. */
  demo: Demo | null;
}

interface RenderState {
  id: string;
  job: string;
  owner: string;
  state: "queued" | "running" | "done" | "failed" | "cancelled";
  progress: number;
  stage?: string;
  path?: string;
  cached?: boolean;
  error?: string;
  duration: number;
  name: string;
}

export interface ServerOptions {
  /** Hosts allowed to reach this server. Anything else is refused. */
  hosts: string[];
  /** Required from anyone not on this machine. */
  accessCode?: string;
  capacity?: Capacity;
  webRoot?: string;
  maxUploadBytes?: number;
}

const sessionCookie = "ucut_session";
const accessCookie = "ucut_access";
const defaultMaxUpload = 8 * 1024 ** 3;
const qualities: Quality[] = ["draft", "looks", "delivery"];

const loopback = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
const safeName = (name: string) =>
  decodeURIComponent(name)
    .replace(/[/\\\0]/g, "_")
    .slice(0, 200);

export function createApp(options: ServerOptions) {
  const app = new Hono<{ Variables: { session: string } }>();
  const capacity = options.capacity ?? measureCapacity();
  const hub = new EventHub();
  const jobs = new Map<string, Job>();
  const renders = new Map<string, RenderState>();
  const analysis = new Scheduler<void>({ slots: () => capacity.analysisSlots });
  const rendering = new Scheduler<void>({ slots: () => capacity.renderSlots });
  const studying = new Scheduler<Study>({ slots: () => 1 });
  // Listening uses every core, so recordings take turns.
  const listening = new Scheduler<void>({ slots: () => 1 });
  const webRoot = options.webRoot ?? join(repoRoot, "apps/web/dist");
  const maxUpload = options.maxUploadBytes ?? defaultMaxUpload;
  /** Seconds of work per second of finished reel, learned from real renders on this machine. */
  let renderCost = 1.6;
  let samples: MediaItem[] = [];
  const jobPrints = new Map<string, Printed[]>();

  // A website open in the same browser can reach localhost. Checking Host stops DNS rebinding,
  // and checking Origin stops other sites from posting here.
  app.use("*", async (c, next) => {
    const host = c.req.header("host") ?? "";
    if (!options.hosts.includes(host) && !loopback(host)) {
      return c.json({ error: "This address isn't allowed." }, 403);
    }
    const origin = c.req.header("origin");
    if (c.req.method !== "GET" && origin && new URL(origin).host !== host) {
      return c.json({ error: "Requests from other sites aren't allowed." }, 403);
    }

    if (options.accessCode && !loopback(host)) {
      const code = c.req.query("code");
      if (code === options.accessCode) {
        setCookie(c, accessCookie, code, { httpOnly: true, sameSite: "Strict", path: "/" });
        // Lands on a clean address, so the code isn't left on screen or in history.
        if (c.req.path === "/") return c.redirect("/");
      } else if (getCookie(c, accessCookie) !== options.accessCode) {
        return c.json({ error: "Ask the person running U-Cut for the access link." }, 401);
      }
    }

    let session = getCookie(c, sessionCookie);
    if (!session) {
      session = randomBytes(16).toString("hex");
      setCookie(c, sessionCookie, session, {
        httpOnly: true,
        sameSite: "Strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    c.set("session", session);
    await next();
  });

  const persist = async (job: Job) => {
    const folder = join(jobsDir(), job.id);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "job.json"), JSON.stringify(job));
  };

  async function loadJob(id: string): Promise<Job | undefined> {
    const known = jobs.get(id);
    if (known) return known;
    if (!/^[a-f0-9-]{36}$/.test(id)) return undefined;
    const text = await readFile(join(jobsDir(), id, "job.json"), "utf8").catch(() => undefined);
    if (!text) return undefined;
    const job = {
      excludedScenes: defaultExcludedScenes,
      recipe: null,
      demo: null,
      ...(JSON.parse(text) as Partial<Job>),
    } as Job;
    jobs.set(id, job);
    return job;
  }

  async function ownedJob(c: Context<{ Variables: { session: string } }>) {
    const job = await loadJob(c.req.param("id") ?? "");
    return job && job.owner === c.get("session") ? job : undefined;
  }

  const notFound = (c: Context) => c.json({ error: "That reel isn't here." }, 404);

  function publicItem(item: MediaItem) {
    const { path: _path, ...rest } = item;
    return { ...rest, name: item.path.split("/").pop() ?? "" };
  }

  function publicJob(job: Job) {
    return {
      id: job.id,
      createdAt: job.createdAt,
      items: job.items.map(publicItem),
      plan: job.plan,
      excludedScenes: job.excludedScenes,
      recipe: job.recipe,
      demo: job.demo,
    };
  }

  /** Near-duplicates are found as photos arrive, by comparing each new one to the job so far. */
  function findDuplicates(job: Job, item: MediaItem, print: string): MediaItem[] {
    const seen = jobPrints.get(job.id) ?? [];
    jobPrints.set(job.id, seen);
    const vector = decodePrint(print);
    const match = duplicateOf(
      vector,
      seen.filter((other) => other.id !== item.id),
    );
    seen.push({ id: item.id, print: vector, group: match ? (match.group ?? match.id) : null });
    if (!match) return [];
    const group = match.group ?? match.id;
    match.group = group;
    return [item.id, match.id].flatMap((id) => {
      const member = job.items.find((candidate) => candidate.id === id);
      if (!member) return [];
      const updated = { ...member, quality: { ...member.quality, dupGroup: group } };
      job.items = job.items.map((candidate) => (candidate.id === id ? updated : candidate));
      return [updated];
    });
  }

  /** Small copies and sorting happen in the fair queue, so a huge upload can't slow anyone down. */
  function prepare(job: Job, item: MediaItem) {
    analysis
      .submit({
        id: `prepare-${item.id}`,
        owner: job.owner,
        run: ({ signal }) => deriveMedia(item, signal),
      })
      .then(async () => {
        const frames = await readSignals(item).catch(() => undefined);
        let ready = item;
        const changed: MediaItem[] = [];
        if (frames) {
          ready = applySignals(item, frames, await loadLearned());
          job.items = job.items.map((candidate) => (candidate.id === item.id ? ready : candidate));
          const print = firstPrint(frames);
          if (print) changed.push(...findDuplicates(job, ready, print));
          ready = job.items.find((candidate) => candidate.id === item.id) ?? ready;
          await persist(job);
        }
        hub.publish(job.owner, {
          type: "media",
          job: job.id,
          id: item.id,
          state: "ready",
          item: publicItem(ready),
        });
        for (const other of changed.filter((candidate) => candidate.id !== item.id)) {
          hub.publish(job.owner, {
            type: "media",
            job: job.id,
            id: other.id,
            state: "ready",
            item: publicItem(other),
          });
        }
      })
      .catch((error: Error) => {
        hub.publish(job.owner, {
          type: "media",
          job: job.id,
          id: item.id,
          state: "failed",
          reason: error.message,
        });
      });
  }

  /** Listens to and watches a recording, then tells the browser what it found. */
  function readDemo(job: Job, item: MediaItem) {
    listening
      .submit({
        id: `recording-${item.id}`,
        owner: job.owner,
        run: async ({ signal }) => {
          await deriveRecording(item, signal);
          const reading = await readRecording(item);
          job.demo = {
            media: item.id,
            ...reading,
            skipped: [],
            captions: true,
            brand: { name: "", colour: "#7b5cff" },
          };
          await persist(job);
        },
      })
      .then(
        () => {
          hub.publish(job.owner, {
            type: "recording",
            job: job.id,
            id: item.id,
            state: "ready",
            demo: job.demo,
          });
        },
        (error: Error) => {
          hub.publish(job.owner, {
            type: "recording",
            job: job.id,
            id: item.id,
            state: "failed",
            reason: `U-Cut couldn't read that recording. ${error.message}`,
          });
        },
      );
  }

  function addItem(job: Job, item: MediaItem) {
    if (!job.items.some((existing) => existing.id === item.id)) job.items.push(item);
  }

  function etaFor(state: RenderState, position: number): number {
    const seconds = state.duration * renderCost;
    const ahead = Math.max(0, position - 1);
    return Math.round(seconds * (1 + ahead / capacity.renderSlots));
  }

  function renderEvent(state: RenderState): ServerEvent {
    const position = rendering.position(state.id) ?? undefined;
    return {
      type: "render",
      id: state.id,
      job: state.job,
      state: state.state,
      progress: state.progress,
      ...(state.stage ? { stage: state.stage } : {}),
      ...(position !== undefined ? { position, etaSeconds: etaFor(state, position) } : {}),
      ...(state.state === "done" ? { url: `/renders/${state.id}.mp4` } : {}),
      ...(state.cached ? { cached: true } : {}),
      ...(state.error ? { error: state.error } : {}),
    };
  }

  // Everyone waiting hears when the line moves.
  rendering.onChange(() => {
    for (const state of renders.values()) {
      if (state.state === "queued") hub.publish(state.owner, renderEvent(state));
    }
  });

  app.get("/api/catalog", (c) =>
    c.json({
      templates: loadTemplates(),
      tracks: loadTracks().map((track) => ({ ...track, beats: trackBeats(track) })),
      fontCss: fontCss((file) => `/fonts/${file}`),
      samples: samples.map(publicItem),
      scenes: [...loadScenes(), { id: "other", label: "Other", group: "other" }],
      sorting: Boolean(vision() && sceneModel()),
    }),
  );

  app.get("/api/status", (c) =>
    c.json({
      capacity,
      renders: rendering.stats(),
      analysis: analysis.stats(),
      connections: hub.connections,
      renderCost,
    }),
  );

  app.get("/api/events", (c) => {
    const session = c.get("session");
    return streamSSE(c, async (stream) => {
      const queue: ServerEvent[] = [];
      let wake = () => {};
      const stop = hub.subscribe(session, (event) => {
        queue.push(event);
        wake();
      });
      stream.onAbort(() => {
        stop();
        wake();
      });
      await stream.writeSSE({ event: "hello", data: "{}" });
      while (!stream.aborted) {
        const next = queue.shift();
        if (next) {
          await stream.writeSSE({ data: JSON.stringify(next) });
          continue;
        }
        const heartbeat = new Promise<void>((done) => {
          const timer = setTimeout(done, 15_000);
          wake = () => {
            clearTimeout(timer);
            done();
          };
        });
        await heartbeat;
        if (queue.length === 0 && !stream.aborted)
          await stream.writeSSE({ event: "ping", data: "{}" });
      }
      stop();
    });
  });

  app.post("/api/jobs", async (c) => {
    const job: Job = {
      id: randomUUID(),
      owner: c.get("session"),
      createdAt: new Date().toISOString(),
      items: [],
      plan: null,
      excludedScenes: defaultExcludedScenes,
      recipe: null,
      demo: null,
    };
    jobs.set(job.id, job);
    await persist(job);
    return c.json(publicJob(job), 201);
  });

  app.get("/api/jobs/:id", async (c) => {
    const job = await ownedJob(c);
    return job ? c.json(publicJob(job)) : notFound(c);
  });

  app.put("/api/jobs/:id/media/:name", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    const name = safeName(c.req.param("name"));
    const kind = mediaKind(extname(name));
    if (!kind) return c.json({ error: `${name} isn't a photo or video.` }, 415);
    if (Number(c.req.header("content-length") ?? 0) > maxUpload) {
      return c.json({ error: `${name} is too large.` }, 413);
    }
    if ((await freeDisk(homeDir())) < minimumFreeDisk) {
      return c.json(
        { error: "This Mac is almost out of disk space. Free some up and try again." },
        507,
      );
    }
    const body = c.req.raw.body;
    if (!body) return c.json({ error: "Nothing was uploaded." }, 400);
    const stored = await storeStream(Readable.fromWeb(body as NodeReadableStream), name);
    try {
      const item = await probe(stored.hash, stored.path, kind);
      addItem(job, item);
      await persist(job);
      prepare(job, item);
      return c.json(publicItem(item), 201);
    } catch (error) {
      return c.json({ error: `${name}: ${(error as Error).message}` }, 422);
    }
  });

  app.put("/api/jobs/:id/recording/:name", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    const name = safeName(c.req.param("name"));
    if (mediaKind(extname(name)) !== "video") {
      return c.json({ error: `${name} isn't a video. Choose a screen recording.` }, 415);
    }
    if (Number(c.req.header("content-length") ?? 0) > maxUpload) {
      return c.json({ error: `${name} is too large.` }, 413);
    }
    if ((await freeDisk(homeDir())) < minimumFreeDisk) {
      return c.json(
        { error: "This Mac is almost out of disk space. Free some up and try again." },
        507,
      );
    }
    const body = c.req.raw.body;
    if (!body) return c.json({ error: "Nothing was uploaded." }, 400);
    const stored = await storeStream(Readable.fromWeb(body as NodeReadableStream), name);
    try {
      const item = await probe(stored.hash, stored.path, "video");
      addItem(job, item);
      await persist(job);
      readDemo(job, item);
      return c.json(publicItem(item), 201);
    } catch (error) {
      return c.json({ error: `${name}: ${(error as Error).message}` }, 422);
    }
  });

  // Returns once the small copy exists, so the logo appears as soon as the card uses it.
  app.put("/api/jobs/:id/logo/:name", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    const name = safeName(c.req.param("name"));
    if (mediaKind(extname(name)) !== "photo") {
      return c.json({ error: `${name} isn't a picture. Choose a PNG or JPEG logo.` }, 415);
    }
    const body = c.req.raw.body;
    if (!body) return c.json({ error: "Nothing was uploaded." }, 400);
    const stored = await storeStream(Readable.fromWeb(body as NodeReadableStream), name);
    try {
      const item = await probe(stored.hash, stored.path, "photo");
      await deriveMedia(item);
      addItem(job, item);
      await persist(job);
      return c.json(publicItem(item), 201);
    } catch (error) {
      return c.json({ error: `${name}: ${(error as Error).message}` }, 422);
    }
  });

  app.put("/api/jobs/:id/demo", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    const result = validate(Demo, await c.req.json(), "demo");
    if (!result.ok) return c.json({ error: result.errors.join(" ") }, 422);
    job.demo = result.value;
    await persist(job);
    return c.json({ ok: true });
  });

  app.post("/api/jobs/:id/samples", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    const { items } = await ingest([samplesDir]);
    for (const item of items) {
      addItem(job, item);
      prepare(job, item);
    }
    await persist(job);
    return c.json(publicJob(job));
  });

  app.delete("/api/jobs/:id/media/:media", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    job.items = job.items.filter((item) => item.id !== c.req.param("media"));
    await persist(job);
    return c.json(publicJob(job));
  });

  // One drag fixes a photo here, and teaches U-Cut for next time.
  app.put("/api/jobs/:id/media/:media/scene", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    const item = job.items.find((candidate) => candidate.id === c.req.param("media"));
    if (!item) return notFound(c);
    const { scene } = (await c.req.json().catch(() => ({}))) as { scene?: string };
    const known = [...loadScenes().map((entry) => entry.id), "other"];
    if (!scene || !known.includes(scene))
      return c.json({ error: "That isn't a scene U-Cut knows." }, 422);

    const others = item.labels.filter((label) => label.id !== scene).slice(0, 2);
    const updated = { ...item, labels: [{ id: scene, score: 1 }, ...others] };
    job.items = job.items.map((candidate) => (candidate.id === item.id ? updated : candidate));
    await persist(job);
    const frames = await readSignals(item).catch(() => undefined);
    const print = frames ? firstPrint(frames) : undefined;
    if (print && scene !== "other") await addLearned(scene, print);
    return c.json(publicItem(updated));
  });

  // The reel is read once and deleted. Only what was measured from it is kept.
  app.put("/api/jobs/:id/reference/:name", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    const name = safeName(c.req.param("name"));
    if (mediaKind(extname(name)) !== "video") {
      return c.json({ error: `${name} isn't a video. Choose the reel you saved.` }, 415);
    }
    const body = c.req.raw.body;
    if (!body) return c.json({ error: "Nothing was uploaded." }, 400);
    const folder = await mkdtemp(join(tmpdir(), "ucut-reel-"));
    const path = join(folder, `reel${extname(name)}`);
    try {
      await pipeline(Readable.fromWeb(body as NodeReadableStream), createWriteStream(path));
      const study = await studying.submit({
        id: `study-${randomUUID()}`,
        owner: job.owner,
        run: () => studyReel(path),
      });
      job.recipe = study.recipe;
      await persist(job);
      return c.json(study);
    } catch (error) {
      return c.json({ error: `U-Cut couldn't read that reel. ${(error as Error).message}` }, 422);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  app.delete("/api/jobs/:id/reference", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    job.recipe = null;
    await persist(job);
    return c.json({ ok: true });
  });

  app.put("/api/jobs/:id/scenes", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    const { excluded } = (await c.req.json().catch(() => ({}))) as { excluded?: unknown };
    if (!Array.isArray(excluded) || excluded.some((scene) => typeof scene !== "string")) {
      return c.json({ error: "That isn't a list of scenes." }, 422);
    }
    job.excludedScenes = excluded as string[];
    await persist(job);
    return c.json({ ok: true });
  });

  app.put("/api/jobs/:id/plan", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    const result = validate(EditPlan, await c.req.json(), "plan");
    if (!result.ok) return c.json({ error: result.errors.join(" ") }, 422);
    job.plan = result.value;
    await persist(job);
    return c.json({ ok: true });
  });

  app.post("/api/jobs/:id/export", async (c) => {
    const job = await ownedJob(c);
    if (!job) return notFound(c);
    const body = (await c.req.json().catch(() => ({}))) as { quality?: Quality; name?: string };
    const quality = [body.quality, process.env.UCUT_EXPORT_QUALITY, "looks"].find((value) =>
      qualities.includes(value as Quality),
    ) as Quality;
    const plan = job.plan;
    if (!plan) return c.json({ error: "There's no reel to export yet." }, 409);
    if ((await freeDisk(homeDir())) < minimumFreeDisk) {
      return c.json(
        { error: "This Mac is almost out of disk space. Free some up and try again." },
        507,
      );
    }

    const items = job.items;
    const key = await renderKey(plan, quality);
    const current = renders.get(key);
    if (current && ["queued", "running", "done"].includes(current.state)) {
      return c.json(renderEvent(current));
    }

    const state: RenderState = {
      id: key,
      job: job.id,
      owner: job.owner,
      state: "queued",
      progress: 0,
      duration: plan.duration,
      name: `${(body.name ?? "U-Cut reel").replace(/[/\\]/g, "-").slice(0, 80)}.mp4`,
    };
    renders.set(key, state);
    const started = Date.now();

    rendering
      .submit({
        id: key,
        owner: job.owner,
        run: async ({ signal }) => {
          state.state = "running";
          const load = rendering.stats();
          const result = await renderPlan(plan, items, {
            quality,
            workers: workersFor(capacity, load.running, load.queued),
            signal,
            projectDir: join(jobsDir(), job.id, "project"),
            onProgress: ({ stage, progress }) => {
              state.stage = stage;
              state.progress = progress;
              hub.publish(job.owner, renderEvent(state));
            },
          });
          state.path = result.path;
          state.cached = result.cached;
          if (!result.cached) {
            const measured = (Date.now() - started) / 1000 / plan.duration;
            renderCost = renderCost * 0.7 + measured * 0.3;
          }
        },
      })
      .then(
        () => {
          state.state = "done";
          state.progress = 1;
        },
        (error: Error) => {
          const cancelled =
            error.message === "Cancelled" || /code null|SIGTERM/.test(error.message);
          state.state = cancelled ? "cancelled" : "failed";
          if (!cancelled) state.error = error.message;
        },
      )
      .finally(() => hub.publish(job.owner, renderEvent(state)));

    return c.json(renderEvent(state), 202);
  });

  app.delete("/api/renders/:id", (c) => {
    const state = renders.get(c.req.param("id"));
    if (!state || state.owner !== c.get("session")) return notFound(c);
    rendering.cancel(state.id);
    return c.json({ ok: true });
  });

  app.get("/renders/:file", async (c) => {
    const state = renders.get(c.req.param("file").replace(/\.mp4$/, ""));
    if (!state?.path || state.owner !== c.get("session")) return notFound(c);
    const download = c.req.query("download") !== undefined;
    return sendFile(c, state.path, {
      type: "video/mp4",
      ...(download ? { download: state.name } : {}),
    });
  });

  const variants: Record<string, { file: string; type: string }> = {
    thumb: { file: thumbName, type: "image/jpeg" },
    display: { file: displayName, type: "image/jpeg" },
    preview: { file: previewName, type: "video/mp4" },
    screen: { file: screenName, type: "video/mp4" },
  };

  // A hash is 128 random-looking bits, so holding one is what grants access to the file.
  app.get("/media/:hash/:variant", async (c) => {
    const hash = c.req.param("hash");
    const variant = variants[c.req.param("variant")];
    if (!variant || !isHash(hash)) return notFound(c);
    return sendFile(c, join(storedFolder(hash), variant.file), {
      type: variant.type,
      cacheForever: true,
    });
  });

  app.get("/music/:file", async (c) => {
    const file = loadTracks().find((track) => track.file === c.req.param("file"));
    if (!file) return notFound(c);
    return sendFile(c, join(musicDir, file.file), { type: "audio/mp4" });
  });

  app.get("/fonts/:file", async (c) => {
    const name = c.req.param("file");
    if (!/^[a-z0-9-]+\.woff2$/.test(name)) return notFound(c);
    return sendFile(c, join(fontsDir, name), { type: "font/woff2", cacheForever: true });
  });

  app.get("*", async (c) => {
    const requested = normalize(decodeURIComponent(new URL(c.req.url).pathname));
    const file = resolve(webRoot, `.${requested}`);
    const type = contentTypes[extname(file)];
    if (type && file.startsWith(`${resolve(webRoot)}/`)) {
      const response = await sendFile(c, file, {
        type,
        cacheForever: requested.startsWith("/assets/"),
      });
      if (response.status !== 404) return response;
    }
    return sendFile(c, join(webRoot, "index.html"), { type: "text/html; charset=utf-8" });
  });

  /** Gets the sample photos ready, so the first screen can play a real reel. */
  async function prepareSamples() {
    const { items } = await ingest([samplesDir]);
    await Promise.all(items.map((item) => deriveMedia(item)));
    samples = items;
  }

  return { app, capacity, prepareSamples };
}
