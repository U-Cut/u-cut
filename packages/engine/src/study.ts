import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describeRecipe, type ReelMeasurements, recipeFrom } from "@u-cut/planner-rules";
import type { StyleRecipe } from "@u-cut/schema";
import { run } from "./exec.ts";
import { hf } from "./hf.ts";
import { probe } from "./probe.ts";
import { visionBinary } from "./vision.ts";

const framesPerSecond = 2;
const longestStudy = 90;
const darkEnding = 22;
/** The longest any one step may take, so a stuck tool can't freeze "Match a reel" for ever. */
const stepLimitMs = 50_000;

function json<T>(output: string): T {
  return JSON.parse(output.slice(output.indexOf("{"))) as T;
}

interface Look {
  luma: number;
  contrast: number;
  saturation: number;
  warmth: number;
}

async function readCuts(path: string): Promise<number[]> {
  const output = await hf(["measure", "cuts", path, "--json"], { timeoutMs: stepLimitMs });
  const report = json<{ cuts?: { t: number }[] }>(output);
  return (report.cuts ?? []).map((cut) => cut.t);
}

async function readBeats(path: string): Promise<{ beats: number[]; bpm: number | null }> {
  try {
    const output = await hf(["audio", path, "--only", "beats,bpm", "--json"], {
      timeoutMs: stepLimitMs,
    });
    const [item] =
      json<{ items?: { beats?: { times?: number[] }; bpm?: { value?: number | null } }[] }>(output)
        .items ?? [];
    return { beats: item?.beats?.times ?? [], bpm: item?.bpm?.value ?? null };
  } catch {
    // A reel with no sound is still a reel.
    return { beats: [], bpm: null };
  }
}

async function readLook(path: string, start = 0): Promise<Look> {
  const args = [
    "measure",
    "look",
    path,
    "--json",
    ...(start > 0 ? ["--start", String(start)] : []),
  ];
  return json<Look>(await hf(args, { timeoutMs: stepLimitMs }));
}

async function readText(path: string, duration: number): Promise<ReelMeasurements["text"]> {
  const binary = visionBinary();
  if (!binary) return [];
  const folder = await mkdtemp(join(tmpdir(), "ucut-study-"));
  try {
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-t",
      String(Math.min(duration, longestStudy)),
      "-i",
      path,
      "-vf",
      `fps=${framesPerSecond},scale=720:-2`,
      "-q:v",
      "4",
      join(folder, "%04d.jpg"),
    ]);
    const frames = (await readdir(folder)).sort().map((name) => join(folder, name));
    // Its log output is ignored: an unread pipe fills up and blocks the helper for good.
    const helper = spawn(binary, ["text"], { stdio: ["pipe", "pipe", "ignore"] });
    const found = new Map<string, ReelMeasurements["text"][number]["boxes"]>();
    const lines = createInterface({ input: helper.stdout });
    lines.on("line", (line) => {
      const result = JSON.parse(line) as {
        path: string;
        boxes?: ReelMeasurements["text"][number]["boxes"];
      };
      found.set(result.path, result.boxes ?? []);
    });
    helper.stdin.end(`${frames.join("\n")}\n`);
    // Words are a bonus: a reel can still be matched from its rhythm and colour without them.
    const stuck = setTimeout(() => helper.kill("SIGKILL"), stepLimitMs);
    await new Promise((resolve) => helper.on("close", resolve));
    clearTimeout(stuck);
    return frames.map((frame, index) => ({
      at: index / framesPerSecond,
      boxes: found.get(frame) ?? [],
    }));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export interface Study {
  recipe: StyleRecipe;
  description: string;
}

/**
 * Learns a reel's structure: its rhythm, how its words look, and its colour. The result holds no
 * pixels, no sound and no words from the reel, and the reel itself is never stored.
 */
export async function studyReel(path: string): Promise<Study> {
  const item = await probe("reference", path, "video");
  const duration = item.duration ?? 0;
  const [cuts, sound, look, text, ending] = await Promise.all([
    readCuts(path),
    readBeats(path),
    readLook(path),
    readText(path, duration),
    readLook(path, Math.max(0, duration - 0.3)),
  ]);
  const recipe = recipeFrom({
    width: item.w,
    height: item.h,
    duration,
    cuts,
    ...sound,
    look,
    text,
    endsDark: ending.luma < darkEnding && look.luma > darkEnding * 2,
  });
  const description = describeRecipe(recipe);
  return { recipe: { ...recipe, notes: description }, description };
}
