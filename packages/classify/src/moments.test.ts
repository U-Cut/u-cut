import type { MediaItem } from "@u-cut/schema";
import { describe, expect, it } from "vitest";
import { groupMoments } from "./moments.ts";

function item(id: string, takenAt?: string, gps?: { lat: number; lon: number }): MediaItem {
  return {
    id,
    path: id,
    kind: "photo",
    w: 100,
    h: 100,
    orientation: 1,
    quality: { sharpness: null, exposure: null, faces: null, dupGroup: null, score: null },
    focus: null,
    labels: [],
    moment: null,
    ...(takenAt ? { takenAt } : {}),
    ...(gps ? { gps } : {}),
  };
}

const ids = (items: MediaItem[]) => {
  const groups = new Map<string | null, string[]>();
  for (const candidate of items) {
    groups.set(candidate.moment, [...(groups.get(candidate.moment) ?? []), candidate.id]);
  }
  return [...groups.values()];
};

describe("groupMoments", () => {
  it("keeps photos taken close together", () => {
    const items = [item("a", "2026-03-14T09:00:00Z"), item("b", "2026-03-14T09:30:00Z")];
    expect(ids(groupMoments(items))).toEqual([["a", "b"]]);
  });

  it("starts a new moment after 45 minutes", () => {
    const items = [item("a", "2026-03-14T09:00:00Z"), item("b", "2026-03-14T09:46:00Z")];
    expect(ids(groupMoments(items))).toEqual([["a"], ["b"]]);
  });

  it("starts a new moment after a jump of over 2 km", () => {
    const items = [
      item("a", "2026-03-14T09:00:00Z", { lat: 15.5, lon: 73.75 }),
      item("b", "2026-03-14T09:05:00Z", { lat: 15.6, lon: 73.75 }),
    ];
    expect(ids(groupMoments(items))).toEqual([["a"], ["b"]]);
  });

  it("stays together for a short walk", () => {
    const items = [
      item("a", "2026-03-14T09:00:00Z", { lat: 15.5, lon: 73.75 }),
      item("b", "2026-03-14T09:05:00Z", { lat: 15.505, lon: 73.75 }),
    ];
    expect(ids(groupMoments(items))).toEqual([["a", "b"]]);
  });

  it("puts undated photos together at the end", () => {
    const items = [item("undated"), item("a", "2026-03-14T09:00:00Z")];
    const grouped = groupMoments(items);
    expect(ids(grouped)).toEqual([["a"], ["undated"]]);
  });

  it("orders by time however the files arrived", () => {
    const later = item("later", "2026-03-15T09:00:00Z");
    const earlier = item("earlier", "2026-03-14T09:00:00Z");
    expect(groupMoments([later, earlier]).map((entry) => entry.id)).toEqual(["earlier", "later"]);
  });

  it("gives the same moment names every time", () => {
    const items = [item("a", "2026-03-14T09:00:00Z"), item("b", "2026-03-15T09:00:00Z")];
    expect(groupMoments(items).map((entry) => entry.moment)).toEqual(["m-0001", "m-0002"]);
  });
});
