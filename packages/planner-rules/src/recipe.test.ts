import type { BeatGrid, StyleRecipe } from "@u-cut/schema";
import { describe, expect, it } from "vitest";
import {
  describeRecipe,
  matchTrack,
  matchVibe,
  type ReelMeasurements,
  recipeFrom,
} from "./recipe.ts";

const beat = 60 / 128;
const reel: ReelMeasurements = {
  width: 1080,
  height: 1920,
  duration: 15,
  cuts: Array.from({ length: 15 }, (_, index) => (index + 1) * 2 * beat),
  beats: Array.from({ length: 32 }, (_, index) => index * beat),
  bpm: 128,
  look: { luma: 110, contrast: 60, saturation: 0.6, warmth: 30 },
  text: [],
};

const withText = (boxes: ReelMeasurements["text"][number]["boxes"], frames = 8) => ({
  ...reel,
  text: Array.from({ length: frames }, (_, index) => ({ at: index * 0.5, boxes })),
});

describe("recipeFrom", () => {
  it("reads the shape", () => {
    expect(recipeFrom(reel).aspect).toBe("9:16");
    expect(recipeFrom({ ...reel, width: 1080, height: 1080 }).aspect).toBe("1:1");
    expect(recipeFrom({ ...reel, width: 1280, height: 720 }).aspect).toBe("16:9");
  });

  it("measures the cut rhythm", () => {
    const { cutRhythm } = recipeFrom(reel);
    expect(cutRhythm.median).toBeCloseTo(0.94, 1);
    expect(cutRhythm.p90).toBeCloseTo(0.94, 1);
  });

  it("notices cuts that land on the beat", () => {
    expect(recipeFrom(reel).cutRhythm.onBeat).toBe(true);
  });

  it("notices cuts that ignore the beat", () => {
    const offBeat = reel.cuts.map((cut) => cut + 0.2);
    expect(recipeFrom({ ...reel, cuts: offBeat }).cutRhythm.onBeat).toBe(false);
  });

  it("isn't thrown by a reel with no music", () => {
    const silent = recipeFrom({ ...reel, beats: [], bpm: null });
    expect(silent.cutRhythm.onBeat).toBe(false);
    expect(silent.bpm).toBeUndefined();
  });

  it("copes with a single unbroken shot", () => {
    const recipe = recipeFrom({ ...reel, cuts: [] });
    expect(recipe.cutRhythm.median).toBe(15);
    expect(recipe.sections).toHaveLength(3);
  });

  it("splits the reel into a hook, a body and a payoff", () => {
    const { sections } = recipeFrom(reel);
    expect(sections.map((section) => section.name)).toEqual(["hook", "body", "payoff"]);
    expect(sections[0]?.start).toBe(0);
    expect(sections.at(-1)?.end).toBe(15);
  });

  it("sees a fast opening in the section's own rhythm", () => {
    const fastStart = [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 4, 6, 8, 10, 12, 14];
    const { sections } = recipeFrom({ ...reel, cuts: fastStart, beats: [], bpm: null });
    expect(sections[0]?.cut).toBeLessThan(0.5);
    expect(sections[1]?.cut).toBeGreaterThan(1.5);
    expect(sections[0]?.energy).toBeGreaterThan(sections[1]?.energy ?? 1);
  });

  it("reads a warm, punchy look as a gentle grade", () => {
    const { grade } = recipeFrom(reel);
    expect(grade.temp).toBeGreaterThan(0);
    expect(grade.contrast).toBeGreaterThan(0);
    expect(grade.sat).toBeGreaterThan(0);
    for (const value of Object.values(grade)) expect(Math.abs(value)).toBeLessThanOrEqual(0.3);
  });

  it("finds no text style in a reel without words", () => {
    expect(recipeFrom(reel).text).toBeNull();
  });

  it("reads bold captions set low in capitals", () => {
    const { text } = recipeFrom(withText([{ x: 0.2, y: 0.68, w: 0.6, h: 0.05, upper: true }]));
    expect(text).toMatchObject({ position: "lower", case: "upper" });
    expect(text?.sizePx).toBeCloseTo(96, -1);
  });

  it("ignores a small watermark in the corner", () => {
    expect(
      recipeFrom(withText([{ x: 0.7, y: 0.95, w: 0.2, h: 0.012, upper: false }])).text,
    ).toBeNull();
  });

  it("tells words that change quickly from a steady title", () => {
    const changing = {
      ...reel,
      text: Array.from({ length: 20 }, (_, index) => ({
        at: index * 0.5,
        boxes: [{ x: 0.2, y: 0.5, w: 0.3 + (index % 3) * 0.2, h: 0.05, upper: false }],
      })),
    };
    expect(recipeFrom(changing).text?.timing).toBe("word");
    const steady = recipeFrom(withText([{ x: 0.2, y: 0.5, w: 0.6, h: 0.05, upper: false }]));
    expect(steady.text?.timing).toBe("block");
  });

  it("notices a reel that fades out at the end", () => {
    const fading = recipeFrom({ ...reel, endsDark: true });
    expect(fading.transitions.map((transition) => transition.type)).toContain("fade");
    expect(recipeFrom(reel).transitions.map((transition) => transition.type)).toEqual(["cut"]);
  });

  it("never carries any words from the reel", () => {
    const recipe = recipeFrom(withText([{ x: 0.2, y: 0.68, w: 0.6, h: 0.05, upper: true }]));
    expect(JSON.stringify(recipe)).not.toMatch(/"(string|words|content)"/);
  });
});

describe("describeRecipe", () => {
  it("says what it found in plain English", () => {
    const recipe = recipeFrom(withText([{ x: 0.2, y: 0.68, w: 0.6, h: 0.05, upper: true }]));
    expect(describeRecipe(recipe)).toBe(
      "Fast, about 0.9 s a shot, cutting on the beat. Big capitals set low. A warm, punchy look.",
    );
  });

  it("leaves out what it didn't find", () => {
    const plain = recipeFrom({
      ...reel,
      cuts: [3, 6, 9, 12],
      beats: [],
      bpm: null,
      look: { luma: 120, contrast: 48, saturation: 0.45, warmth: 0 },
    });
    expect(describeRecipe(plain)).toBe("Relaxed, about 3 s a shot.");
  });
});

describe("matching", () => {
  const recipe = (median: number, overrides: Partial<StyleRecipe> = {}): StyleRecipe => ({
    ...recipeFrom(reel),
    cutRhythm: { median, p90: median, onBeat: true },
    ...overrides,
  });

  const grid = (bpm: number): BeatGrid => ({ bpm, source: "detected", times: [] });
  const tracks = [
    { vibe: "chill", bpm: 84, beats: grid(84) },
    { vibe: "hype", bpm: 128, beats: grid(128) },
    { vibe: "cinematic", bpm: 72, beats: grid(72) },
    { vibe: "nostalgic", bpm: 96, beats: grid(96) },
  ];

  it("picks the track closest in tempo", () => {
    expect(matchTrack({ ...recipe(1), bpm: 126 }, tracks).vibe).toBe("hype");
    expect(matchTrack({ ...recipe(1), bpm: 98 }, tracks).vibe).toBe("nostalgic");
  });

  it("treats double time as the same tempo", () => {
    expect(matchTrack({ ...recipe(1), bpm: 168 }, tracks).vibe).toBe("chill");
  });

  it("goes by the cutting speed when the reel has no tempo", () => {
    const { bpm: _bpm, ...noTempo } = recipe(0.5);
    expect(matchTrack(noTempo, tracks).vibe).toBe("hype");
  });

  it("picks a vibe that suits the reel", () => {
    expect(matchVibe(recipe(0.5))).toBe("hype");
    expect(matchVibe(recipe(3, { grade: { temp: -0.05, contrast: 0.15, sat: -0.1 } }))).toBe(
      "cinematic",
    );
    expect(matchVibe(recipe(2.5, { grade: { temp: 0.2, contrast: -0.1, sat: -0.2 } }))).toBe(
      "nostalgic",
    );
    expect(matchVibe(recipe(2, { grade: { temp: 0.05, contrast: 0, sat: 0 } }))).toBe("chill");
  });
});
