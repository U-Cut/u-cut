import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  defaultReelLength,
  planScript,
  readPrompt,
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
import { ingest } from "./ingest.ts";
import { loadTracks, trackBeats } from "./library.ts";
import { defaultExcludedScenes, type MakeEvent } from "./make.ts";
import { jobsDir } from "./paths.ts";
import { type Quality, renderPlan } from "./render.ts";
import { sortMedia } from "./sort.ts";
import { speak, voiceReady } from "./voice.ts";

export interface StoryOptions {
  prompt: string;
  inputs: string[];
  output: string;
  /** A Kokoro voice, or null for words on screen only. */
  voice: string | null;
  quality: Quality;
  seed: number;
  vibe?: Vibe;
  aspect?: Aspect;
  duration?: number;
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
  const script = writeScript({
    request,
    scenes: scenesIn(items),
    vibe,
    duration,
    seed: options.seed,
  });

  let lines: ScriptLine[] = script;
  const { voice } = options;
  if (voice && voiceReady()) {
    lines = [];
    for (const [index, line] of script.entries()) {
      onEvent({ type: "progress", stage: "Voicing the script", progress: index / script.length });
      lines.push({ ...line, voice: await speak(line, voice) });
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

  const job = createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 12);
  const jobDir = join(jobsDir(), job);
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(join(jobDir, "script.txt"), `${lines.map((line) => line.text).join("\n")}\n`);

  onEvent({ type: "stage", stage: "Rendering" });
  const result = await renderPlan(plan, items, {
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
