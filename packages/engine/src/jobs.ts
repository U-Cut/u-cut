import { existsSync, statSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { EditPlan, MediaItem, validate } from "@u-cut/schema";
import { z } from "zod";
import { loadTracks } from "./library.ts";
import { jobsDir, storeDir } from "./paths.ts";
import { projectEdited, type Quality, renderPlan, renderProject, writeProject } from "./render.ts";

/** A job is a folder: its plan, the media it uses, and the HyperFrames project made from them. */
export interface JobFolder {
  dir: string;
  plan: EditPlan;
  items: MediaItem[];
  /** Each file's own name, by media id. */
  names: Record<string, string>;
}

/** Takes a job's folder, or the name `ucut` printed for it. */
export function jobPath(job: string): string {
  return /^[a-f0-9]{12}$/.test(job) ? join(jobsDir(), job) : resolve(job);
}

export async function loadJob(job: string): Promise<JobFolder> {
  const dir = jobPath(job);
  const text = await readFile(join(dir, "plan.json"), "utf8").catch(() => {
    throw new Error(`There's no job at ${dir}. Use the folder \`ucut\` printed after "Project:".`);
  });
  const plan = validate(EditPlan, JSON.parse(text), "plan.json");
  if (!plan.ok) throw new Error(plan.errors.join(" "));
  const mediaText = await readFile(join(dir, "media.json"), "utf8").catch(() => "[]");
  const items = validate(z.array(MediaItem), JSON.parse(mediaText), "media.json");
  if (!items.ok) throw new Error(items.errors.join(" "));
  const names = JSON.parse(
    await readFile(join(dir, "names.json"), "utf8").catch(() => "{}"),
  ) as Record<string, string>;
  return { dir, plan: plan.value, items: items.value, names };
}

/** Checks an edited plan against the schema and the job's own media before keeping it. */
export async function saveJobPlan(job: string, plan: unknown): Promise<EditPlan> {
  const { dir, items } = await loadJob(job);
  const checked = validate(EditPlan, plan, "plan");
  if (!checked.ok) throw new Error(checked.errors.join(" "));
  if (checked.value.duration > 120) {
    throw new Error("A reel can be at most 120 seconds. Shorten the plan's duration.");
  }
  const music = checked.value.music.src;
  const libraryTrack = loadTracks().some((track) => track.file === music);
  const stored = isAbsolute(music) && resolve(music).startsWith(`${storeDir()}/`);
  if (!libraryTrack && !stored) {
    throw new Error(
      "The plan's music has to be one of U-Cut's tracks, or music the job already has.",
    );
  }
  const known = new Set(items.map((item) => item.id));
  const missing = checked.value.shots.map((shot) => shot.media).filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(
      `The plan uses media this job doesn't have: ${[...new Set(missing)].join(", ")}.`,
    );
  }
  await writeFile(join(dir, "plan.json"), `${JSON.stringify(checked.value, null, 2)}\n`);
  return checked.value;
}

export interface RenderJobOptions {
  output: string;
  quality: Quality;
  /** Render the project folder as it is, keeping hand edits, instead of composing it again. */
  project?: boolean;
  /** Compose the project again from the plan even though it was edited, losing those edits. */
  force?: boolean;
  onProgress?: (progress: { stage: string; progress: number }) => void;
  signal?: AbortSignal;
}

export async function renderJob(job: string, options: RenderJobOptions): Promise<string> {
  const { dir, plan, items } = await loadJob(job);
  const asked = resolve(options.output);
  // A folder as the output gets a named file inside it, never a hidden ".mp4".
  const output =
    options.output.endsWith("/") || (existsSync(asked) && statSync(asked).isDirectory())
      ? join(asked, `${basename(dir)}.mp4`)
      : asked.endsWith(".mp4")
        ? asked
        : `${asked}.mp4`;
  const shared = {
    quality: options.quality,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
  const projectDir = join(dir, "project");
  if (options.project) {
    if (!existsSync(join(projectDir, "index.html"))) {
      throw new Error(
        "This job has no project yet. Render it once, or plan it with the project written, first.",
      );
    }
    return renderProject(projectDir, plan, { ...shared, output });
  }
  if (!options.force && (await projectEdited(projectDir))) {
    throw new Error(
      "The project folder has edits that rendering from the plan would replace. To keep them, render the project as it is (--project, or project: true). To start again from the plan, use --force or force: true.",
    );
  }
  // A cached render skips composing, so forcing writes the project back from the plan here too.
  if (options.force) await writeProject(plan, items, projectDir);
  const result = await renderPlan(plan, items, { ...shared, projectDir });
  await mkdir(dirname(output), { recursive: true });
  await copyFile(result.path, output);
  return output;
}

export const jobName = (dir: string) => basename(dir);
