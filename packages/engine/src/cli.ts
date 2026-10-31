import { readFileSync } from "node:fs";
import type { Aspect, Vibe } from "@u-cut/schema";
import { defineCommand, renderUsage, runCommand } from "citty";
import { doctor } from "./doctor.ts";
import { hf } from "./hf.ts";
import { ingest } from "./ingest.ts";
import { make } from "./make.ts";
import type { Quality } from "./render.ts";
import { serve } from "./server/serve.ts";
import { sortMedia } from "./sort.ts";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const makeCommand = defineCommand({
  meta: { name: "make", description: "Make a reel from photos and clips." },
  args: {
    inputs: { type: "positional", description: "Files or folders", required: true },
    output: {
      type: "string",
      alias: "o",
      default: "reel.mp4",
      description: "Where to save the MP4",
    },
    template: { type: "string", default: "travel-montage", description: "Template id" },
    vibe: { type: "string", default: "chill", description: "chill, hype, cinematic or nostalgic" },
    aspect: { type: "string", default: "9:16", description: "9:16, 1:1 or 16:9" },
    duration: { type: "string", default: "20", description: "Length to aim for, in seconds" },
    seed: { type: "string", default: "1", description: "Change it for a different cut" },
    title: { type: "string", default: "", description: "Title shown at the start" },
    quality: { type: "string", default: "looks", description: "draft, looks or delivery" },
    music: { type: "string", description: "Your own music file" },
    json: { type: "boolean", default: false, description: "Print progress as JSON lines" },
  },
  async run({ args }) {
    let lastStage = "";
    await make(
      {
        inputs: [args.inputs, ...args._.slice(1)],
        output: args.output,
        template: args.template,
        vibe: args.vibe as Vibe,
        aspect: args.aspect as Aspect,
        duration: Number(args.duration),
        seed: Number(args.seed),
        title: args.title,
        quality: args.quality as Quality,
        ...(args.music ? { music: args.music } : {}),
      },
      (event) => {
        if (args.json) {
          console.log(JSON.stringify(event));
        } else if (event.type === "stage" && event.stage !== lastStage) {
          lastStage = event.stage;
          console.log(`${event.stage}…`);
        } else if (event.type === "skipped") {
          console.log(`Skipped ${event.name}: it ${event.reason}.`);
        } else if (event.type === "done") {
          console.log(
            `Saved ${event.output} (${event.duration.toFixed(1)} s, ${event.shots} shots). Project: ${event.job}`,
          );
        }
      },
    );
  },
});

const serveCommand = defineCommand({
  meta: { name: "serve", description: "Open U-Cut in your browser." },
  args: {
    port: { type: "string", default: "4173", description: "Port to use" },
    lan: {
      type: "boolean",
      default: false,
      description: "Let other devices on your network use it",
    },
    open: { type: "boolean", default: true, description: "Open the browser" },
    json: { type: "boolean", default: false, description: "Print the address as JSON" },
    "exit-with-parent": {
      type: "boolean",
      default: false,
      description: "Stop when whatever started this closes its input",
    },
  },
  async run({ args }) {
    if (args["exit-with-parent"]) {
      // A force-quit app can't tell us it's gone, but its end of this pipe always closes.
      process.stdin.resume();
      process.stdin.on("close", () => process.exit(0));
    }
    const { url, lanUrl } = await serve({
      port: Number(args.port),
      lan: args.lan,
      bindAll: Boolean(process.env.UCUT_BIND_ALL),
    });
    if (args.json) {
      console.log(JSON.stringify({ url, lanUrl }));
    } else {
      console.log(`U-Cut is running at ${url}`);
      if (lanUrl) console.log(`Others on your network can use ${lanUrl}`);
      console.log("Press Ctrl+C to stop.");
    }
    if (args.open) {
      const { default: open } = await import("./open.ts");
      await open(url);
    }
    await new Promise(() => {});
  },
});

const sortCommand = defineCommand({
  meta: { name: "sort", description: "Sort photos and clips into scenes, and list them." },
  args: {
    inputs: { type: "positional", description: "Files or folders", required: true },
    json: { type: "boolean", default: false, description: "Print the result as JSON" },
  },
  async run({ args }) {
    const { items } = await ingest([args.inputs, ...args._.slice(1)]);
    const sorted = await sortMedia(items);
    if (args.json) {
      console.log(JSON.stringify(sorted, null, 2));
      return;
    }
    const scenes = new Map<string, number>();
    for (const item of sorted) {
      const scene = item.labels[0]?.id ?? "unsorted";
      scenes.set(scene, (scenes.get(scene) ?? 0) + 1);
    }
    for (const [scene, count] of [...scenes].sort((a, b) => b[1] - a[1])) {
      console.log(`${String(count).padStart(5)}  ${scene}`);
    }
    const moments = new Set(sorted.map((item) => item.moment)).size;
    const copies = sorted.filter((item) => item.quality.dupGroup).length;
    console.log(`${sorted.length} items, ${moments} moments, ${copies} near-duplicates.`);
  },
});

const setupCommand = defineCommand({
  meta: { name: "setup", description: "Download the browser U-Cut renders with." },
  async run() {
    console.log("Getting the rendering browser ready. This only happens once.");
    await hf(["browser", "ensure"], { timeoutMs: 600_000 });
    console.log("Done.");
  },
});

const doctorCommand = defineCommand({
  meta: { name: "doctor", description: "Check that this computer can run U-Cut." },
  async run() {
    const checks = await doctor();
    for (const check of checks)
      console.log(`${check.ok ? "ok " : "NO "} ${check.name}: ${check.detail}`);
    if (checks.some((check) => !check.ok))
      throw new Error("Fix the items marked NO, then try again.");
  },
});

const main = defineCommand({
  meta: {
    name: "ucut",
    version,
    description: "Turn your photos, clips and recordings into finished reels on your own Mac.",
  },
  subCommands: {
    make: makeCommand,
    sort: sortCommand,
    serve: serveCommand,
    setup: setupCommand,
    doctor: doctorCommand,
  },
});

const commands = ["make", "sort", "serve", "setup", "doctor"];

export async function run(argv: string[]): Promise<RunResult> {
  const [first] = argv;
  if (first === "--version" || first === "-v") {
    return { code: 0, stdout: `${version}\n`, stderr: "" };
  }
  if (first === undefined) return run(["serve"]);
  if (first === "--help" || first === "-h") {
    return { code: 0, stdout: `${await renderUsage(main)}\n`, stderr: "" };
  }
  if (!commands.includes(first)) {
    return {
      code: 1,
      stdout: "",
      stderr: `U-Cut doesn't have a command called "${first}". Run \`ucut --help\` to see what it can do.\n`,
    };
  }
  try {
    await runCommand(main, { rawArgs: argv });
    return { code: 0, stdout: "", stderr: "" };
  } catch (error) {
    return { code: 1, stdout: "", stderr: `${(error as Error).message}\n` };
  }
}
