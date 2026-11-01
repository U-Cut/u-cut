import { EditPlan, validate } from "@u-cut/schema";
import { describe, expect, it } from "vitest";
import { cut, firstPrompt, type Way } from "./reels.ts";

const base = { prompt: firstPrompt, vibe: null, seed: 1 };
const ways: Way[] = ["sentence", "photos", "reference", "recording"];

describe("the reels on the website", () => {
  it.each(ways)("makes a valid plan for %s", (way) => {
    const { plan, composition, note } = cut({ ...base, way });
    expect(validate(EditPlan, plan, "plan")).toMatchObject({ ok: true });
    expect(composition.root).toContain("<div");
    expect(note.length).toBeGreaterThan(0);
  });

  it.each(["chill", "hype", "cinematic", "nostalgic"] as const)("cuts in the %s vibe", (vibe) => {
    expect(cut({ ...base, way: "sentence", vibe }).plan.vibe).toBe(vibe);
  });

  it("reads what someone types", () => {
    const { plan } = cut({
      ...base,
      way: "sentence",
      prompt: "a 12 second square reel about my birthday, hype vibe",
    });
    expect(plan).toMatchObject({ vibe: "hype", aspect: "1:1" });
    expect(plan.duration).toBeLessThan(16);
  });

  it("gives a different cut on each remix", () => {
    const first = cut({ ...base, way: "photos" }).plan.shots.map((shot) => shot.media);
    const second = cut({ ...base, way: "photos", seed: 2 }).plan.shots.map((shot) => shot.media);
    expect(second).not.toEqual(first);
  });

  it("only uses pictures the site has", () => {
    for (const way of ways) {
      expect(cut({ ...base, way }).composition.root).not.toContain("undefined");
    }
  });
});
