import { soundEffects } from "@u-cut/planner-rules";
import { describe, expect, it } from "vitest";
import { sceneModel } from "./analyse.ts";
import { loadScenes, loadSounds } from "./library.ts";

describe("scenes", () => {
  it("has a name in the app for everything the model can say", () => {
    const named = loadScenes().map((scene) => scene.id);
    for (const category of sceneModel()?.categories ?? []) expect(named).toContain(category);
  });

  it("leaves screenshots out of reels by default", () => {
    const documents = loadScenes().find((scene) => scene.id === "documents");
    expect(documents?.hiddenByDefault).toBe(true);
  });
});

describe("sound effects", () => {
  it("plans with the same lengths as the files in library/sfx", () => {
    const files = new Map(loadSounds().map((sound) => [sound.file, sound.length]));
    for (const effect of Object.values(soundEffects)) {
      expect(files.get(effect.src)).toBe(effect.length);
    }
    expect(loadSounds().every((sound) => sound.licence === "CC0-1.0")).toBe(true);
  });
});
