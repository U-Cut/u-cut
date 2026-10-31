import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  decodePrint,
  type LearnedExample,
  type SceneLabel,
  type SceneModel,
  type StoredModel,
  sortIntoScenes,
  unpackModel,
} from "@u-cut/classify";
import type { MediaItem } from "@u-cut/schema";
import { displayName, grabFrame } from "./derive.ts";
import { homeDir, repoRoot } from "./paths.ts";
import { derived, storedFolder } from "./store.ts";
import { type VisionResult, vision } from "./vision.ts";

const modelPath = join(repoRoot, "classifiers/scene-model.json");
const framesPerClip = 5;
const signalsName = "signals.json";
/** Sharpness is a raw filter variance. This is where a photo starts to look properly sharp. */
const sharpEnough = 4000;

let model: SceneModel | undefined;

export function sceneModel(): SceneModel | undefined {
  if (!model && existsSync(modelPath)) {
    model = unpackModel(JSON.parse(readFileSync(modelPath, "utf8")) as StoredModel);
  }
  return model;
}

function learnedPath() {
  return join(homeDir(), "learned.json");
}

interface StoredExample {
  label: string;
  print: string;
}

/** Corrections people make, kept on this computer so sorting improves for next time. */
export async function loadLearned(): Promise<LearnedExample[]> {
  const text = await readFile(learnedPath(), "utf8").catch(() => "[]");
  return (JSON.parse(text) as StoredExample[]).map((example) => ({
    label: example.label,
    print: decodePrint(example.print),
  }));
}

export async function addLearned(label: string, print: string) {
  const text = await readFile(learnedPath(), "utf8").catch(() => "[]");
  const examples = (JSON.parse(text) as StoredExample[]).filter((entry) => entry.print !== print);
  examples.push({ label, print });
  await mkdir(dirname(learnedPath()), { recursive: true });
  await writeFile(learnedPath(), JSON.stringify(examples));
}

/** Reads a photo, or a few frames across a clip. Results are stored, so each file is read once. */
export async function readSignals(item: MediaItem): Promise<VisionResult[] | undefined> {
  const helper = vision();
  if (!helper) return undefined;

  const stored = await derived(item.id, signalsName, async (partial) => {
    const paths: string[] = [];
    if (item.kind === "photo") {
      paths.push(join(storedFolder(item.id), displayName));
    } else {
      const length = item.duration ?? 1;
      const count = Math.max(1, Math.min(framesPerClip, Math.ceil(length)));
      for (let index = 0; index < count; index += 1) {
        const frame = join(dirname(partial), `frame-${index}.jpg`);
        await grabFrame(item.path, ((index + 0.5) / count) * length, frame, 720);
        paths.push(frame);
      }
    }
    const results = await Promise.all(paths.map((path) => helper.analyse(path)));
    await writeFile(partial, JSON.stringify(results));
    if (item.kind === "video") await Promise.all(paths.map((path) => rm(path, { force: true })));
  });
  return JSON.parse(await readFile(stored, "utf8")) as VisionResult[];
}

const average = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/** A clip's scene is whatever most of its frames show. */
function majorityScene(perFrame: SceneLabel[][]): SceneLabel[] {
  const votes = new Map<string, { count: number; score: number }>();
  for (const labels of perFrame) {
    const top = labels[0];
    if (!top) continue;
    const vote = votes.get(top.id) ?? { count: 0, score: 0 };
    votes.set(top.id, { count: vote.count + 1, score: vote.score + top.score });
  }
  return [...votes.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id, vote]) => ({ id, score: Number((vote.score / vote.count).toFixed(3)) }));
}

/** Turns stored signals into scenes and quality, using the current model and corrections. */
export function applySignals(
  item: MediaItem,
  frames: VisionResult[],
  learned: LearnedExample[],
): MediaItem {
  const usable = frames.filter((frame) => frame.print && !frame.error);
  const scenes = sceneModel();
  if (usable.length === 0 || !scenes) return item;

  const perFrame = usable.map((frame) =>
    sortIntoScenes(
      scenes,
      {
        print: decodePrint(frame.print ?? ""),
        labels: frame.labels ?? [],
        ...(frame.utility === undefined ? {} : { utility: frame.utility }),
        ...(frame.faceArea === undefined ? {} : { faceArea: frame.faceArea }),
      },
      learned,
    ),
  );
  const collect = (pick: (frame: VisionResult) => number | undefined) =>
    usable.flatMap((frame) => {
      const value = pick(frame);
      return value === undefined ? [] : [value];
    });
  const sharpness = average(collect((frame) => frame.sharpness));
  const round = (value: number | null) => (value === null ? null : Number(value.toFixed(3)));
  const focus = usable.find((frame) => frame.focus)?.focus;

  return {
    ...item,
    labels: perFrame.length === 1 ? (perFrame[0] ?? []) : majorityScene(perFrame),
    quality: {
      ...item.quality,
      sharpness: sharpness === null ? null : round(Math.min(1, sharpness / sharpEnough)),
      exposure: round(average(collect((frame) => frame.exposure))),
      faces: Math.max(0, ...collect((frame) => frame.faces)),
      score: round(average(collect((frame) => frame.score))),
    },
    focus: focus ? { x: round(focus[0]) ?? 0.5, y: round(focus[1]) ?? 0.5 } : null,
  };
}

export const firstPrint = (frames: VisionResult[]) => frames.find((frame) => frame.print)?.print;
