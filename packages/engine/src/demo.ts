import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { planDemo } from "@u-cut/planner-rules";
import { type Aspect, EditPlan, type MediaItem, validate } from "@u-cut/schema";
import { ingest } from "./ingest.ts";
import { loadTracks } from "./library.ts";
import { jobName, type MakeEvent } from "./make.ts";
import { jobsDir } from "./paths.ts";
import { readRecording } from "./recording.ts";
import { type Quality, renderPlan } from "./render.ts";

export interface DemoOptions {
  recording: string;
  output: string;
  name: string;
  colour: string;
  logo?: string;
  aspect?: Aspect;
  captions: boolean;
  quality: Quality;
  /** `whisper` on this Mac, or a connected service. */
  listen?: string;
  /** Words to listen for. The name on the cards is always one. */
  hints?: string[];
  /** Moments to leave out, counted from 0 in the order U-Cut finds them. */
  skip?: number[];
  signal?: AbortSignal;
  /** Give the job a folder of its own, for an assistant that may edit it afterwards. */
  fresh?: boolean;
}

/** A recording keeps its own shape unless asked otherwise, so nothing on screen gets small. */
export function shapeOf(item: MediaItem): Aspect {
  if (item.w === item.h) return "1:1";
  return item.w > item.h ? "16:9" : "9:16";
}

export function demoTrack() {
  const track = loadTracks().find((entry) => entry.vibe === "chill");
  if (!track) throw new Error("There's no music for a demo.");
  return { src: track.file, length: track.length, bpm: track.bpm };
}

/** From one screen recording to a finished demo, keeping every moment U-Cut suggests. */
export async function makeDemo(
  options: DemoOptions,
  onEvent: (event: MakeEvent) => void = () => {},
): Promise<string> {
  onEvent({ type: "stage", stage: "Reading your recording" });
  const { items } = await ingest([options.recording, ...(options.logo ? [options.logo] : [])]);
  const [item, logo] = items;
  if (item?.kind !== "video") throw new Error("That isn't a video. Choose a screen recording.");

  onEvent({ type: "stage", stage: "Finding the moments" });
  const hints = [
    ...new Set([options.name, ...(options.hints ?? [])].map((hint) => hint.trim())),
  ].filter(Boolean);
  const {
    sound,
    words,
    moments: found,
    speech,
  } = await readRecording(item, {
    ...(options.listen ? { listen: options.listen } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    hints,
  });
  options.signal?.throwIfAborted();
  const moments = found.filter((_, index) => !options.skip?.includes(index));
  if (speech === "no-model") {
    onEvent({
      type: "skipped",
      name: "Captions",
      reason: "need the speech model, so run `ucut setup --speech`",
    });
  }

  onEvent({ type: "stage", stage: "Planning the edit" });
  const checked = validate(
    EditPlan,
    planDemo({
      source: { id: item.id, w: item.w, h: item.h, sound },
      words,
      moments,
      captions: options.captions,
      brand: { name: options.name, colour: options.colour, ...(logo ? { logo: logo.id } : {}) },
      aspect: options.aspect ?? shapeOf(item),
      music: demoTrack(),
    }),
    "plan.json",
  );
  if (!checked.ok) throw new Error(checked.errors.join(" "));
  const plan = checked.value;

  const jobDir = join(jobsDir(), jobName(plan, options.fresh === true));
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(join(jobDir, "media.json"), `${JSON.stringify(items, null, 2)}\n`);

  onEvent({ type: "stage", stage: "Rendering" });
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
    shots: plan.shots.length,
    duration: plan.duration,
    cached: result.cached,
  });
  return output;
}
