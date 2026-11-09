import type { EditPlan, MediaItem } from "@u-cut/schema";
import { describe, expect, it } from "vitest";
import { clockTime, shotLabels } from "./labels.ts";

type Shot = EditPlan["shots"][number];

/** A capture time on this computer's clock, so the tests pass in any time zone. */
const at = (hours: number, minutes: number) => new Date(2026, 9, 31, hours, minutes).toISOString();

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

function shot(media: string, start: number, end: number): Shot {
  const still = { x: 0.5, y: 0.5, scale: 1 };
  return {
    media,
    in: 0,
    out: end - start,
    start,
    end,
    motion: { type: "push-in", from: still, to: still },
    crop: { x: 0, y: 0, w: 1, h: 1 },
    focus: { x: 0.5, y: 0.5 },
  };
}

describe("clock times", () => {
  it("reads like a phone's clock", () => {
    expect(clockTime(at(7, 5))).toBe("7:05 am");
    expect(clockTime(at(0, 30))).toBe("12:30 am");
    expect(clockTime(at(12, 0))).toBe("12:00 pm");
    expect(clockTime(at(21, 42))).toBe("9:42 pm");
  });
});

describe("labels on shots", () => {
  it("stamps each shot with when it was taken, skipping flashes and photos without a time", () => {
    const items = [photo("a", at(7, 42)), photo("b", at(9, 3)), photo("c"), photo("d", at(13, 0))];
    const shots = [shot("a", 0, 1.5), shot("b", 1.5, 2), shot("c", 2, 4), shot("d", 4, 6)];
    expect(shotLabels("time", shots, items, 1)).toEqual([
      { text: "7:42 am", start: 0, end: 1.5, style: "stamp" },
      { text: "1:00 pm", start: 4, end: 6, style: "stamp" },
    ]);
  });

  it("numbers each stop after a long gap, keeping the first clear of the title", () => {
    const items = [
      photo("a", at(9, 0)),
      photo("b", at(9, 10)),
      photo("c", at(11, 0)),
      photo("d", at(11, 5)),
      photo("e", at(15, 30)),
    ];
    const shots = [
      shot("a", 0, 2),
      shot("b", 2, 4),
      shot("c", 4, 6),
      shot("d", 6, 7),
      shot("e", 7, 10),
    ];
    expect(shotLabels("stops", shots, items, 2.4)).toEqual([
      { text: "Stop 1", start: 2.4, end: 4, style: "stop" },
      { text: "Stop 2", start: 4, end: 5.8, style: "stop" },
      { text: "Stop 3", start: 7, end: 8.8, style: "stop" },
    ]);
  });

  it("writes nothing when every photo is from one stop, or when nothing is asked", () => {
    const items = [photo("a", at(9, 0)), photo("b", at(9, 20))];
    const shots = [shot("a", 0, 3), shot("b", 3, 6)];
    expect(shotLabels("stops", shots, items, 1)).toEqual([]);
    expect(shotLabels(undefined, shots, items, 1)).toEqual([]);
  });
});
