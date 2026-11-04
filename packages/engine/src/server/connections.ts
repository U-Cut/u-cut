import { randomBytes } from "node:crypto";
import { writeWithClaude } from "@u-cut/planner-api";
import { readPrompt } from "@u-cut/planner-rules";
import { Aspect, type EditPlan, type Script, Vibe } from "@u-cut/schema";
import type { Context, Hono } from "hono";
import { z } from "zod";
import {
  allowVoiceStudio,
  builtIn,
  choose,
  connect,
  connectionsStatus,
  currentChoices,
  disconnect,
  keyFor,
  openVoiceStudio,
  type ServiceId,
  serviceInfo,
  type Task,
  voicesOf,
} from "../connections/index.ts";
import { voices as kokoroVoices, voiceReady } from "../voice.ts";
import type { EventHub } from "./events.ts";

type App = Hono<{ Variables: { session: string; local: boolean } }>;
type C = Context<{ Variables: { session: string; local: boolean } }>;

interface JobLike {
  id: string;
  owner: string;
  items: { labels: { id: string }[] }[];
  plan: EditPlan | null;
  script: Script | null;
  demo: { moments: { quote: string; in: number; out: number }[] } | null;
}

export interface ConnectionDeps {
  fromThisMac(c: Context): boolean;
  ownedJob(c: C): Promise<JobLike | undefined>;
  loadJob(id: string): Promise<JobLike | undefined>;
  hub: EventHub;
}

const onlyHere = (c: Context) =>
  c.json({ error: "Only the person running U-Cut can change its connections." }, 403);

/** What this person may use: everything set up on this Mac, or the built-in lanes over the network. */
export async function choicesFor(c: Context, deps: ConnectionDeps) {
  return deps.fromThisMac(c) ? currentChoices() : builtIn;
}

interface Link {
  job: string;
  owner: string;
  made: number;
}

/** A day is long enough for any editing session, and short enough that old links stop working. */
const linkLife = 24 * 60 * 60 * 1000;

const Change = z.strictObject({
  lines: z.array(z.string().trim().min(1).max(160)).min(1).max(40).optional(),
  title: z.string().max(80).optional(),
  vibe: Vibe.optional(),
  duration: z.number().min(5).max(120).optional(),
  aspect: Aspect.optional(),
  seed: z.number().int().min(1).optional(),
});

export function addConnectionRoutes(app: App, deps: ConnectionDeps) {
  const links = new Map<string, Link>();
  /** Changes sent to a browser, waiting to hear that the reel applied them. */
  const waiting = new Map<
    string,
    { job: string; owner: string; done(outcome: { applied: boolean; error?: string }): void }
  >();

  app.get("/api/connections", async (c) => {
    if (!deps.fromThisMac(c)) {
      return c.json({ local: false, choices: builtIn, services: [], voiceStudio: null });
    }
    return c.json({ local: true, ...(await connectionsStatus()) });
  });

  app.put("/api/connections/:service/key", async (c) => {
    if (!deps.fromThisMac(c)) return onlyHere(c);
    const service = serviceInfo(c.req.param("service"));
    if (!service?.needsKey) return c.json({ error: "That service doesn't use a key." }, 404);
    const { key } = (await c.req.json().catch(() => ({}))) as { key?: unknown };
    if (typeof key !== "string" || !key.trim()) {
      return c.json({ error: "Paste the key first." }, 422);
    }
    try {
      await connect(service.id, key);
      return c.json({ local: true, ...(await connectionsStatus()) });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 422);
    }
  });

  app.delete("/api/connections/:service", async (c) => {
    if (!deps.fromThisMac(c)) return onlyHere(c);
    const service = serviceInfo(c.req.param("service"));
    if (!service) return c.json({ error: "U-Cut doesn't know that service." }, 404);
    await disconnect(service.id);
    return c.json({ local: true, ...(await connectionsStatus()) });
  });

  app.put("/api/connections/choices", async (c) => {
    if (!deps.fromThisMac(c)) return onlyHere(c);
    const body = (await c.req.json().catch(() => ({}))) as Partial<Record<Task, unknown>>;
    try {
      for (const task of ["write", "voice", "listen"] as Task[]) {
        const choice = body[task];
        if (typeof choice === "string") await choose(task, choice);
      }
      return c.json({ local: true, ...(await connectionsStatus()) });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 422);
    }
  });

  app.put("/api/connections/voicestudio", async (c) => {
    if (!deps.fromThisMac(c)) return onlyHere(c);
    const { allowed } = (await c.req.json().catch(() => ({}))) as { allowed?: unknown };
    await allowVoiceStudio(allowed === true);
    return c.json({ local: true, ...(await connectionsStatus()) });
  });

  app.post("/api/connections/voicestudio/open", async (c) => {
    if (!deps.fromThisMac(c)) return onlyHere(c);
    try {
      await openVoiceStudio();
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 409);
    }
  });

  /** The voices this person can pick: the chosen service's, or Kokoro's when it's installed. */
  app.get("/api/voices", async (c) => {
    const { voice } = await choicesFor(c, deps);
    if (voice === "kokoro") {
      return c.json({ service: "kokoro", ready: voiceReady(), voices: kokoroVoices });
    }
    try {
      const listed = await voicesOf(voice as ServiceId);
      return c.json({
        service: voice,
        ready: true,
        voices: listed.map((entry) => ({ ...entry, id: `${voice}:${entry.id}` })),
      });
    } catch (error) {
      return c.json({ service: voice, ready: false, voices: [], error: (error as Error).message });
    }
  });

  // The rules have already written a script in the browser. This asks Claude for a better one.
  app.post("/api/jobs/:id/write", async (c) => {
    const job = await deps.ownedJob(c);
    if (!job) return c.json({ error: "That reel isn't here." }, 404);
    const { write } = await choicesFor(c, deps);
    const apiKey = write === "claude" ? await keyFor("claude") : null;
    if (!apiKey) return c.json({ error: "Claude isn't set up to write scripts." }, 409);
    const body = (await c.req.json().catch(() => ({}))) as {
      prompt?: unknown;
      scenes?: unknown;
      vibe?: unknown;
      duration?: unknown;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 4000) : "";
    const vibe = Vibe.safeParse(body.vibe);
    const duration = typeof body.duration === "number" ? body.duration : 20;
    const scenes = Array.isArray(body.scenes)
      ? body.scenes.filter((scene): scene is string => typeof scene === "string").slice(0, 30)
      : [];
    if (!prompt || !vibe.success) return c.json({ error: "Say what the reel is about." }, 422);
    try {
      const lines = await writeWithClaude({
        prompt,
        request: readPrompt(prompt),
        scenes,
        vibe: vibe.data,
        duration: Math.min(120, Math.max(5, duration)),
        apiKey,
        signal: c.req.raw.signal,
      });
      return c.json({ lines });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 502);
    }
  });

  // An assistant can work on one open reel, from this Mac only, until U-Cut restarts or a day passes.
  app.post("/api/jobs/:id/assistant", async (c) => {
    if (!deps.fromThisMac(c)) {
      return c.json(
        { error: "Only the person at the computer running U-Cut can give a reel to an assistant." },
        403,
      );
    }
    const job = await deps.ownedJob(c);
    if (!job) return c.json({ error: "That reel isn't here." }, 404);
    const token = randomBytes(24).toString("hex");
    links.set(token, { job: job.id, owner: job.owner, made: Date.now() });
    const host = c.req.header("host") ?? "localhost:4173";
    return c.json({ link: `http://${host.replace("127.0.0.1", "localhost")}/assistant/${token}` });
  });

  async function linked(c: Context) {
    if (!deps.fromThisMac(c)) return null;
    const token = c.req.param("token") ?? "";
    const link = links.get(token);
    if (!link || Date.now() - link.made > linkLife) {
      links.delete(token);
      return null;
    }
    const job = await deps.loadJob(link.job);
    return job && job.owner === link.owner ? job : null;
  }

  const expired = (c: Context) =>
    c.json(
      { error: 'That link has ended. Copy a new one from "Give this reel to your assistant".' },
      404,
    );

  app.get("/api/assistant/:token", async (c) => {
    const job = await linked(c);
    if (!job) return expired(c);
    const scenes = new Map<string, number>();
    for (const item of job.items) {
      const scene = item.labels[0]?.id ?? "unsorted";
      scenes.set(scene, (scenes.get(scene) ?? 0) + 1);
    }
    const plan = job.plan;
    return c.json({
      kind: job.demo ? "demo" : job.script ? "written" : "photos",
      open: deps.hub.listening(job.owner),
      ...(plan
        ? {
            title: plan.texts.find((text) => text.style === "title")?.text ?? "",
            vibe: plan.vibe,
            seconds: plan.duration,
            aspect: plan.aspect,
            template: plan.template,
            shots: plan.shots.length,
          }
        : {}),
      script: job.script?.lines.map((line) => line.text) ?? null,
      scenes: Object.fromEntries(scenes),
      moments: job.demo?.moments.map((moment) => ({
        from: moment.in,
        to: moment.out,
        said: moment.quote,
      })),
      canChange: ["lines (written reels)", "title", "vibe", "duration", "aspect", "seed"],
    });
  });

  app.post("/api/assistant/:token/change", async (c) => {
    const job = await linked(c);
    if (!job) return expired(c);
    const parsed = Change.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, 422);
    }
    if (Object.keys(parsed.data).length === 0)
      return c.json({ error: "There's nothing to change." }, 422);
    if (parsed.data.lines && !job.script) {
      return c.json({ error: "Only a reel made from words has lines to change." }, 422);
    }
    if (!deps.hub.listening(job.owner)) {
      return c.json(
        { error: "The reel isn't open in U-Cut right now. Open it, then try again." },
        409,
      );
    }
    const id = randomBytes(8).toString("hex");
    const outcome = await new Promise<{ applied: boolean; error?: string }>((done) => {
      const timer = setTimeout(() => done({ applied: false }), 8000);
      waiting.set(id, {
        job: job.id,
        owner: job.owner,
        done: (result) => {
          clearTimeout(timer);
          done(result);
        },
      });
      deps.hub.publish(job.owner, { type: "assistant", job: job.id, id, change: parsed.data });
    });
    waiting.delete(id);
    if (outcome.applied) return c.json({ applied: true });
    if (outcome.error) return c.json({ error: outcome.error }, 422);
    return c.json(
      { error: "That reel isn't the one open in U-Cut right now. Open it, then try again." },
      409,
    );
  });

  // The browser says whether the open reel took the change.
  app.post("/api/jobs/:id/assistant-changes/:change", async (c) => {
    const job = await deps.ownedJob(c);
    const pending = waiting.get(c.req.param("change"));
    if (!job || !pending || pending.job !== job.id || pending.owner !== job.owner) {
      return c.json({ error: "That change isn't waiting." }, 404);
    }
    const body = (await c.req.json().catch(() => ({}))) as { applied?: unknown; error?: unknown };
    pending.done({
      applied: body.applied === true,
      ...(typeof body.error === "string" && body.error ? { error: body.error.slice(0, 300) } : {}),
    });
    return c.json({ ok: true });
  });
}
