import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { writeWithClaude } from "@u-cut/planner-api";
import {
  defaultReelLength,
  planScript,
  readPrompt,
  scriptFrom,
  usableItems,
  writeScript,
} from "@u-cut/planner-rules";
import {
  type Aspect,
  EditPlan,
  type MediaItem,
  type ScriptLine,
  type Vibe,
  validate,
} from "@u-cut/schema";
import { keyFor, splitVoice } from "./connections/index.ts";
import { ingest } from "./ingest.ts";
import { loadTracks, trackBeats } from "./library.ts";
import { defaultExcludedScenes, jobName, type MakeEvent } from "./make.ts";
import { jobsDir } from "./paths.ts";
import { type Quality, renderPlan } from "./render.ts";
import { sortMedia } from "./sort.ts";
import { speak, voiceReady } from "./voice.ts";

export interface StoryOptions {
  prompt: string;
  inputs: string[];
  output: string;
  /** A Kokoro voice, `service:id` for a connected service, or null for words on screen only. */
  voice: string | null;
  quality: Quality;
  seed: number;
  vibe?: Vibe;
  aspect?: Aspect;
  duration?: number;
  /** Lines someone or an assistant wrote. When set, nothing else writes the script. */
  lines?: { text: string; scene?: string | null | undefined }[];
  /** Who writes the script when no lines are given. Claude needs a connected key. */
  writer?: "rules" | "claude";
  signal?: AbortSignal;
  /** Give the job a folder of its own, for an assistant that may edit it afterwards. */
  fresh?: boolean;
}

/** The scenes in someone's media, in the order they happened. */
export function scenesIn(items: MediaItem[]): string[] {
  const usable = usableItems(items, defaultExcludedScenes);
  return [...new Set(usable.flatMap((item) => item.labels.slice(0, 1).map((label) => label.id)))];
}

export function trackFor(vibe: Vibe) {
  const track = loadTracks().find((entry) => entry.vibe === vibe);
  if (!track) throw new Error(`There's no music for the ${vibe} vibe.`);
  return { src: track.file, length: track.length, bpm: trackBeats(track).bpm };
}

/** From a sentence, and any media, to a finished reel. */
export async function makeStory(
  options: StoryOptions,
  onEvent: (event: MakeEvent) => void = () => {},
): Promise<string> {
  const request = readPrompt(options.prompt);
  let items: MediaItem[] = [];
  if (options.inputs.length > 0) {
    onEvent({ type: "stage", stage: "Reading your media" });
    const read = await ingest(options.inputs);
    onEvent({ type: "stage", stage: "Sorting your media" });
    items = await sortMedia(read.items);
  }

  onEvent({ type: "stage", stage: "Writing the script" });
  const vibe = options.vibe ?? request.vibe ?? "chill";
  const duration = options.duration ?? request.duration ?? defaultReelLength;
  const scenes = scenesIn(items);
  let script: ScriptLine[] = options.lines?.length
    ? scriptFrom(options.lines, vibe, scenes)
    : writeScript({ request, scenes, vibe, duration, seed: options.seed });
  if (!options.lines?.length && options.writer === "claude") {
    const apiKey = await keyFor("claude");
    if (!apiKey) {
      onEvent({
        type: "skipped",
        name: "Claude",
        reason: "isn't connected, so run `ucut connect claude`",
      });
    } else {
      try {
        script = await writeWithClaude({
          prompt: options.prompt,
          request,
          scenes,
          vibe,
          duration,
          apiKey,
          ...(options.signal ? { signal: options.signal } : {}),
        });
      } catch (error) {
        onEvent({
          type: "skipped",
          name: "Claude's script",
          reason: `didn't arrive: ${(error as Error).message}`,
        });
      }
    }
  }

  let lines: ScriptLine[] = script;
  const { voice } = options;
  const kokoro = voice !== null && splitVoice(voice).service === "kokoro";
  if (voice && (!kokoro || voiceReady())) {
    lines = [];
    for (const [index, line] of script.entries()) {
      onEvent({ type: "progress", stage: "Voicing the script", progress: index / script.length });
      options.signal?.throwIfAborted();
      lines.push({ ...line, voice: await speak(line, voice, options.signal) });
    }
  } else if (voice) {
    onEvent({
      type: "skipped",
      name: "The voice",
      reason: "isn't installed, so run `ucut setup --voice`",
    });
  }

  onEvent({ type: "stage", stage: "Planning the edit" });
  const checked = validate(
    EditPlan,
    planScript({
      lines,
      items,
      excludedScenes: defaultExcludedScenes,
      vibe,
      aspect: options.aspect ?? request.aspect ?? "9:16",
      seed: options.seed,
      music: trackFor(vibe),
      target: duration,
    }),
    "plan.json",
  );
  if (!checked.ok) throw new Error(checked.errors.join(" "));
  const plan = checked.value;

  const jobDir = join(jobsDir(), jobName(plan, options.fresh === true));
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(join(jobDir, "script.txt"), `${lines.map((line) => line.text).join("\n")}\n`);
  await writeFile(join(jobDir, "media.json"), `${JSON.stringify(items, null, 2)}\n`);

  onEvent({ type: "stage", stage: "Rendering" });
  options.signal?.throwIfAborted();
  const result = await renderPlan(plan, items, {
    ...(options.signal ? { signal: options.signal } : {}),
    quality: options.quality,
    projectDir: join(jobDir, "project"),
    onProgress: ({ stage, progress }) => onEvent({ type: "progress", stage, progress }),
  });
  const output = resolve(
    options.output.endsWith(".mp4") ? options.output : `${options.output}.mp4`,
  );
  await mkdir(dirname(output), { recursive: true });
  await copyFile(result.path, output);
  onEvent({
    type: "done",
    output,
    job: jobDir,
    shots: lines.length,
    duration: plan.duration,
    cached: result.cached,
  });
  return output;
}
