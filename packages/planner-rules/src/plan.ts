import type { BeatGrid, EditPlan, MediaItem, PlannerInput, TemplateManifest } from "@u-cut/schema";
import { seededRng } from "./rng.ts";
import { type VibeProfile, vibes } from "./vibes.ts";

export class PlanError extends Error {}

type Shot = EditPlan["shots"][number];
type Part = "hook" | "body" | "close";

/** Something a shot can be cut from: a photo, or a stretch of a video. */
interface Source {
  item: MediaItem;
  from: number;
  to: number;
}

const evenBeat = 0.6;
const shortestClip = 0.3;
const windowsPerVideo = 6;
const secondsPerWindow = 8;
const fps = 30;
const months =
  "January February March April May June July August September October November December".split(
    " ",
  );

const round = (value: number) => Math.round(value * 1000) / 1000;

function byTimeThenId(a: MediaItem, b: MediaItem): number {
  const time = (a.takenAt ?? "").localeCompare(b.takenAt ?? "");
  return time !== 0 ? time : a.id.localeCompare(b.id);
}

function sourcesFrom(items: MediaItem[]): Source[] {
  return items.flatMap((item): Source[] => {
    const length = item.duration ?? 0;
    if (item.kind === "photo") return [{ item, from: 0, to: Number.POSITIVE_INFINITY }];
    if (length < shortestClip) return [];
    const count = Math.min(windowsPerVideo, Math.ceil(length / secondsPerWindow));
    const span = length / count;
    return Array.from({ length: count }, (_, index) => ({
      item,
      from: index * span,
      to: (index + 1) * span,
    }));
  });
}

/** Keeps the story in order while taking a different spread of media for each seed. */
function pickInOrder(sources: Source[], count: number, rng: () => number): Source[] {
  if (sources.length <= count) return sources;
  const stride = sources.length / count;
  const picked = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    picked.add(Math.floor((index + rng()) * stride));
  }
  const chosen = sources.filter((_, index) => picked.has(index));
  const spare = sources.filter((_, index) => !picked.has(index));
  return [...chosen, ...spare];
}

/** Beat times measured from the start of the reel, carried on past the end of the track. */
function beatsFrom(grid: BeatGrid, startBeat: number, until: number): number[] {
  const known = grid.times.slice(startBeat);
  const origin = known[0] ?? 0;
  const relative = known.map((time) => time - origin);
  const interval = grid.bpm ? 60 / grid.bpm : evenBeat;
  let last = relative.at(-1);
  if (last === undefined) {
    relative.push(0);
    last = 0;
  }
  while (last < until) {
    last += interval;
    relative.push(last);
  }
  return relative;
}

function startBeatFor(grid: BeatGrid, rng: () => number): number {
  const bars = Math.floor(grid.times.length / 16);
  return grid.bpm && bars > 1 ? Math.floor(rng() * Math.min(bars, 4)) * 16 : 0;
}

function partOf(shotIndex: number, remaining: number, hookCount: number): Part {
  if (shotIndex < hookCount) return "hook";
  return remaining <= 1 ? "close" : "body";
}

function limitsFor(template: TemplateManifest, part: Part): { min: number; max: number } {
  const sections = template.sections;
  const section =
    part === "hook"
      ? sections[0]
      : part === "close"
        ? sections.at(-1)
        : (sections[1] ?? sections[0]);
  const slot = section?.slots[0];
  return { min: slot?.minDur ?? 0.4, max: slot?.maxDur ?? 5 };
}

/** Returns the whole number of beats nearest to `wanted` that fits the limits and the source. */
function fitBeats(
  beats: number[],
  from: number,
  wanted: number,
  limits: { min: number; max: number },
  available: number,
): number {
  const length = (count: number) =>
    (beats[from + count] ?? Number.POSITIVE_INFINITY) - (beats[from] ?? 0);
  let count = wanted;
  while (count < 32 && length(count) < limits.min) count += 1;
  while (count > 1 && (length(count) > limits.max || length(count) > available)) count -= 1;
  return length(count) > available ? 0 : count;
}

function framing(rng: () => number, scale: number) {
  const margin = (scale - 1) / (2 * scale);
  const offset = () => round((rng() * 2 - 1) * margin);
  return { x: round(0.5 + offset()), y: round(0.5 + offset()), scale: round(scale) };
}

function motionFor(source: Source, profile: VibeProfile, rng: () => number): Shot["motion"] {
  const still = { x: 0.5, y: 0.5, scale: 1 };
  if (source.item.kind === "video") {
    const scale = 1 + profile.motion / 3;
    return { type: "push-in", from: still, to: { ...still, scale: round(scale) } };
  }
  const roll = rng();
  const scale = 1 + profile.motion;
  if (roll < 0.4) return { type: "push-in", from: still, to: framing(rng, scale) };
  if (roll < 0.8) return { type: "pull-out", from: framing(rng, scale), to: still };
  return { type: "pan", from: framing(rng, scale), to: framing(rng, scale) };
}

function monthOf(items: MediaItem[]): string {
  const stamps = items.flatMap((item) => (item.takenAt ? [item.takenAt.slice(0, 7)] : []));
  const [year, month] = (stamps.sort()[0] ?? "").split("-");
  const name = months[Number(month) - 1];
  return year && name ? `${name} ${year}` : "";
}

export function planRules(input: PlannerInput): EditPlan {
  const { template, vibe, aspect, seed, music, copy } = input;
  const items = [...input.items].sort(byTimeThenId);
  const allSources = sourcesFrom(items);
  if (allSources.length === 0) {
    throw new PlanError("There's nothing to edit yet. Add at least one photo or clip.");
  }

  const rng = seededRng(seed);
  const profile = vibes[vibe];
  const startBeat = startBeatFor(music.beats, rng);
  const target = Math.min(input.duration, template.durationRange.max);
  const beats = beatsFrom(music.beats, startBeat, target + 16);
  const interval = (beats[1] ?? evenBeat) - (beats[0] ?? 0);
  const expected = Math.ceil(target / (profile.beats.body * interval));
  const hookCount = template.sections[0]?.slots[0]?.count ?? 1;
  // With far too little media, each shot holds for longer before the reel gets shorter.
  const stretch = allSources.length * 2 <= expected ? 2 : 1;
  const queue = pickInOrder(allSources, expected, rng);

  const shots: Shot[] = [];
  let beat = 0;
  for (const source of queue) {
    const start = beats[beat] ?? 0;
    const timeLeft = target - start;
    const shotsLeft = Math.min(queue.length - shots.length, Math.ceil(timeLeft / interval));
    const part = partOf(shots.length, shotsLeft, hookCount);
    const available = source.to - source.from;
    const wanted = profile.beats[part] * stretch;
    const count = fitBeats(beats, beat, wanted, limitsFor(template, part), available);
    if (count === 0) continue;

    const end = beats[beat + count] ?? start;
    if (end > target + 1e-6 && shots.length > 0) break;

    const length = end - start;
    const slack = Number.isFinite(available) ? available - length : 0;
    const clipIn = source.item.kind === "video" ? source.from + rng() * slack : 0;
    shots.push({
      media: source.item.id,
      in: round(clipIn),
      out: round(Math.min(clipIn + length, source.item.duration ?? clipIn + length)),
      start: round(start),
      end: round(end),
      motion: motionFor(source, profile, rng),
      crop: { x: 0, y: 0, w: 1, h: 1 },
    });
    beat += count;
    if (end >= target - interval / 2) break;
  }

  // The last shot can end slightly past the target on a beat with a single short source.
  const duration = shots.at(-1)?.end ?? 0;
  if (shots.length === 0) {
    throw new PlanError("Those clips are too short to use. Add a longer clip or a photo.");
  }

  const title = copy.title.trim() || monthOf(items);
  const titleEnd = round(Math.min(2.4, duration - 0.1));
  const fadeOut = Math.min(profile.fadeOut, duration / 3);

  return {
    schemaVersion: 1,
    template: template.id,
    vibe,
    aspect,
    fps,
    seed,
    duration,
    music: {
      src: music.src,
      bpm: music.beats.bpm,
      start: round(music.beats.times[startBeat] ?? 0),
      length: music.length,
    },
    grade: profile.grade,
    shots,
    texts: title ? [{ text: title, start: 0.12, end: titleEnd, style: "title" }] : [],
    transitions:
      fadeOut > 0
        ? [{ type: "fade", at: round(duration - fadeOut), duration: round(fadeOut) }]
        : [],
    sfx: [],
  };
}
