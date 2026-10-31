import { readFileSync } from "node:fs";
import type { Aspect, Vibe } from "@u-cut/schema";
import { defineCommand, renderUsage, runCommand } from "citty";
import { make } from "./make.ts";
import type { Quality } from "./render.ts";

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

const main = defineCommand({
  meta: {
    name: "ucut",
    version,
    description: "Turn your photos, clips and recordings into finished reels on your own Mac.",
  },
  subCommands: { make: makeCommand },
});

const commands = ["make"];

export async function run(argv: string[]): Promise<RunResult> {
  const [first] = argv;
  if (first === "--version" || first === "-v") {
    return { code: 0, stdout: `${version}\n`, stderr: "" };
  }
  if (first === undefined || first === "--help" || first === "-h") {
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
