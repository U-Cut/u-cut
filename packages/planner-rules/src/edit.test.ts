import type { EditPlan, MediaItem } from "@u-cut/schema";
import { describe, expect, it } from "vitest";
import { replaceShot, setTitle, swapShots } from "./edit.ts";

function item(id: string, kind: "photo" | "video", duration?: number): MediaItem {
  return {
    id,
    path: id,
    kind,
    w: 1080,
    h: 1920,
    orientation: 1,
    quality: { sharpness: null, exposure: null, faces: null, dupGroup: null },
    labels: [],
    moment: null,
    ...(duration ? { duration } : {}),
  };
}

const still = { x: 0.5, y: 0.5, scale: 1 };
const shot = (media: string, start: number, end: number) => ({
  media,
  in: 0,
  out: end - start,
  start,
  end,
  motion: { type: "none" as const, from: still, to: still },
  crop: { x: 0, y: 0, w: 1, h: 1 },
});

const plan: EditPlan = {
  schemaVersion: 1,
  template: "travel-montage",
  vibe: "chill",
  aspect: "9:16",
  fps: 30,
  seed: 1,
  duration: 6,
  music: { src: "chill.m4a", bpm: 84, start: 0, length: 60 },
  grade: { temp: 0, contrast: 0, sat: 0 },
  shots: [shot("a", 0, 2), shot("b", 2, 6)],
  texts: [{ text: "Old", start: 0.1, end: 2, style: "title" }],
  transitions: [],
  sfx: [],
};

describe("setTitle", () => {
  it("changes the words and keeps the cut", () => {
    const edited = setTitle(plan, "New");
    expect(edited.texts[0]?.text).toBe("New");
    expect(edited.shots).toBe(plan.shots);
  });

  it("removes the title when it's emptied", () => {
    expect(setTitle(plan, "  ").texts).toEqual([]);
  });

  it("adds a title to a reel without one", () => {
    const edited = setTitle({ ...plan, texts: [] }, "Hello");
    expect(edited.texts[0]).toMatchObject({ text: "Hello", style: "title", start: 0.12 });
  });
});

describe("replaceShot", () => {
  it("swaps in a photo and keeps the timing", () => {
    const edited = replaceShot(plan, 1, item("c", "photo"));
    expect(edited.shots[1]).toMatchObject({ media: "c", start: 2, end: 6, in: 0, out: 4 });
  });

  it("takes a clip from its middle", () => {
    const edited = replaceShot(plan, 0, item("c", "video", 10));
    expect(edited.shots[0]).toMatchObject({ media: "c", in: 4, out: 6 });
  });

  it("explains when a clip is too short for the shot", () => {
    expect(() => replaceShot(plan, 1, item("c", "video", 1))).toThrow(
      "That clip is shorter than this shot. Pick a photo or a longer clip.",
    );
  });
});

describe("swapShots", () => {
  it("exchanges media and keeps the beat-locked timing", () => {
    const items = { a: item("a", "photo"), b: item("b", "photo") };
    const edited = swapShots(plan, 0, 1, items);
    expect(edited.shots.map((candidate) => candidate.media)).toEqual(["b", "a"]);
    expect(edited.shots.map((candidate) => candidate.start)).toEqual([0, 2]);
  });

  it("does nothing when dropped on itself", () => {
    expect(swapShots(plan, 1, 1, {})).toBe(plan);
  });
});
