import type { EditPlan } from "@u-cut/schema";
import { describe, expect, it } from "vitest";
import { soundsFor } from "./sfx.ts";

type Shot = EditPlan["shots"][number];

const still = { x: 0.5, y: 0.5, scale: 1 };
const shot = (media: string, start: number, end: number): Shot => ({
  media,
  in: 0,
  out: end - start,
  start,
  end,
  motion: { type: "push-in", from: still, to: still },
  crop: { x: 0, y: 0, w: 1, h: 1 },
  focus: { x: 0.5, y: 0.5 },
});

const round = (value: number) => Math.round(value * 1000) / 1000;

// Two hook shots, eight in the body, then the closer from 12 to 16 seconds.
const shots = [
  shot("h1", 0, 0.8),
  shot("h2", 0.8, 1.6),
  ...Array.from({ length: 8 }, (_, index) =>
    shot(`b${index}`, round(1.6 + index * 1.3), index === 7 ? 12 : round(2.9 + index * 1.3)),
  ),
  shot("close", 12, 16),
];
const photos = new Set(shots.map((entry) => entry.media));
const at = (sounds: EditPlan["sfx"], src: string) =>
  sounds.filter((sound) => sound.src === src).map((sound) => sound.at);

describe("sound effects", () => {
  it("lands a hype reel's hits on the first beat and the closer, with a riser into it", () => {
    const sounds = soundsFor("hype", shots, [], 2, photos);
    expect(at(sounds, "hit.m4a")).toEqual([0, 12]);
    expect(at(sounds, "riser.m4a")).toEqual([9.6]);
    expect(at(sounds, "whoosh.m4a")[0]).toBe(1.25);
    // Never more than a handful, so the music still leads.
    expect(sounds.length).toBeLessThanOrEqual(8);
  });

  it("keeps a chill reel soft, and gives a nostalgic one a shutter per opening photo", () => {
    expect(soundsFor("chill", shots, [], 2, photos).map((sound) => sound.src)).toEqual([
      "swell.m4a",
      "whoosh.m4a",
    ]);
    expect(at(soundsFor("nostalgic", shots, [], 2, photos), "shutter.m4a")).toEqual([0, 0.8, 12]);
    expect(at(soundsFor("nostalgic", shots, [], 2, new Set()), "shutter.m4a")).toEqual([12]);
  });

  it("pops each stop label, and never runs past the end of the reel", () => {
    const texts = [{ text: "Stop 2", start: 5.5, end: 7, style: "stop" }];
    const sounds = soundsFor("cinematic", shots, texts, 2, photos);
    expect(at(sounds, "pop.m4a")).toEqual([5.5]);
    for (const sound of sounds) expect(sound.at + sound.length).toBeLessThanOrEqual(16);
    const short = soundsFor("cinematic", [shot("a", 0, 0.9)], [], 1, photos);
    expect(short).toEqual([{ src: "hit.m4a", at: 0, length: 0.9, vol: 0.75 }]);
  });
});
