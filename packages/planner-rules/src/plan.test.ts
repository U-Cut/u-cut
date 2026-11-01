import type {
  BeatGrid,
  MediaItem,
  PlannerInput,
  StyleRecipe,
  TemplateManifest,
} from "@u-cut/schema";
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
    quality: { sharpness: null, exposure: null, faces: null, dupGroup: null, score: null },
    focus: null,
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
    excludedScenes: [],
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

  describe("with sorted media", () => {
    const labelled = (id: string, scene: string, score: number | null = null): MediaItem => ({
      ...photo(id),
      labels: [{ id: scene, score: 0.9 }],
      quality: { sharpness: null, exposure: null, faces: null, dupGroup: null, score },
    });

    it("leaves out hidden scenes", () => {
      const items = [labelled("a", "beach"), labelled("b", "documents"), labelled("c", "food")];
      const plan = planRules(input(items, { excludedScenes: ["documents", "food"] }));
      expect(plan.shots.map((shot) => shot.media)).toEqual(["a"]);
    });

    it("explains when every photo is hidden", () => {
      const items = [labelled("a", "documents")];
      expect(() => planRules(input(items, { excludedScenes: ["documents"] }))).toThrow(
        "Every photo is hidden",
      );
    });

    it("uses only the best of a run of near-identical photos", () => {
      const twin = (id: string, score: number): MediaItem => ({
        ...photo(id),
        quality: { sharpness: null, exposure: null, faces: null, dupGroup: "burst", score },
      });
      const plan = planRules(input([twin("a", 0.1), twin("b", 0.8), twin("c", 0.3)]));
      expect(plan.shots.map((shot) => shot.media)).toEqual(["b"]);
    });

    it("opens on the best shot", () => {
      const items = [...many(20), labelled("star", "beach", 0.99)];
      const scored = items.map((item, index) =>
        item.id === "star"
          ? item
          : { ...item, quality: { ...item.quality, score: (index % 5) / 10 } },
      );
      expect(planRules(input(scored, { duration: 45 })).shots[0]?.media).toBe("star");
    });

    it("favours better photos without always picking the same ones", () => {
      const items = many(60).map((item, index) => ({
        ...item,
        quality: { ...item.quality, score: index % 2 === 0 ? 0.9 : -0.9 },
      }));
      const good = new Set(
        items.filter((item) => item.quality.score === 0.9).map((item) => item.id),
      );
      const plan = planRules(input(items, { duration: 15 }));
      const share = plan.shots.filter((shot) => good.has(shot.media)).length / plan.shots.length;
      expect(share).toBeGreaterThan(0.8);
      const other = planRules(input(items, { duration: 15, seed: 8 }));
      expect(other.shots.map((shot) => shot.media)).not.toEqual(
        plan.shots.map((shot) => shot.media),
      );
    });

    it("keeps the subject in frame when cropping", () => {
      const item = { ...photo("a"), focus: { x: 0.2, y: 0.7 } };
      expect(planRules(input([item])).shots[0]?.focus).toEqual({ x: 0.2, y: 0.7 });
    });

    it("pushes in towards the subject, not off to one side", () => {
      const items = many(30).map((item) => ({ ...item, focus: { x: 0.9, y: 0.5 } }));
      const pushes = planRules(input(items)).shots.filter((shot) => shot.motion.type === "push-in");
      expect(pushes.length).toBeGreaterThan(0);
      for (const shot of pushes) expect(shot.motion.to.x).toBeGreaterThan(0.5);
    });
  });

  describe("with a recipe from a reel", () => {
    const recipe: StyleRecipe = {
      aspect: "9:16",
      duration: 12,
      cutRhythm: { median: 1, p90: 1, onBeat: true },
      sections: [
        { name: "hook", start: 0, end: 3, energy: 1, cut: 0.5 },
        { name: "body", start: 3, end: 9, energy: 0.5, cut: 1 },
        { name: "payoff", start: 9, end: 12, energy: 0.5, cut: 2 },
      ],
      text: { font: "sans-bold", sizePx: 96, position: "lower", case: "upper", timing: "line" },
      transitions: [{ type: "cut", share: 1 }],
      grade: { temp: 0.2, contrast: 0.1, sat: 0 },
      notes: "",
    };
    const open = {
      ...template,
      sections: [
        { name: "hook", slots: [{ accepts: ["any"], count: 3, minDur: 0.2, maxDur: 6 }] },
        { name: "body", slots: [{ accepts: ["any"], count: 40, minDur: 0.2, maxDur: 6 }] },
        { name: "close", slots: [{ accepts: ["any"], count: 1, minDur: 0.2, maxDur: 6 }] },
      ],
    };
    const planned = (overrides: Partial<PlannerInput> = {}) =>
      planRules(input(many(40), { recipe, template: open, duration: 12, ...overrides }));

    it("cuts to the reel's rhythm, on the new music's beat", () => {
      const lengths = planned().shots.map((shot) => shot.end - shot.start);
      expect(lengths.filter((length) => Math.abs(length - 1) < 0.01).length).toBeGreaterThan(4);
    });

    it("copies a faster opening", () => {
      const lengths = planned().shots.map((shot) => shot.end - shot.start);
      expect(lengths[0]).toBeCloseTo(0.5, 1);
      expect(lengths[1]).toBeCloseTo(0.5, 1);
      expect(lengths.at(-1)).toBeCloseTo(2, 1);
    });

    it("uses the reel's look", () => {
      expect(planned().grade).toEqual(recipe.grade);
    });

    it("sets words the way the reel did", () => {
      expect(planned().textStyle).toEqual({ position: "lower", case: "upper", sizePx: 96 });
    });

    it("needs no text style when the reel had no words", () => {
      expect(planned({ recipe: { ...recipe, text: null } }).textStyle).toBeUndefined();
    });

    it("fades out only if the reel did", () => {
      expect(planned().transitions).toEqual([]);
      const fading: StyleRecipe = {
        ...recipe,
        transitions: [
          { type: "cut", share: 0.9 },
          { type: "fade", share: 0.1 },
        ],
      };
      expect(planned({ recipe: fading }).transitions[0]?.type).toBe("fade");
    });

    it("stays byte-identical", () => {
      expect(JSON.stringify(planned())).toBe(JSON.stringify(planned()));
    });
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
