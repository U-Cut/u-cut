import { readFileSync } from "node:fs";
import type { Aspect, Vibe } from "@u-cut/schema";
import { defineCommand, renderUsage, runCommand } from "citty";
import {
  allowVoiceStudio,
  choose,
  connect,
  connectionsStatus,
  currentChoices,
  defaultVoiceFor,
  disconnect,
  type ServiceId,
  serviceInfo,
  services,
  type Task,
  voicesOf,
} from "./connections/index.ts";
import { makeDemo } from "./demo.ts";
import { doctor } from "./doctor.ts";
import { ingest } from "./ingest.ts";
import { renderJob } from "./jobs.ts";
import { loadTemplates } from "./library.ts";
import { make } from "./make.ts";
import type { Quality } from "./render.ts";
import { serve } from "./server/serve.ts";
import { type PartId, setup } from "./setup/index.ts";
import { sortMedia } from "./sort.ts";
import { makeStory } from "./story.ts";
import { studyReel } from "./study.ts";
import { updateTemplates } from "./templates.ts";
import { voices as kokoroVoices, voiceReady, voiceSize } from "./voice.ts";

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
    sfx: {
      type: "boolean",
      default: true,
      description: "Sound effects at the turning points. --no-sfx leaves them out",
    },
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
        sounds: args.sfx,
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
    listen: {
      type: "string",
      description:
        "whisper (on this Mac), or a connected service: voicestudio, deepgram, elevenlabs, openai",
    },
    hint: { type: "string", description: "Words to listen for, separated by commas" },
    quality: { type: "string", default: "looks", description: "draft, looks or delivery" },
    json: { type: "boolean", default: false, description: "Print progress as JSON lines" },
  },
  async run({ args }) {
    let lastStage = "";
    const { listen } = args.listen ? { listen: args.listen } : await currentChoices();
    await makeDemo(
      {
        recording: args.recording,
        output: args.output,
        name: args.name,
        colour: args.colour,
        captions: args.captions,
        quality: args.quality as Quality,
        listen,
        hints: (args.hint ?? "")
          .split(",")
          .map((hint) => hint.trim())
          .filter(Boolean),
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

const writeCommand = defineCommand({
  meta: { name: "write", description: "Make a reel from a sentence, with or without your media." },
  args: {
    prompt: { type: "positional", description: "What you want, in plain English", required: true },
    output: {
      type: "string",
      alias: "o",
      default: "reel.mp4",
      description: "Where to save the MP4",
    },
    voice: {
      type: "string",
      description:
        "Who reads it. Run `ucut voices` to list them. Left out, the chosen service's voice",
    },
    speak: { type: "boolean", default: true, description: "Read the script aloud" },
    writer: {
      type: "string",
      description: "rules, or claude once it's connected. Left out, whatever Connections says",
    },
    lines: { type: "string", description: "A text file of your own lines, one per line" },
    vibe: { type: "string", description: "chill, hype, cinematic or nostalgic" },
    aspect: { type: "string", description: "9:16, 1:1 or 16:9" },
    duration: { type: "string", description: "Length to aim for, in seconds" },
    seed: { type: "string", default: "1", description: "Change it for a different script" },
    quality: { type: "string", default: "looks", description: "draft, looks or delivery" },
    json: { type: "boolean", default: false, description: "Print progress as JSON lines" },
  },
  async run({ args }) {
    let lastStage = "";
    const choices = await currentChoices();
    const writer = (args.writer ?? choices.write) as "rules" | "claude";
    const voice = args.voice ?? (await defaultVoiceFor(choices));
    const lines = args.lines
      ? readFileSync(args.lines, "utf8")
          .split("\n")
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text) => ({ text }))
      : undefined;
    await makeStory(
      {
        prompt: args.prompt,
        writer,
        ...(lines ? { lines } : {}),
        inputs: args._.slice(1),
        output: args.output,
        voice: args.speak ? voice : null,
        quality: args.quality as Quality,
        seed: Number(args.seed),
        ...(args.vibe ? { vibe: args.vibe as Vibe } : {}),
        ...(args.aspect ? { aspect: args.aspect as Aspect } : {}),
        ...(args.duration ? { duration: Number(args.duration) } : {}),
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
            `Saved ${event.output} (${event.duration.toFixed(1)} s, ${event.shots} lines). Project: ${event.job}`,
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

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 ** 2)} MB`;

const setupCommand = defineCommand({
  meta: {
    name: "setup",
    description: "Download what U-Cut needs to export, and captions or the voice.",
  },
  args: {
    speech: {
      type: "boolean",
      default: false,
      description: `Also get the speech model for captions (${megabytes(setup.statusOf("speech").bytes)})`,
    },
    voice: {
      type: "boolean",
      default: false,
      description: `Also get the voice for written reels (${voiceSize})`,
    },
    json: { type: "boolean", default: false, description: "Print progress as JSON lines" },
  },
  async run({ args }) {
    const wanted: PartId[] = [
      "browser",
      ...(args.speech ? (["speech"] as const) : []),
      ...(args.voice ? (["voice"] as const) : []),
    ];
    for (const id of wanted) {
      const before = setup.statusOf(id);
      if (before.ready) {
        if (!args.json) console.log(`${before.name}: ready.`);
        continue;
      }
      if (!args.json) {
        console.log(
          `Getting ${before.name.toLowerCase()} (${megabytes(before.bytes)}). It stays on this computer.`,
        );
      }
      let shown = "";
      const show = () => {
        const now = setup.statusOf(id);
        if (args.json) {
          console.log(JSON.stringify(now));
          return;
        }
        const line = now.ready
          ? "  Ready."
          : now.state === "waiting"
            ? "  Waiting for the connection to come back..."
            : now.step
              ? `  ${now.step}...`
              : `  ${megabytes(now.done)} of ${megabytes(now.bytes)}`;
        // A line every 10% keeps logs short without leaving anyone wondering.
        const key = now.step ?? `${now.state}${Math.floor((now.done / now.bytes) * 10)}`;
        if (key !== shown) console.log(line);
        shown = key;
      };
      const timer = setInterval(show, 500);
      try {
        await setup.start(id);
      } finally {
        clearInterval(timer);
      }
      show();
    }
    if (!args.json) console.log("Done.");
  },
});

const templatesCommand = defineCommand({
  meta: {
    name: "templates",
    description: "List reel styles, or add new and newer ones from U-Cut's library on GitHub.",
  },
  args: {
    action: {
      type: "positional",
      required: false,
      description: "update: add styles that are new or newer than yours",
    },
  },
  async run({ args }) {
    if (args.action === "update") {
      console.log("Looking for new styles on GitHub…");
      const { added, updated, skipped } = await updateTemplates();
      for (const name of added) console.log(`Added ${name}`);
      for (const name of updated) console.log(`Updated ${name}`);
      for (const { id, reason } of skipped) console.log(`Skipped ${id}: ${reason}.`);
      if (added.length + updated.length === 0) console.log("You have every style already.");
      return;
    }
    if (args.action) {
      throw new Error(`Templates can't "${args.action}". Try: ucut templates update`);
    }
    for (const { manifest, added } of loadTemplates()) {
      console.log(
        `${manifest.id.padEnd(16)} ${manifest.name} ${manifest.version}${added ? "  (added)" : ""}`,
      );
    }
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

const renderCommand = defineCommand({
  meta: {
    name: "render",
    description: "Render a job folder again, after you or an assistant edited it.",
  },
  args: {
    job: { type: "positional", description: 'The folder printed after "Project:"', required: true },
    output: {
      type: "string",
      alias: "o",
      default: "reel.mp4",
      description: "Where to save the MP4",
    },
    quality: { type: "string", default: "looks", description: "draft, looks or delivery" },
    project: {
      type: "boolean",
      default: false,
      description: "Render the project/ folder as it is, keeping edits to the composition",
    },
    force: {
      type: "boolean",
      default: false,
      description: "Compose again from plan.json even though project/ was edited",
    },
  },
  async run({ args }) {
    const output = await renderJob(args.job, {
      output: args.output,
      quality: args.quality as Quality,
      project: args.project,
      force: args.force,
    });
    console.log(`Saved ${output}`);
  },
});

const mcpCommand = defineCommand({
  meta: {
    name: "mcp",
    description: "Let an assistant such as Claude Code or Claude Desktop make reels with U-Cut.",
  },
  async run() {
    const { runMcp } = await import("./mcp/index.ts");
    await runMcp();
    // The client has gone, so anything still running has nobody to report to.
    process.exit(0);
  },
});

/** Reads a pasted key without showing it, ending at Return. Piped input is read to its end. */
function readKey(): Promise<string> {
  return new Promise((resolve) => {
    let text = "";
    const stdin = process.stdin;
    stdin.setEncoding("utf8");
    if (!stdin.isTTY) {
      stdin.on("data", (chunk) => {
        text += chunk;
      });
      stdin.on("end", () => resolve(text.trim()));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(text.trim());
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n" || character === "\u0004") return done();
        if (character === "\u0003") process.exit(130);
        if (character === "\u007f") text = text.slice(0, -1);
        else text += character;
      }
    };
    stdin.on("data", onData);
  });
}

const connectCommand = defineCommand({
  meta: {
    name: "connect",
    description: "Connect a service: claude, elevenlabs, deepgram, openai, or voicestudio.",
  },
  args: {
    service: { type: "positional", description: "Which service", required: true },
    key: { type: "string", description: "The API key. Left out, it's read from standard input" },
    use: {
      type: "string",
      description: "Also choose it for a job now: write, voice or listen, separated by commas",
    },
  },
  async run({ args }) {
    const service = serviceInfo(args.service);
    if (!service) {
      throw new Error(`U-Cut can connect ${services.map((entry) => entry.id).join(", ")}.`);
    }
    const uses = (args.use ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    for (const task of uses) {
      if (!service.tasks.includes(task as Task)) {
        throw new Error(`${service.name} can't ${task}. It can: ${service.tasks.join(", ")}.`);
      }
    }
    if (service.id === "voicestudio") {
      await allowVoiceStudio(true);
      console.log("U-Cut can now use Voice Studio, which runs on this Mac.");
    } else {
      if (!args.key && process.stdin.isTTY) {
        process.stdout.write(`Paste your ${service.name} key, then press Return. It won't show: `);
      }
      const key = args.key ?? (await readKey());
      if (!key) throw new Error("Paste the key, or pass it with --key.");
      await connect(service.id as ServiceId, key);
      const where =
        process.platform === "darwin" && process.env.UCUT_SECRETS !== "file"
          ? "your Keychain"
          : "a file in U-Cut's folder that only you can read";
      console.log(`${service.name} is connected. Its key is in ${where}.`);
    }
    for (const task of uses) {
      await choose(task as Task, service.id);
      console.log(`${service.name} now does: ${task}. ${service.sends[task as Task] ?? ""}`);
    }
  },
});

const disconnectCommand = defineCommand({
  meta: { name: "disconnect", description: "Forget a service's key, and stop using it." },
  args: { service: { type: "positional", description: "Which service", required: true } },
  async run({ args }) {
    const service = serviceInfo(args.service);
    if (!service) throw new Error("U-Cut doesn't know that service.");
    await disconnect(service.id);
    console.log(`${service.name} is disconnected.`);
  },
});

const connectionsCommand = defineCommand({
  meta: { name: "connections", description: "Show and choose what writes, voices and listens." },
  args: {
    write: { type: "string", description: "rules or claude" },
    voice: { type: "string", description: "kokoro, voicestudio, elevenlabs or deepgram" },
    listen: { type: "string", description: "whisper, voicestudio, deepgram, elevenlabs or openai" },
    json: { type: "boolean", default: false, description: "Print it as JSON" },
  },
  async run({ args }) {
    for (const task of ["write", "voice", "listen"] as Task[]) {
      if (args[task]) await choose(task, args[task]);
    }
    const status = await connectionsStatus();
    if (args.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    const name = (id: string) => serviceInfo(id)?.name ?? "U-Cut, on this Mac";
    console.log(`Writes scripts: ${name(status.choices.write)}`);
    console.log(`Reads aloud:    ${name(status.choices.voice)}`);
    console.log(`Listens:        ${name(status.choices.listen)}`);
    console.log("");
    for (const service of status.services) {
      const state = service.connected
        ? service.keyEnding
          ? `connected (key ending ${service.keyEnding})`
          : "allowed"
        : service.id === "voicestudio"
          ? status.voiceStudio.installed
            ? "installed, not allowed yet"
            : "not installed"
          : "not connected";
      console.log(`${service.name.padEnd(16)} ${state}`);
    }
  },
});

const voicesCommand = defineCommand({
  meta: {
    name: "voices",
    description: "List the voices for written reels, from the chosen service.",
  },
  args: { json: { type: "boolean", default: false, description: "Print them as JSON" } },
  async run({ args }) {
    const { voice } = await currentChoices();
    const listed =
      voice === "kokoro"
        ? kokoroVoices.map((entry) => ({ ...entry, detail: voiceReady() ? "" : "not installed" }))
        : (await voicesOf(voice as ServiceId)).map((entry) => ({
            ...entry,
            id: `${voice}:${entry.id}`,
          }));
    if (args.json) {
      console.log(JSON.stringify(listed, null, 2));
      return;
    }
    console.log(`Voices from ${serviceInfo(voice)?.name ?? "this computer"}:`);
    for (const entry of listed) {
      const detail = "detail" in entry && entry.detail ? `  ${entry.detail}` : "";
      console.log(`  ${entry.id.padEnd(28)} ${entry.name}${detail}`);
    }
    console.log('Use one with: ucut write "..." --voice <id>');
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
    write: writeCommand,
    sort: sortCommand,
    study: studyCommand,
    serve: serveCommand,
    setup: setupCommand,
    templates: templatesCommand,
    doctor: doctorCommand,
    render: renderCommand,
    mcp: mcpCommand,
    connect: connectCommand,
    disconnect: disconnectCommand,
    connections: connectionsCommand,
    voices: voicesCommand,
  },
});

const commands = [
  "make",
  "demo",
  "write",
  "sort",
  "study",
  "serve",
  "setup",
  "templates",
  "doctor",
  "render",
  "mcp",
  "connect",
  "disconnect",
  "connections",
  "voices",
];

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
  // Help is answered before anything runs, so `ucut mcp --help` doesn't start a server.
  if (argv.includes("--help") || argv.includes("-h")) {
    const subCommands = main.subCommands as Record<string, Parameters<typeof renderUsage>[0]>;
    const command = subCommands[first];
    return { code: 0, stdout: `${command ? await renderUsage(command, main) : ""}\n`, stderr: "" };
  }
  try {
    await runCommand(main, { rawArgs: argv });
    return { code: 0, stdout: "", stderr: "" };
  } catch (error) {
    return { code: 1, stdout: "", stderr: `${(error as Error).message}\n` };
  }
}
