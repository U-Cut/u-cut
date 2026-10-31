import { describe, expect, it } from "vitest";
import { sceneModel } from "./analyse.ts";
import { loadScenes } from "./library.ts";

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
