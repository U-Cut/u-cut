// Simulates many people using one U-Cut server at the same moment, and reports what they'd feel.
// Run with: pnpm load-test [--users 20] [--seconds 4] [--slots 2]

import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { planRules } from "@u-cut/planner-rules";
import type { BeatGrid, MediaItem, TemplateManifest } from "@u-cut/schema";

const { values } = parseArgs({
  options: {
    users: { type: "string", default: "20" },
    seconds: { type: "string", default: "4" },
    slots: { type: "string", default: "" },
    port: { type: "string", default: "4199" },
  },
});
const users = Number(values.users);
const seconds = Number(values.seconds);
const base = `http://localhost:${values.port}`;
const samples = fileURLToPath(new URL("../library/samples/", import.meta.url));
const engine = fileURLToPath(new URL("../packages/engine/src/bin.ts", import.meta.url));

interface Catalog {
  templates: { manifest: TemplateManifest }[];
  tracks: { file: string; vibe: string; length: number; beats: BeatGrid }[];
}
interface ServerEvent {
  type: string;
  id?: string;
  state?: string;
  error?: string;
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};
const summary = (values: number[]) =>
  `median ${percentile(values, 50).toFixed(0)}  p95 ${percentile(values, 95).toFixed(0)}  max ${Math.max(...values).toFixed(0)}`;

const interactive: number[] = [];
const uploads: number[] = [];
const planning: number[] = [];
const turnaround: number[] = [];
const cachedExports: number[] = [];
const failures: string[] = [];

async function timed(fn: () => Promise<Response>, bucket: number[] | null): Promise<Response> {
  const start = performance.now();
  const response = await fn();
  await response.clone().arrayBuffer();
  bucket?.push(performance.now() - start);
  return response;
}

function eventStream(cookie: string, onEvent: (event: ServerEvent) => void) {
  const controller = new AbortController();
  void (async () => {
    const response = await fetch(`${base}/api/events`, {
      headers: { cookie },
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = (await reader?.read()) ?? { done: true, value: undefined };
      if (done) return;
      text += decoder.decode(value, { stream: true });
      const parts = text.split("\n\n");
      text = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((entry) => entry.startsWith("data:"));
        if (line && line.length > 8) onEvent(JSON.parse(line.slice(5)) as ServerEvent);
      }
    }
  })().catch(() => {});
  return () => controller.abort();
}

/** One person: adds photos, edits instantly in their browser, exports, then exports again. */
async function user(index: number, catalog: Catalog, files: string[]) {
  const first = await fetch(`${base}/api/status`);
  const cookie = first.headers.get("set-cookie")?.split(";")[0] ?? "";
  const headers = { cookie };
  const finished = new Map<string, (event: ServerEvent) => void>();
  const stop = eventStream(cookie, (event) => {
    if (
      event.type === "render" &&
      event.id &&
      ["done", "failed", "cancelled"].includes(event.state ?? "")
    ) {
      finished.get(event.id)?.(event);
    }
  });

  const job = (await (await fetch(`${base}/api/jobs`, { method: "POST", headers })).json()) as {
    id: string;
  };

  const items: MediaItem[] = [];
  const picked = files.filter((_, fileIndex) => (fileIndex + index) % 2 === 0).slice(0, 5);
  for (const file of picked) {
    const response = await timed(
      () =>
        fetch(`${base}/api/jobs/${job.id}/media/${encodeURIComponent(file)}`, {
          method: "PUT",
          headers,
          body: readFileSync(join(samples, file)),
        }),
      uploads,
    );
    items.push((await response.json()) as MediaItem);
  }

  // Planning happens in the browser, so this measures the code that runs there.
  const template = catalog.templates[0]?.manifest as TemplateManifest;
  const track = catalog.tracks[index % catalog.tracks.length] as Catalog["tracks"][number];
  const start = performance.now();
  const plan = planRules({
    items,
    template,
    vibe: track.vibe as "chill",
    aspect: "9:16",
    duration: seconds,
    music: { src: track.file, length: track.length, beats: track.beats },
    copy: { title: `User ${index}` },
    excludedScenes: [],
    recipe: null,
    seed: index + 1,
  });
  planning.push(performance.now() - start);

  await fetch(`${base}/api/jobs/${job.id}/plan`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(plan),
  });

  async function exportReel(bucket: number[]) {
    const begin = performance.now();
    const response = await fetch(`${base}/api/jobs/${job.id}/export`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ quality: "draft" }),
    });
    const render = (await response.json()) as ServerEvent;
    if (render.state !== "done") {
      await new Promise<ServerEvent>((resolve) => finished.set(render.id ?? "", resolve)).then(
        (event) => {
          if (event.state !== "done") failures.push(`user ${index}: ${event.error ?? event.state}`);
        },
      );
    }
    bucket.push(performance.now() - begin);
  }

  let exporting = true;
  // While the export waits, this person keeps using the interface.
  const browsing = (async () => {
    while (exporting) {
      const item = items[Math.floor(Math.random() * items.length)];
      await timed(() => fetch(`${base}/api/jobs/${job.id}`, { headers }), interactive);
      await timed(() => fetch(`${base}/media/${item?.id}/thumb`, { headers }), interactive);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  })();

  await exportReel(turnaround);
  exporting = false;
  await browsing;
  await exportReel(cachedExports);
  stop();
}

async function waitForServer(server: ChildProcess) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error("The server stopped while starting.");
    const ok = await fetch(`${base}/api/status`).then(
      (r) => r.ok,
      () => false,
    );
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("The server didn't start.");
}

async function main() {
  const home = mkdtempSync(join(tmpdir(), "ucut-load-"));
  const server = spawn(
    process.execPath,
    [
      "--conditions=source",
      "--import",
      "tsx",
      engine,
      "serve",
      "--port",
      String(values.port),
      "--no-open",
    ],
    {
      env: {
        ...process.env,
        UCUT_HOME: home,
        ...(values.slots ? { UCUT_RENDER_SLOTS: values.slots } : {}),
      },
      stdio: "ignore",
    },
  );
  try {
    await waitForServer(server);
    const status = (await (await fetch(`${base}/api/status`)).json()) as {
      capacity: { renderSlots: number; totalWorkers: number };
    };
    const catalog = (await (await fetch(`${base}/api/catalog`)).json()) as Catalog;
    const files = readdirSync(samples).filter((file) => file.endsWith(".jpg"));

    console.log(
      `${users} people, ${seconds} s reels, ${status.capacity.renderSlots} render slots, ${status.capacity.totalWorkers} workers in total`,
    );
    const start = performance.now();
    await Promise.all(Array.from({ length: users }, (_, index) => user(index, catalog, files)));
    const wall = (performance.now() - start) / 1000;

    console.log(`\nAll in milliseconds:`);
    console.log(`  Planning a cut (in the browser)   ${summary(planning)}`);
    console.log(`  Uploading one photo               ${summary(uploads)}`);
    console.log(
      `  Interface requests during exports ${summary(interactive)}  (${interactive.length} requests)`,
    );
    console.log(`  Export, waiting included          ${summary(turnaround)}`);
    console.log(`  Same export again (cached)        ${summary(cachedExports)}`);
    console.log(
      `\nFinished ${users} exports in ${wall.toFixed(1)} s, ${((users * seconds) / wall).toFixed(2)} s of reel per second.`,
    );
    console.log(failures.length ? `Failures:\n  ${failures.join("\n  ")}` : "No failures.");
    if (failures.length) process.exitCode = 1;
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    rmSync(home, { recursive: true, force: true });
  }
}

await main();
