import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { matchTrack, matchVibe, planRules } from "@u-cut/planner-rules";
import {
  type Aspect,
  EditPlan,
  type MediaItem,
  type StyleRecipe,
  type Vibe,
  validate,
} from "@u-cut/schema";
import { musicLength } from "./audio-length.ts";
import { detectBeats } from "./beats.ts";
import { ingest, type Skipped } from "./ingest.ts";
import { findTemplate, loadTracks, trackBeats } from "./library.ts";
import { jobsDir } from "./paths.ts";
import { type Quality, renderPlan } from "./render.ts";
import { sortMedia } from "./sort.ts";
import { storeFile } from "./store.ts";
import { studyReel } from "./study.ts";

export interface MakeOptions {
  inputs: string[];
  output: string;
  template: string;
  vibe: Vibe;
  aspect: Aspect;
  duration: number;
  seed: number;
  title: string;
  quality: Quality;
  music?: string;
  /** A reel to copy the style of. Only its structure is used. */
  like?: string;
  workers?: number;
  excludedScenes?: string[];
}

/** Screenshots rarely belong in a reel, so they're left out until someone adds them back. */
export const defaultExcludedScenes = ["documents"];

export type MakeEvent =
  | { type: "stage"; stage: string }
  | { type: "progress"; stage: string; progress: number }
  | { type: "skipped"; name: string; reason: string }
  | { type: "recipe"; description: string }
  | { type: "done"; output: string; job: string; shots: number; duration: number; cached: boolean };

export function planFor(
  items: MediaItem[],
  options: Pick<MakeOptions, "template" | "vibe" | "aspect" | "duration" | "seed" | "title"> & {
    excludedScenes?: string[];
    recipe?: StyleRecipe;
  },
  music: Parameters<typeof planRules>[0]["music"],
): EditPlan {
  const plan = planRules({
    items,
    template: findTemplate(options.template).manifest,
    vibe: options.vibe,
    aspect: options.aspect,
    duration: options.duration,
    music,
    copy: { title: options.title },
    excludedScenes: options.excludedScenes ?? defaultExcludedScenes,
    recipe: options.recipe ?? null,
    seed: options.seed,
  });
  const checked = validate(EditPlan, plan, "plan.json");
  if (!checked.ok) throw new Error(checked.errors.join(" "));
  return checked.value;
}

async function musicFor(options: MakeOptions, recipe?: StyleRecipe) {
  if (options.music) {
    const stored = await storeFile(resolve(options.music));
    const beats = await detectBeats(stored.path);
    return { src: stored.path, length: await musicLength(stored.path), beats };
  }
  const tracks = loadTracks();
  const track = recipe ? matchTrack(recipe, tracks) : tracks.find((t) => t.vibe === options.vibe);
  if (!track) throw new Error(`There's no music for the ${options.vibe} vibe.`);
  return { src: track.file, length: track.length, beats: trackBeats(track) };
}

function logSkipped(skipped: Skipped[], onEvent: (event: MakeEvent) => void) {
  for (const { name, reason } of skipped) onEvent({ type: "skipped", name, reason });
}

/** The whole pipeline, from a pile of files to a finished MP4. */
export async function make(
  options: MakeOptions,
  onEvent: (event: MakeEvent) => void = () => {},
): Promise<string> {
  onEvent({ type: "stage", stage: "Reading your media" });
  const { items, skipped } = await ingest(options.inputs, {
    onItem: (done, total) => {
      onEvent({ type: "progress", stage: "Reading your media", progress: done / total });
    },
  });
  logSkipped(skipped, onEvent);

  onEvent({ type: "stage", stage: "Sorting your media" });
  const sorted = await sortMedia(items, (done, total) => {
    onEvent({ type: "progress", stage: "Sorting your media", progress: done / total });
  });

  let styled = options;
  let recipe: StyleRecipe | undefined;
  if (options.like) {
    onEvent({ type: "stage", stage: "Studying your reel" });
    ({ recipe } = await studyReel(resolve(options.like)));
    onEvent({ type: "recipe", description: recipe.notes });
    styled = {
      ...options,
      recipe,
      template: "recipe",
      vibe: matchVibe(recipe),
      aspect: recipe.aspect,
      duration: recipe.duration,
    } as MakeOptions;
  }

  onEvent({ type: "stage", stage: "Planning the edit" });
  const music = await musicFor(styled, recipe);
  const plan = planFor(sorted, styled, music);
  const job = createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 12);
  const jobDir = join(jobsDir(), job);
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(join(jobDir, "media.json"), `${JSON.stringify(sorted, null, 2)}\n`);

  onEvent({ type: "stage", stage: "Rendering" });
  const result = await renderPlan(plan, sorted, {
    quality: options.quality,
    projectDir: join(jobDir, "project"),
    ...(options.workers ? { workers: options.workers } : {}),
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
    shots: plan.shots.length,
    duration: plan.duration,
    cached: result.cached,
  });
  return output;
}
