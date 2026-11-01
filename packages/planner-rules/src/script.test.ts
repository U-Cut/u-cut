import { EditPlan, type MediaItem, type ScriptLine, validate } from "@u-cut/schema";
import { describe, expect, it } from "vitest";
import { lineLength, planScript } from "./script.ts";

function photo(id: string, scene: string | null = null): MediaItem {
  return {
    id,
    path: id,
    kind: "photo",
    w: 1080,
    h: 1920,
    orientation: 1,
    quality: { sharpness: null, exposure: null, faces: null, dupGroup: null, score: null },
    focus: null,
    labels: scene ? [{ id: scene, score: 0.9 }] : [],
    moment: null,
  };
}

const line = (text: string, more: Partial<ScriptLine> = {}): ScriptLine => ({
  text,
  scene: null,
  speed: 1,
  voice: null,
  ...more,
});

const voiced = (text: string, length: number, src = "a".repeat(32)) =>
  line(text, { voice: { src, length } });

const base = {
  items: [],
  excludedScenes: [],
  vibe: "chill" as const,
  aspect: "9:16" as const,
  seed: 1,
  music: { src: "chill.m4a", length: 60, bpm: 84 },
};

describe("lineLength", () => {
  it("uses the voice's real length once there is one", () => {
    expect(lineLength(voiced("Slow days in Goa.", 1.344))).toBe(1.344);
  });

  it("estimates until then, and reads faster at a higher speed", () => {
    const words = "One two three four five six seven eight";
    expect(lineLength(line(words, { speed: 1.2 }))).toBeLessThan(lineLength(line(words)));
  });
});

describe("planScript", () => {
  const lines = [voiced("First line here.", 2), voiced("Second line here.", 3)];

  it("makes a valid reel from words alone", () => {
    const plan = planScript({ ...base, lines });
    expect(validate(EditPlan, plan, "plan")).toMatchObject({ ok: true });
    expect(plan.shots).toHaveLength(0);
    expect(plan.backdrops).toHaveLength(2);
  });

  it("times the words and voice to each other, with a pause between lines", () => {
    const plan = planScript({ ...base, lines });
    expect(plan.voice?.map((entry) => entry.at)).toEqual([0.3, 2.5]);
    expect(plan.texts.map((text) => text.start)).toEqual([0.3, 2.5]);
    expect(plan.texts.every((text) => text.style === "kinetic")).toBe(true);
    expect(plan.duration).toBeCloseTo(0.3 + 2 + 0.2 + 3 + 0.9);
  });

  it("spreads spare time into the pauses to reach the length asked for", () => {
    const plan = planScript({ ...base, lines, target: 7 });
    expect(plan.duration).toBeCloseTo(7);
    expect(plan.texts[1]?.start).toBeCloseTo(0.3 + 2 + 0.8);
  });

  it("keeps pauses natural when a reel can't stretch that far", () => {
    const plan = planScript({ ...base, lines, target: 60 });
    expect(plan.texts[1]?.start).toBeCloseTo(0.3 + 2 + 1.5);
  });

  it("leaves no gap in the colour", () => {
    const plan = planScript({ ...base, lines });
    expect(plan.backdrops?.[0]?.start).toBe(0);
    expect(plan.backdrops?.[0]?.end).toBe(plan.backdrops?.[1]?.start);
    expect(plan.backdrops?.at(-1)?.end).toBe(plan.duration);
  });

  it("keeps music well under a voice, and up when there isn't one", () => {
    expect(planScript({ ...base, lines }).music.volume).toBeLessThan(0.3);
    const silent = planScript({ ...base, lines: [line("Words only here.")] });
    expect(silent.music.volume).toBeGreaterThan(0.5);
    expect(silent.voice).toBeUndefined();
  });

  it("shows someone's pictures when there are some", () => {
    const plan = planScript({ ...base, lines, items: [photo("a"), photo("b")] });
    expect(validate(EditPlan, plan, "plan")).toMatchObject({ ok: true });
    expect(plan.backdrops).toBeUndefined();
    expect(plan.shots[0]?.start).toBe(0);
    expect(plan.shots.at(-1)?.end).toBe(plan.duration);
  });

  it("leaves no gap between pictures", () => {
    const plan = planScript({ ...base, lines, items: [photo("a"), photo("b"), photo("c")] });
    plan.shots.forEach((shot, index) => {
      const next = plan.shots[index + 1];
      if (next) expect(next.start).toBe(shot.end);
    });
  });

  it("puts the matching picture under a line about that scene", () => {
    const items = [photo("a", "food"), photo("b", "home"), photo("c", "beach")];
    const about = [line("Nothing but the beach.", { scene: "beach" })];
    expect(planScript({ ...base, lines: about, items }).shots[0]?.media).toBe("c");
  });

  it("repeats pictures only after using them all", () => {
    const items = [photo("a"), photo("b")];
    const many = Array.from({ length: 4 }, () => line("Three short words."));
    const used = planScript({ ...base, lines: many, items }).shots.map((shot) => shot.media);
    expect(new Set(used.slice(0, 2)).size).toBe(2);
  });

  it("leaves out scenes someone excluded", () => {
    const items = [photo("a", "documents"), photo("b", "beach")];
    const plan = planScript({ ...base, lines, items, excludedScenes: ["documents"] });
    expect(plan.shots.every((shot) => shot.media === "b")).toBe(true);
  });

  it("is byte-identical for the same input", () => {
    const items = [photo("a"), photo("b")];
    expect(JSON.stringify(planScript({ ...base, lines, items }))).toBe(
      JSON.stringify(planScript({ ...base, lines, items })),
    );
  });

  it("explains an empty script", () => {
    expect(() => planScript({ ...base, lines: [] })).toThrow("Write at least one line");
  });
});
