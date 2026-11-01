import { readFileSync } from "node:fs";
import type { Aspect, Vibe } from "@u-cut/schema";
import { defineCommand, renderUsage, runCommand } from "citty";
import { makeDemo } from "./demo.ts";
import { doctor } from "./doctor.ts";
import { hf } from "./hf.ts";
import { ingest } from "./ingest.ts";
import { make } from "./make.ts";
import { installSpeech, speechReady } from "./recording.ts";
import type { Quality } from "./render.ts";
import { serve } from "./server/serve.ts";
import { sortMedia } from "./sort.ts";
import { studyReel } from "./study.ts";

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
    like: { type: "string", description: "A reel whose style to copy" },
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
        ...(args.like ? { like: args.like } : {}),
      },
      (event) => {
        if (args.json) {
          console.log(JSON.stringify(event));
        } else if (event.type === "stage" && event.stage !== lastStage) {
          lastStage = event.stage;
          console.log(`${event.stage}…`);
        } else if (event.type === "recipe") {
          console.log(event.description);
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

const demoCommand = defineCommand({
  meta: { name: "demo", description: "Turn a screen recording into a product demo." },
  args: {
    recording: { type: "positional", description: "A screen recording", required: true },
    output: {
      type: "string",
      alias: "o",
      default: "demo.mp4",
      description: "Where to save the MP4",
    },
    name: { type: "string", default: "", description: "Shown on the title and end cards" },
    colour: { type: "string", default: "#7b5cff", description: "Colour of the cards" },
    logo: { type: "string", description: "A picture for the cards" },
    aspect: { type: "string", description: "9:16, 1:1 or 16:9. The recording's shape if left out" },
    captions: { type: "boolean", default: true, description: "Show what's said as captions" },
    quality: { type: "string", default: "looks", description: "draft, looks or delivery" },
    json: { type: "boolean", default: false, description: "Print progress as JSON lines" },
  },
  async run({ args }) {
    let lastStage = "";
    await makeDemo(
      {
        recording: args.recording,
        output: args.output,
        name: args.name,
        colour: args.colour,
        captions: args.captions,
        quality: args.quality as Quality,
        ...(args.logo ? { logo: args.logo } : {}),
        ...(args.aspect ? { aspect: args.aspect as Aspect } : {}),
      },
      (event) => {
        if (args.json) {
          console.log(JSON.stringify(event));
        } else if (event.type === "stage" && event.stage !== lastStage) {
          lastStage = event.stage;
          console.log(`${event.stage}…`);
        } else if (event.type === "skipped") {
          console.log(`${event.name} ${event.reason}.`);
        } else if (event.type === "done") {
          console.log(
            `Saved ${event.output} (${event.duration.toFixed(1)} s, ${event.shots} ${event.shots === 1 ? "moment" : "moments"}). Project: ${event.job}`,
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

const studyCommand = defineCommand({
  meta: { name: "study", description: "Learn the style of a reel you admire." },
  args: {
    reel: { type: "positional", description: "A video file", required: true },
    json: { type: "boolean", default: false, description: "Print the recipe as JSON" },
  },
  async run({ args }) {
    const { recipe, description } = await studyReel(args.reel);
    console.log(args.json ? JSON.stringify(recipe, null, 2) : description);
  },
});

const setupCommand = defineCommand({
  meta: { name: "setup", description: "Download what U-Cut needs to render and listen." },
  args: {
    speech: {
      type: "boolean",
      default: false,
      description: "Also get the speech model for captions (465 MB)",
    },
  },
  async run({ args }) {
    console.log("Getting the rendering browser ready. This only happens once.");
    await hf(["browser", "ensure"], { timeoutMs: 600_000 });
    if (args.speech && !speechReady()) {
      console.log("Getting the speech model. It's 465 MB, and stays on this computer.");
      await installSpeech();
    }
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
    demo: demoCommand,
    sort: sortCommand,
    study: studyCommand,
    serve: serveCommand,
    setup: setupCommand,
    doctor: doctorCommand,
  },
});

const commands = ["make", "demo", "sort", "study", "serve", "setup", "doctor"];

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
