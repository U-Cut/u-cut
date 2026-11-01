import type { Aspect, EditPlan, MediaItem, ScriptLine, Vibe } from "@u-cut/schema";
import { motionFor, PlanError, usableItems } from "./plan.ts";
import { seededRng } from "./rng.ts";
import { vibes } from "./vibes.ts";

type Shot = EditPlan["shots"][number];

const lead = 0.3;
const shortestGap = 0.2;
const longestGap = 1.5;
const tail = 0.9;
const fadeOut = 0.5;
const fps = 30;
const speechPace = 2.6;
const shortestLine = 1.1;
/** A line this long can hold two pictures. */
const twoShotsFrom = 3.4;

/** Colours for a reel with no pictures, from a dark edge to a bright glow. */
const palettes: Record<Vibe, [string, string][]> = {
  chill: [
    ["#0f3b4c", "#3aa6a0"],
    ["#1b2a49", "#5f8fd9"],
    ["#1d4036", "#7fc8a0"],
  ],
  hype: [
    ["#2b0a3d", "#ff2e88"],
    ["#1a0f00", "#ffb300"],
    ["#071a52", "#08c7fe"],
  ],
  cinematic: [
    ["#0b0b0f", "#b8862d"],
    ["#0f1418", "#4c6b80"],
    ["#1a0d0a", "#a6492e"],
  ],
  nostalgic: [
    ["#3b2418", "#d9a066"],
    ["#33202e", "#c98a9b"],
    ["#2a2a1f", "#b8a96a"],
  ],
};

const round = (value: number) => Math.round(value * 1000) / 1000;
const wordCount = (text: string) => text.trim().split(/\s+/).length;

/** How long a line takes, measured once it's voiced and estimated until then. */
export function lineLength(line: ScriptLine): number {
  if (line.voice) return line.voice.length;
  return round(Math.max(shortestLine, wordCount(line.text) / (speechPace * line.speed)));
}

export interface ScriptPlanInput {
  lines: ScriptLine[];
  items: MediaItem[];
  excludedScenes: string[];
  vibe: Vibe;
  aspect: Aspect;
  seed: number;
  music: { src: string; length: number; bpm: number | null };
  /** The length someone asked for. Spare time goes into the pauses between lines. */
  target?: number;
}

/** Hands out media, matching the line's scene first and repeating only once everything's used. */
function picker(items: MediaItem[], rng: () => number) {
  const ranked = [...items]
    .map((item) => ({ item, rank: (item.quality.score ?? 0.5) + rng() * 0.3 }))
    .sort((a, b) => b.rank - a.rank)
    .map((entry) => entry.item);
  let unused = [...ranked];
  return (scene: string | null, length: number) => {
    if (unused.length === 0) unused = [...ranked];
    const fits = (item: MediaItem) => item.kind === "photo" || (item.duration ?? 0) >= length;
    const matches = unused.filter((item) => item.labels[0]?.id === scene);
    const chosen = matches.find(fits) ?? unused.find(fits) ?? unused[0];
    unused = unused.filter((item) => item !== chosen);
    return chosen as MediaItem;
  };
}

function shotFrom(
  item: MediaItem,
  start: number,
  end: number,
  vibe: Vibe,
  rng: () => number,
): Shot {
  const length = end - start;
  const room = Math.max(0, (item.duration ?? 0) - length);
  const from = item.kind === "video" ? round(room * (0.2 + rng() * 0.6)) : 0;
  return {
    media: item.id,
    in: from,
    out: round(from + length),
    start: round(start),
    end: round(end),
    motion: motionFor({ item, from, to: from + length }, vibes[vibe], rng),
    crop: { x: 0, y: 0, w: 1, h: 1 },
    focus: { x: item.focus?.x ?? 0.5, y: item.focus?.y ?? 0.5 },
  };
}

/**
 * Builds a reel around its words. The voice sets the timing, the pictures follow it, and with no
 * pictures at all each line gets its own moving colour.
 */
export function planScript(input: ScriptPlanInput): EditPlan {
  const { lines, vibe, aspect, seed, music } = input;
  if (lines.length === 0) throw new PlanError("Write at least one line to make a reel.");

  const rng = seededRng(seed);
  const media = usableItems(input.items, input.excludedScenes);
  const pick = picker(media, rng);
  const shots: Shot[] = [];
  const texts: EditPlan["texts"] = [];
  const voice: NonNullable<EditPlan["voice"]> = [];
  const backdrops: NonNullable<EditPlan["backdrops"]> = [];
  const palette = palettes[vibe];
  const spoken = lines.reduce((sum, line) => sum + lineLength(line), 0);
  const spare = (input.target ?? 0) - spoken - lead - tail;
  const gap = round(
    Math.max(shortestGap, Math.min(longestGap, spare / Math.max(1, lines.length - 1))),
  );
  let at = lead;

  lines.forEach((line, index) => {
    const length = lineLength(line);
    const start = round(at);
    const end = round(at + length);
    const last = index === lines.length - 1;
    // Pictures hold over the pause, so there's never a gap between them.
    const from = index === 0 ? 0 : start;
    const to = round(end + (last ? tail : gap));

    texts.push({ text: line.text, start, end: round(to - 0.02), style: "kinetic" });
    if (line.voice) {
      voice.push({ src: line.voice.src, at: start, vol: 1, text: line.text, length });
    }
    if (media.length > 0) {
      const middle = to - from >= twoShotsFrom && media.length > 1 ? round((from + to) / 2) : to;
      shots.push(shotFrom(pick(line.scene, middle - from), from, middle, vibe, rng));
      if (middle < to) shots.push(shotFrom(pick(line.scene, to - middle), middle, to, vibe, rng));
    } else {
      const [edge, glow] = palette[(seed + index) % palette.length] as [string, string];
      backdrops.push({ start: from, end: to, edge, glow });
    }
    at = end + gap;
  });

  const duration = round(at - gap + tail);
  return {
    schemaVersion: 1,
    template: "explainer",
    vibe,
    aspect,
    fps,
    seed,
    duration,
    music: {
      src: music.src,
      bpm: music.bpm,
      start: 0,
      length: music.length,
      volume: voice.length > 0 ? 0.16 : 0.8,
    },
    grade: media.length > 0 ? vibes[vibe].grade : { temp: 0, contrast: 0, sat: 0 },
    ...(voice.length > 0 ? { voice } : {}),
    shots,
    texts,
    ...(backdrops.length > 0 ? { backdrops } : {}),
    transitions: [{ type: "fade", at: round(duration - fadeOut), duration: fadeOut }],
    sfx: [],
  };
}
