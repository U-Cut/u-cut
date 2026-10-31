import type { BeatGrid, MediaItem, PlannerInput, TemplateManifest } from "@u-cut/schema";
import { EditPlan, validate } from "@u-cut/schema";
import { describe, expect, it } from "vitest";
import { PlanError, planRules } from "./plan.ts";

function photo(id: string, takenAt?: string): MediaItem {
  return {
    id,
    path: `${id}.jpg`,
    kind: "photo",
    w: 3024,
    h: 4032,
    orientation: 1,
    quality: { sharpness: null, exposure: null, faces: null, dupGroup: null },
    labels: [],
    moment: null,
    ...(takenAt ? { takenAt } : {}),
  };
}

function clip(id: string, duration: number): MediaItem {
  return { ...photo(id), kind: "video", path: `${id}.mov`, duration };
}

const template: TemplateManifest = {
  id: "travel-montage",
  name: "Travel montage",
  version: "1.0.0",
  author: "U-Cut contributors",
  licence: "Apache-2.0",
  aspects: ["9:16", "1:1", "16:9"],
  durationRange: { min: 6, max: 60 },
  sections: [
    { name: "hook", slots: [{ accepts: ["any"], count: 2, minDur: 0.4, maxDur: 2 }] },
    { name: "body", slots: [{ accepts: ["any"], count: 20, minDur: 0.4, maxDur: 4 }] },
    { name: "close", slots: [{ accepts: ["any"], count: 1, minDur: 1, maxDur: 5 }] },
  ],
  variables: [],
  vibes: ["chill", "hype", "cinematic", "nostalgic"],
  preview: "preview.gif",
  requires: [],
};

const beats = (bpm: number, seconds = 60): BeatGrid => ({
  bpm,
  source: "detected",
  times: Array.from({ length: Math.floor((seconds * bpm) / 60) }, (_, i) => (i * 60) / bpm),
});

function input(items: MediaItem[], overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    items,
    template,
    vibe: "hype",
    aspect: "9:16",
    duration: 15,
    music: { src: "hype.m4a", length: 60, beats: beats(120) },
    copy: { title: "" },
    recipe: null,
    seed: 7,
    ...overrides,
  };
}

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => photo(`p${String(i).padStart(3, "0")}`));

describe("planRules", () => {
  it("produces a plan the schema accepts", () => {
    expect(validate(EditPlan, planRules(input(many(30))), "plan")).toMatchObject({ ok: true });
  });

  it("is byte-identical for the same input", () => {
    const first = JSON.stringify(planRules(input(many(30))));
    expect(JSON.stringify(planRules(input(many(30))))).toBe(first);
  });

  it("doesn't depend on the order files arrived in", () => {
    const items = many(30);
    const shuffled = [...items].reverse();
    expect(JSON.stringify(planRules(input(shuffled)))).toBe(
      JSON.stringify(planRules(input(items))),
    );
  });

  it("gives a different cut for a different seed", () => {
    const first = planRules(input(many(30), { seed: 1 }));
    const second = planRules(input(many(30), { seed: 2 }));
    expect(second.shots.map((shot) => shot.media)).not.toEqual(first.shots.map((s) => s.media));
  });

  it("lands every cut on a beat", () => {
    const plan = planRules(input(many(30)));
    for (const shot of plan.shots) {
      const beat = (shot.start + plan.music.start) / 0.5;
      expect(Math.abs(beat - Math.round(beat))).toBeLessThan(0.01);
    }
  });

  it("keeps shots contiguous from zero to the end of the reel", () => {
    const plan = planRules(input(many(30)));
    expect(plan.shots[0]?.start).toBe(0);
    plan.shots.forEach((shot, index) => {
      const next = plan.shots[index + 1];
      if (next) expect(next.start).toBe(shot.end);
    });
    expect(plan.shots.at(-1)?.end).toBe(plan.duration);
  });

  it("stays close to the requested length", () => {
    const plan = planRules(input(many(60), { duration: 30 }));
    expect(plan.duration).toBeGreaterThan(27);
    expect(plan.duration).toBeLessThanOrEqual(30);
  });

  it("cuts faster for hype than for cinematic", () => {
    const hype = planRules(input(many(60), { vibe: "hype" }));
    const cinematic = planRules(
      input(many(60), { vibe: "cinematic", music: { src: "c.m4a", length: 60, beats: beats(72) } }),
    );
    expect(hype.shots.length).toBeGreaterThan(cinematic.shots.length * 1.5);
  });

  it("never uses a photo twice", () => {
    const plan = planRules(input(many(60), { duration: 45 }));
    expect(new Set(plan.shots.map((shot) => shot.media)).size).toBe(plan.shots.length);
  });

  it("makes a short reel from one photo", () => {
    const plan = planRules(input([photo("only")]));
    expect(plan.shots).toHaveLength(1);
    expect(plan.duration).toBeGreaterThanOrEqual(2);
    expect(plan.duration).toBeLessThanOrEqual(5);
  });

  it("shortens the reel rather than repeating when media runs out", () => {
    const plan = planRules(input(many(3), { duration: 30 }));
    expect(plan.shots).toHaveLength(3);
    expect(plan.duration).toBeLessThan(15);
  });

  it("explains an empty pile in a plain sentence", () => {
    expect(() => planRules(input([]))).toThrow(PlanError);
    expect(() => planRules(input([]))).toThrow("Add at least one photo or clip");
  });

  it("cuts one long video into windows from across its length", () => {
    const plan = planRules(input([clip("long", 2400)], { duration: 15 }));
    expect(plan.shots.length).toBeGreaterThan(3);
    const starts = plan.shots.map((shot) => shot.in);
    expect(Math.max(...starts) - Math.min(...starts)).toBeGreaterThan(600);
    for (const shot of plan.shots) expect(shot.out).toBeLessThanOrEqual(2400);
  });

  it("never reads past the end of a short clip", () => {
    const plan = planRules(input([clip("short", 1.1), ...many(10)], { vibe: "cinematic" }));
    for (const shot of plan.shots.filter((candidate) => candidate.media === "short")) {
      expect(shot.out).toBeLessThanOrEqual(1.1);
      expect(shot.out - shot.in).toBeCloseTo(shot.end - shot.start, 2);
    }
  });

  it("skips a clip too short to fill a beat", () => {
    const plan = planRules(input([clip("blip", 0.1), ...many(10)]));
    expect(plan.shots.map((shot) => shot.media)).not.toContain("blip");
  });

  it("falls back cleanly when the track has no steady beat", () => {
    const even: BeatGrid = { bpm: null, source: "even", times: [] };
    const plan = planRules(input(many(30), { music: { src: "m.m4a", length: 60, beats: even } }));
    expect(plan.music.bpm).toBeNull();
    expect(plan.duration).toBeGreaterThan(13);
    expect(validate(EditPlan, plan, "plan")).toMatchObject({ ok: true });
  });

  it("keeps cutting past the end of a short track", () => {
    const plan = planRules(
      input(many(60), { music: { src: "m.m4a", length: 5, beats: beats(120, 5) }, seed: 3 }),
    );
    expect(plan.duration).toBeGreaterThan(13);
    expect(plan.music.start).toBeLessThan(5);
  });

  it("puts the title on screen from the first moments", () => {
    const plan = planRules(input(many(30), { copy: { title: "Goa, day one" } }));
    expect(plan.texts[0]).toMatchObject({ text: "Goa, day one", style: "title" });
    expect(plan.texts[0]?.start).toBeLessThan(0.3);
  });

  it("falls back to the month the photos were taken", () => {
    const items = [
      photo("a", "2026-03-14T09:21:07+05:30"),
      photo("b", "2026-03-15T09:21:07+05:30"),
    ];
    expect(planRules(input(items)).texts[0]?.text).toBe("March 2026");
  });

  it("shows no text when there is nothing true to say", () => {
    expect(planRules(input(many(4))).texts).toEqual([]);
  });

  it("keeps a photo framed so the edges never show", () => {
    const plan = planRules(input(many(30), { seed: 11 }));
    for (const shot of plan.shots) {
      for (const framing of [shot.motion.from, shot.motion.to]) {
        expect(framing.scale).toBeGreaterThanOrEqual(1);
        const margin = (framing.scale - 1) / (2 * framing.scale);
        expect(Math.abs(framing.x - 0.5)).toBeLessThanOrEqual(margin + 1e-9);
        expect(Math.abs(framing.y - 0.5)).toBeLessThanOrEqual(margin + 1e-9);
      }
    }
  });
});
