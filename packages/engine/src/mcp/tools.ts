import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Aspect, type EditPlan, type MediaItem, Vibe } from "@u-cut/schema";
import { z } from "zod";
import {
  currentChoices,
  defaultVoiceFor,
  type ServiceId,
  serviceInfo,
  splitVoice,
  voicesOf,
} from "../connections/index.ts";
import { makeDemo } from "../demo.ts";
import { doctor } from "../doctor.ts";
import { run } from "../exec.ts";
import { ingest } from "../ingest.ts";
import { loadJob, renderJob, saveJobPlan } from "../jobs.ts";
import { loadScenes, loadSounds, loadTemplates, loadTracks } from "../library.ts";
import { type MakeEvent, prepareReel } from "../make.ts";
import { homeDir } from "../paths.ts";
import { readRecording, speechReady } from "../recording.ts";
import type { Quality } from "../render.ts";
import { sortMedia } from "../sort.ts";
import { storedFolder } from "../store.ts";
import { makeStory } from "../story.ts";
import { studyReel } from "../study.ts";
import { speak, voiceFile, voiceReady, voices } from "../voice.ts";
import { appChange, appReel } from "./app-link.ts";
import { type Tool, tool } from "./protocol.ts";

const QualityArg = z.enum(["draft", "looks", "delivery"]).default("looks");
const paths = z.array(z.string().min(1)).min(1).describe("Files or folders, absolute or relative");
const output = z
  .string()
  .optional()
  .describe("Where to save the MP4. Left out, it goes in U-Cut's folder in Movies");
const job = z.string().min(1).describe("The job folder a tool returned, or its 12-letter name");

/** Paths from an assistant may start with ~, and are relative to where it's working. */
function expand(path: string): string {
  if (path === "~") return homedir();
  return resolve(path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
}

function outputPath(asked: string | undefined, name: string): string {
  if (asked) return expand(asked);
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  return join(homeDir(), `${name}-${stamp}.mp4`);
}

let turn: Promise<unknown> = Promise.resolve();

/** Heavy work takes turns: one render, listen or plan at a time, and cancelling stops waiting too. */
function inTurn<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  const mine = turn.then(() => {
    signal.throwIfAborted();
    return work();
  });
  turn = mine.catch(() => {});
  return mine;
}

function progressFrom(context: { progress(fraction: number, message?: string): void }) {
  const stages = [
    "Reading",
    "Sorting",
    "Studying",
    "Finding",
    "Writing",
    "Voicing",
    "Planning",
    "Rendering",
  ];
  return (event: MakeEvent) => {
    if (event.type === "stage") {
      const at = stages.findIndex((stage) => event.stage.startsWith(stage));
      context.progress(Math.max(0, at) / stages.length / 2, event.stage);
    } else if (event.type === "progress") {
      const rendering = ["rendering", "finishing", "preparing"].includes(event.stage);
      context.progress(rendering ? 0.5 + event.progress / 2 : event.progress / 2, event.stage);
    }
  };
}

function mediaSummary(item: MediaItem, names: Record<string, string> = {}) {
  return {
    id: item.id,
    name: names[item.id] ?? item.id,
    kind: item.kind,
    size: `${item.w}x${item.h}`,
    ...(item.duration ? { seconds: Math.round(item.duration * 10) / 10 } : {}),
    ...(item.takenAt ? { taken: item.takenAt } : {}),
    scene: item.labels[0]?.id ?? null,
    sceneConfidence: item.labels[0] ? Math.round(item.labels[0].score * 100) / 100 : null,
    moment: item.moment,
    nearCopyOf: item.quality.dupGroup,
    score: item.quality.score,
  };
}

function planSummary(plan: EditPlan) {
  return {
    template: plan.template,
    vibe: plan.vibe,
    aspect: plan.aspect,
    seconds: plan.duration,
    shots: plan.shots.length,
    words: plan.texts.map((text) => text.text),
  };
}

async function lengthOf(file: string): Promise<number> {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  return Math.round(Number(output) * 10) / 10;
}

async function readOne(path: string): Promise<MediaItem> {
  const { items } = await ingest([expand(path)]);
  const [item] = items;
  if (!item) throw new Error("U-Cut couldn't read that file.");
  return item;
}

export const tools: Tool[] = [
  tool({
    name: "status",
    title: "Check U-Cut",
    description:
      "Says what U-Cut can do on this computer: rendering, the voice, captions from speech, sorting, and which connected services each job uses. Call this first.",
    input: z.object({}),
    readOnly: true,
    async run() {
      const checks = await doctor();
      return {
        checks: checks.map((check) => ({ name: check.name, ok: check.ok, detail: check.detail })),
        voiceOnThisMac: voiceReady(),
        captionsOnThisMac: speechReady(),
        uses: await currentChoices(),
        jobsFolder: join(homeDir(), "jobs"),
      };
    },
  }),

  tool({
    name: "catalog",
    title: "List styles, vibes, scenes and voices",
    description:
      "Lists U-Cut's reel styles (templates), vibes, shapes, scene names used by sorting, music tracks, sound effects, and the voices available for written reels. Voice ids are Kokoro ids, or `service:id` for a connected service. A plan's `sfx` entries must use these sound files, each with its `length`.",
    input: z.object({}),
    readOnly: true,
    async run() {
      const choices = await currentChoices();
      const service = choices.voice === "kokoro" ? null : (choices.voice as ServiceId);
      const fromService = service
        ? await voicesOf(service).then(
            (list) => list.map((voice) => ({ ...voice, id: `${service}:${voice.id}` })),
            () => [],
          )
        : [];
      return {
        templates: loadTemplates().map((template) => ({
          id: template.manifest.id,
          name: template.manifest.name,
          vibes: template.manifest.vibes,
          aspects: template.manifest.aspects,
          seconds: template.manifest.durationRange,
        })),
        vibes: Vibe.options,
        shapes: { "9:16": "Tall", "1:1": "Square", "16:9": "Wide" },
        scenes: loadScenes().map((scene) => ({ id: scene.id, label: scene.label })),
        music: loadTracks().map((track) => ({
          file: track.file,
          vibe: track.vibe,
          bpm: track.bpm,
        })),
        soundEffects: loadSounds().map((sound) => ({
          file: sound.file,
          use: sound.use,
          length: sound.length,
        })),
        voices: [...voices, ...fromService],
        voiceUsedForWrittenReels: choices.voice,
      };
    },
  }),

  tool({
    name: "read_media",
    title: "Read and sort media",
    description:
      "Reads photos and clips, sorts them into scenes (beach, city at night and so on), groups them into moments and finds near-copies. Returns one entry per file. Nothing is changed or uploaded.",
    input: z.object({ paths }),
    readOnly: true,
    async run({ paths: inputs }, context) {
      const { items, skipped, names } = await ingest(inputs.map(expand), {
        onItem: (done, total) => context.progress((done / total) * 0.5, "Reading"),
      });
      const sorted = await sortMedia(items, (done, total) =>
        context.progress(0.5 + (done / total) * 0.5, "Sorting"),
      );
      return { media: sorted.map((item) => mediaSummary(item, names)), skipped };
    },
  }),

  tool({
    name: "plan_reel",
    title: "Plan a reel",
    description:
      "Plans a reel from photos and clips without rendering it, and keeps it as a job folder with its plan (plan.json) and its HyperFrames project (project/). Change the plan with save_plan, or edit project/index.html with the HyperFrames skills, then make the MP4 with render. Pass `like` to copy the rhythm and look of a reel you admire (only its structure is used).",
    input: z.object({
      paths,
      vibe: Vibe.default("chill"),
      template: z.string().default("travel-montage").describe("A template id from catalog"),
      aspect: Aspect.default("9:16"),
      duration: z.number().min(5).max(120).default(20).describe("Seconds to aim for"),
      title: z.string().max(80).default(""),
      seed: z.number().int().min(1).default(1).describe("Change it for a different cut"),
      like: z.string().optional().describe("A reel whose style to copy"),
      music: z.string().optional().describe("Your own music file"),
    }),
    async run(args, context) {
      const { jobDir, plan, items, names } = await inTurn(context.signal, () =>
        prepareReel(
          {
            inputs: args.paths.map(expand),
            template: args.template,
            vibe: args.vibe,
            aspect: args.aspect,
            duration: args.duration,
            seed: args.seed,
            title: args.title,
            ...(args.like ? { like: expand(args.like) } : {}),
            ...(args.music ? { music: expand(args.music) } : {}),
            writeProject: true,
            signal: context.signal,
          },
          progressFrom(context),
        ),
      );
      return {
        job: jobDir,
        project: join(jobDir, "project"),
        summary: planSummary(plan),
        media: items.map((item) => mediaSummary(item, names)),
        plan,
      };
    },
  }),

  tool({
    name: "get_plan",
    title: "Read a job's plan",
    description: "Returns a job's plan.json and a summary of the media it can use.",
    input: z.object({ job }),
    readOnly: true,
    async run(args) {
      const { dir, plan, items, names } = await loadJob(args.job);
      return {
        job: dir,
        summary: planSummary(plan),
        media: items.map((item) => mediaSummary(item, names)),
        plan,
      };
    },
  }),

  tool({
    name: "save_plan",
    title: "Save an edited plan",
    description:
      "Saves an edited plan.json into a job, after checking it against U-Cut's schema and the job's media. Times are in seconds. Shots must use media ids from the job. Then call render.",
    input: z.object({ job, plan: z.record(z.string(), z.unknown()).describe("The whole plan") }),
    async run(args) {
      const plan = await saveJobPlan(args.job, args.plan);
      return { saved: true, summary: planSummary(plan) };
    },
  }),

  tool({
    name: "render",
    title: "Render a job",
    description:
      "Renders a job to an MP4 with HyperFrames and balances the sound for phones. Without `project`, it composes the project again from plan.json; it refuses if project/ was edited, unless `force` is true. With `project: true`, it renders project/ as it stands, keeping edits made by hand or with the HyperFrames skills.",
    input: z.object({
      job,
      output,
      quality: QualityArg,
      project: z.boolean().default(false).describe("Render project/ as it is, keeping edits"),
      force: z
        .boolean()
        .default(false)
        .describe("Compose from the plan even if project/ was edited"),
    }),
    async run(args, context) {
      const { plan } = await loadJob(args.job);
      const saved = await inTurn(context.signal, () =>
        renderJob(args.job, {
          output: outputPath(args.output, plan.template),
          quality: args.quality as Quality,
          project: args.project,
          force: args.force,
          signal: context.signal,
          onProgress: ({ stage, progress }) => context.progress(progress, stage),
        }),
      );
      return { output: saved, seconds: await lengthOf(saved) };
    },
  }),

  tool({
    name: "study_reel",
    title: "Study a reel's style",
    description:
      "Measures a reel's cut rhythm, beat, colour and text placement, and describes its style in plain English. The reel's footage, sound and words are never kept or used.",
    input: z.object({ path: z.string().min(1) }),
    readOnly: true,
    async run(args) {
      const { recipe, description } = await studyReel(expand(args.path)).catch(() => {
        throw new Error("U-Cut couldn't read that as a video. Choose the reel's video file.");
      });
      return { description, recipe };
    },
  }),

  tool({
    name: "read_recording",
    title: "Read a screen recording",
    openWorld: true,
    description:
      "Listens to and watches a screen recording, and suggests the moments worth keeping for a demo, with what's said in each. Pass the product's name in `hints` so it's heard correctly. If the person chose a listening service in U-Cut, the recording's sound goes to that service; `heardWith` in the result names it.",
    input: z.object({
      path: z.string().min(1),
      hints: z.array(z.string().min(1).max(50)).max(50).default([]),
    }),
    async run(args, context) {
      const item = await readOne(args.path);
      if (item.kind !== "video") throw new Error("That isn't a video. Choose a screen recording.");
      const { listen } = await currentChoices();
      const reading = await inTurn(context.signal, () =>
        readRecording(item, { listen, hints: args.hints, signal: context.signal }),
      );
      return {
        seconds: item.duration ?? 0,
        sound: reading.sound,
        speech: reading.speech,
        heardWith: listen,
        moments: reading.moments.map((moment, index) => ({
          index,
          from: moment.in,
          to: moment.out,
          said: moment.quote,
          why: moment.why,
        })),
      };
    },
  }),

  tool({
    name: "make_demo",
    title: "Make a demo from a screen recording",
    openWorld: true,
    description:
      "Turns a screen recording into a product demo: the key moments, push-ins on the action, captions from what's said, and title and end cards with a name, colour and logo. Use read_recording first to choose moments to `skip`.",
    input: z.object({
      path: z.string().min(1),
      name: z.string().max(60).default(""),
      colour: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default("#7b5cff"),
      logo: z.string().optional(),
      aspect: Aspect.optional().describe("The recording's own shape if left out"),
      captions: z.boolean().default(true),
      skip: z.array(z.number().int().min(0)).default([]).describe("Moment indexes to leave out"),
      hints: z.array(z.string().min(1).max(50)).max(50).default([]),
      output,
      quality: QualityArg,
    }),
    async run(args, context) {
      const { listen } = await currentChoices();
      let job = "";
      const saved = await inTurn(context.signal, () =>
        makeDemo(
          {
            recording: expand(args.path),
            output: outputPath(args.output, "demo"),
            name: args.name,
            colour: args.colour,
            captions: args.captions,
            quality: args.quality as Quality,
            listen,
            hints: args.hints,
            skip: args.skip,
            signal: context.signal,
            fresh: true,
            ...(args.logo ? { logo: expand(args.logo) } : {}),
            ...(args.aspect ? { aspect: args.aspect } : {}),
          },
          (event) => {
            if (event.type === "done") job = event.job;
            progressFrom(context)(event);
          },
        ),
      );
      return { output: saved, job };
    },
  }),

  tool({
    name: "write_reel",
    title: "Make a reel from words",
    openWorld: true,
    description:
      "Makes a reel around a spoken script. Write the script yourself in `lines` (3 to 8 words each, one thought per line), or give a `prompt` sentence and U-Cut writes it. With `paths`, lines play over the person's photos, matched by `scene`; without, over moving type and colour. The voice reads each line unless `voice` is null.",
    input: z.object({
      prompt: z.string().max(4000).default(""),
      lines: z
        .array(
          z.object({
            text: z.string().min(1).max(160),
            scene: z.string().nullable().optional().describe("A scene id from read_media"),
          }),
        )
        .max(40)
        .optional(),
      paths: z.array(z.string().min(1)).default([]),
      voice: z
        .string()
        .nullable()
        .optional()
        .describe(
          "A voice id from catalog, or null for words only. Left out, U-Cut's chosen voice",
        ),
      vibe: Vibe.optional(),
      aspect: Aspect.optional(),
      duration: z.number().min(5).max(120).optional(),
      seed: z.number().int().min(1).default(1),
      output,
      quality: QualityArg,
    }),
    async run(args, context) {
      if (!args.prompt && !args.lines?.length) {
        throw new Error("Give either a prompt or the lines to say.");
      }
      let known: string[] = [];
      if (args.paths.length > 0) {
        const { items } = await ingest(args.paths.map(expand));
        if (items.length === 0)
          throw new Error("There are no photos or clips U-Cut can use in those paths.");
        known = [
          ...new Set(items.flatMap((item) => item.labels.slice(0, 1).map((label) => label.id))),
        ];
      }
      const unknown = [
        ...new Set(
          (args.lines ?? [])
            .map((line) => line.scene)
            .filter(
              (scene): scene is string => typeof scene === "string" && !known.includes(scene),
            ),
        ),
      ];
      const choices = await currentChoices();
      const voice = args.voice === undefined ? await defaultVoiceFor(choices) : args.voice;
      let job = "";
      const saved = await inTurn(context.signal, () =>
        makeStory(
          {
            prompt: args.prompt || (args.lines ?? []).map((line) => line.text).join(" "),
            inputs: args.paths.map(expand),
            output: outputPath(args.output, "reel"),
            voice,
            quality: args.quality as Quality,
            seed: args.seed,
            writer: choices.write,
            signal: context.signal,
            fresh: true,
            ...(args.lines?.length ? { lines: args.lines } : {}),
            ...(args.vibe ? { vibe: args.vibe } : {}),
            ...(args.aspect ? { aspect: args.aspect } : {}),
            ...(args.duration ? { duration: args.duration } : {}),
          },
          (event) => {
            if (event.type === "done") job = event.job;
            progressFrom(context)(event);
          },
        ),
      );
      return {
        output: saved,
        job,
        ...(unknown.length > 0
          ? {
              note: `These scenes aren't in the media, so those lines play over anything: ${unknown.join(", ")}.`,
            }
          : {}),
      };
    },
  }),

  tool({
    name: "speak",
    title: "Read a line aloud",
    openWorld: true,
    description:
      "Reads one line in a voice and returns the WAV file, to hear a voice before using it in write_reel.",
    input: z.object({
      text: z.string().min(1).max(160),
      voice: z.string().default("af_heart"),
      speed: z.number().min(0.5).max(2).default(1),
    }),
    async run(args, context) {
      const { service } = splitVoice(args.voice);
      if (service === "kokoro" && !voiceReady()) {
        throw new Error("The voice on this Mac isn't installed. Run `ucut setup --voice`.");
      }
      if (service !== "kokoro" && !serviceInfo(service))
        throw new Error("That isn't a voice U-Cut knows.");
      const spoken = await speak(
        { text: args.text, speed: args.speed },
        args.voice,
        context.signal,
      );
      return { file: join(storedFolder(spoken.src), voiceFile), seconds: spoken.length };
    },
  }),

  tool({
    name: "app_reel",
    title: "Read the reel open in U-Cut",
    description:
      'Reads the reel someone has open in the U-Cut app, from the link they copied with "Give this reel to your assistant". Returns its script, title, vibe, length, shape and the scenes in its media.',
    input: z.object({ link: z.string().min(1) }),
    readOnly: true,
    run: (args) => appReel(args.link),
  }),

  tool({
    name: "app_change",
    title: "Change the reel open in U-Cut",
    description:
      "Sends changes to the reel open in the U-Cut app. They appear in its window straight away as one edit the person can undo. Lines replace the whole script of a written reel.",
    input: z.object({
      link: z.string().min(1),
      lines: z.array(z.string().min(1).max(160)).min(1).max(40).optional(),
      title: z.string().max(80).optional(),
      vibe: Vibe.optional(),
      duration: z.number().min(5).max(120).optional(),
      aspect: Aspect.optional(),
      seed: z.number().int().min(1).optional(),
    }),
    run: ({ link, ...change }) => appChange(link, change),
  }),
];
