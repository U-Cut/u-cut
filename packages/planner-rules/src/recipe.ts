import type { Aspect, StyleRecipe, Vibe } from "@u-cut/schema";

/** What was measured from a reel. Text is geometry only: its words are never read or kept. */
export interface ReelMeasurements {
  width: number;
  height: number;
  duration: number;
  cuts: number[];
  beats: number[];
  bpm: number | null;
  look: { luma: number; contrast: number; saturation: number; warmth: number };
  text: {
    at: number;
    boxes: { x: number; y: number; w: number; h: number; upper: boolean }[];
  }[];
  endsDark?: boolean;
}

/** Cuts within this far of a beat count as being on it. */
const beatTolerance = 0.09;
/** Text shorter than this share of the frame is a watermark or a username. */
const smallestCaption = 0.018;
const framesWithTextToCount = 0.15;
const round = (value: number, places = 2) => Number(value.toFixed(places));
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

function percentile(values: number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}

function shapeOf(width: number, height: number): Aspect {
  const ratio = width / height;
  if (ratio < 0.8) return "9:16";
  return ratio > 1.3 ? "16:9" : "1:1";
}

function shotLengths(cuts: number[], from: number, to: number): number[] {
  const edges = [from, ...cuts.filter((cut) => cut > from && cut < to), to];
  return edges.slice(1).map((edge, index) => edge - (edges[index] ?? 0));
}

function isOnBeat(cuts: number[], beats: number[]): boolean {
  if (cuts.length === 0 || beats.length === 0) return false;
  const hits = cuts.filter((cut) =>
    beats.some((beat) => Math.abs(beat - cut) <= beatTolerance),
  ).length;
  return hits / cuts.length >= 0.6;
}

function sectionsOf(measured: ReelMeasurements): StyleRecipe["sections"] {
  const { duration, cuts } = measured;
  const hookEnd = round(Math.min(3, duration * 0.2));
  const payoffStart = round(Math.max(hookEnd, duration - Math.min(3, duration * 0.2)));
  const parts: [string, number, number][] = [
    ["hook", 0, hookEnd],
    ["body", hookEnd, payoffStart],
    ["payoff", payoffStart, duration],
  ];
  return parts.map(([name, start, end]) => {
    const length = Math.max(end - start, 0.01);
    const inside = cuts.filter((cut) => cut > start && cut < end).length;
    return {
      name,
      start,
      end: Math.max(end, 0.01),
      // Two cuts a second is about as frantic as reels get.
      energy: round(Math.min(1, inside / length / 2)),
      cut: round(percentile(shotLengths(cuts, start, end), 0.5)),
    };
  });
}

function positionOf(y: number): NonNullable<StyleRecipe["text"]>["position"] {
  if (y < 0.2) return "top";
  if (y < 0.4) return "upper";
  if (y < 0.6) return "center";
  return y < 0.8 ? "lower" : "bottom";
}

function textOf(measured: ReelMeasurements): StyleRecipe["text"] {
  const frames = measured.text.map((frame) => ({
    at: frame.at,
    boxes: frame.boxes.filter((box) => box.h >= smallestCaption),
  }));
  const withWords = frames.filter((frame) => frame.boxes.length > 0);
  if (withWords.length === 0 || withWords.length / frames.length < framesWithTextToCount)
    return null;

  const boxes = withWords.flatMap((frame) => frame.boxes);
  const height = percentile(
    boxes.map((box) => box.h),
    0.5,
  );
  const middle = percentile(
    boxes.map((box) => box.y + box.h / 2),
    0.5,
  );
  const capitals = boxes.filter((box) => box.upper).length / boxes.length;

  // The words themselves are never read, so a change shows up as the text's outline changing.
  const outline = (frame: (typeof withWords)[number]) =>
    frame.boxes.map((box) => `${round(box.w, 1)}:${round(box.y, 1)}`).join();
  let changes = 0;
  for (let index = 1; index < withWords.length; index += 1) {
    const current = withWords[index];
    const previous = withWords[index - 1];
    if (current && previous && outline(current) !== outline(previous)) changes += 1;
  }
  const span = Math.max((withWords.at(-1)?.at ?? 0) - (withWords[0]?.at ?? 0), 0.5);
  const rate = changes / span;

  return {
    font: "sans-bold",
    // Measured on a 1920-high frame, the size U-Cut's compositions use.
    sizePx: Math.round(height * 1920),
    position: positionOf(middle),
    case: capitals >= 0.6 ? "upper" : "sentence",
    timing: rate >= 1 ? "word" : rate >= 0.25 ? "line" : "block",
  };
}

/** Turns measurements into a recipe. Colour is halved, since much of it comes from the footage. */
export function recipeFrom(measured: ReelMeasurements): StyleRecipe {
  const lengths = shotLengths(measured.cuts, 0, measured.duration);
  const { contrast, saturation, warmth } = measured.look;
  return {
    aspect: shapeOf(measured.width, measured.height),
    duration: round(measured.duration),
    ...(measured.bpm ? { bpm: Math.round(measured.bpm) } : {}),
    cutRhythm: {
      median: round(percentile(lengths, 0.5)),
      p90: round(percentile(lengths, 0.9)),
      onBeat: isOnBeat(measured.cuts, measured.beats),
    },
    sections: sectionsOf(measured),
    text: textOf(measured),
    transitions: [
      { type: "cut", share: measured.endsDark ? 0.9 : 1 },
      ...(measured.endsDark ? [{ type: "fade" as const, share: 0.1 }] : []),
    ],
    grade: {
      temp: round(clamp(warmth / 200, 0.3)),
      contrast: round(clamp((contrast - 48) / 96, 0.3)),
      sat: round(clamp((saturation - 0.45) / 0.9, 0.3)),
    },
    notes: "",
  };
}

function paceOf(median: number): string {
  if (median < 1.2) return "Fast";
  return median < 2.4 ? "Steady" : "Relaxed";
}

function lookOf(grade: StyleRecipe["grade"]): string | undefined {
  const words: string[] = [];
  if (grade.temp >= 0.08) words.push("warm");
  if (grade.temp <= -0.08) words.push("cool");
  if (grade.contrast >= 0.08) words.push("punchy");
  if (grade.contrast <= -0.08) words.push("soft");
  if (grade.sat <= -0.08) words.push("muted");
  return words.length > 0 ? `A ${words.join(", ")} look.` : undefined;
}

function wordsOf(text: StyleRecipe["text"]): string | undefined {
  if (!text) return undefined;
  const size = text.sizePx >= 80 ? "Big" : "Small";
  const style = text.case === "upper" ? "capitals" : "captions";
  const place = {
    top: "at the top",
    upper: "high up",
    center: "in the centre",
    lower: "set low",
    bottom: "at the bottom",
  };
  return `${size} ${style} ${place[text.position]}.`;
}

/** The recipe in plain English, as shown on its card. */
export function describeRecipe(recipe: StyleRecipe): string {
  const { median, onBeat } = recipe.cutRhythm;
  const shot = median < 10 ? round(median, median < 2 ? 1 : 0) : Math.round(median);
  const pace = `${paceOf(median)}, about ${shot} s a shot${onBeat ? ", cutting on the beat" : ""}.`;
  return [pace, wordsOf(recipe.text), lookOf(recipe.grade)].filter(Boolean).join(" ");
}

export function matchVibe(recipe: StyleRecipe): Vibe {
  const { median } = recipe.cutRhythm;
  const { temp, contrast, sat } = recipe.grade;
  if (median < 1.2) return "hype";
  if (temp >= 0.12 && sat <= -0.1) return "nostalgic";
  if (contrast >= 0.1 && temp <= 0) return "cinematic";
  return "chill";
}

/** Finds the track nearest in tempo, counting double and half time as the same feel. */
export function matchTrack<T extends { bpm: number }>(recipe: StyleRecipe, tracks: T[]): T {
  const tempo = recipe.bpm ?? 60 / Math.max(recipe.cutRhythm.median / 2, 0.2);
  const distance = (track: T) =>
    Math.min(...[tempo, tempo / 2, tempo * 2].map((candidate) => Math.abs(candidate - track.bpm)));
  const [first, ...rest] = tracks;
  if (!first) throw new Error("There's no music to choose from.");
  return rest.reduce((best, track) => (distance(track) < distance(best) ? track : best), first);
}
