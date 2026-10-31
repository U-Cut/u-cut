import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EditPlan, MediaItem, StyleRecipe, TemplateManifest, validate } from "./index.ts";

function fixture(name: string): Record<string, unknown> {
  const url = new URL(`../fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
}

function planWithShots(edit: (shots: Record<string, unknown>[]) => void) {
  const plan = fixture("edit-plan");
  edit(plan.shots as Record<string, unknown>[]);
  return validate(EditPlan, plan, "plan.json");
}

describe("fixtures", () => {
  it("media-item is valid", () => {
    expect(validate(MediaItem, fixture("media-item"), "media.json")).toMatchObject({ ok: true });
  });

  it("style-recipe is valid", () => {
    expect(validate(StyleRecipe, fixture("style-recipe"), "recipe.json")).toMatchObject({
      ok: true,
    });
  });

  it("edit-plan is valid", () => {
    expect(validate(EditPlan, fixture("edit-plan"), "plan.json")).toMatchObject({ ok: true });
  });

  it("template-manifest is valid", () => {
    expect(validate(TemplateManifest, fixture("template-manifest"), "template.json")).toMatchObject(
      { ok: true },
    );
  });
});

describe("EditPlan", () => {
  it("rejects a shot whose out point is not after its in point", () => {
    const result = planWithShots((shots) => {
      (shots[0] as Record<string, unknown>).in = 3;
    });
    expect(result).toEqual({
      ok: false,
      errors: ["plan.json: shots[0] must end its source range after it starts."],
    });
  });

  it("rejects a shot that ends before it starts", () => {
    const result = planWithShots((shots) => {
      const shot = shots[1] as Record<string, unknown>;
      shot.start = 4;
      shot.end = 3;
    });
    expect(result).toEqual({
      ok: false,
      errors: ["plan.json: shots[1] must end after it starts."],
    });
  });

  it("rejects a shot that runs past the end of the reel", () => {
    const result = planWithShots((shots) => {
      (shots[1] as Record<string, unknown>).end = 5;
    });
    expect(result).toEqual({
      ok: false,
      errors: ["plan.json: shots[1] runs past the end of the reel (4 s)."],
    });
  });

  it("rejects overlapping shots", () => {
    const result = planWithShots((shots) => {
      (shots[1] as Record<string, unknown>).start = 1.5;
    });
    expect(result).toEqual({
      ok: false,
      errors: ["plan.json: shots[1] overlaps the shot before it."],
    });
  });
});

describe("MediaItem", () => {
  it("keeps at most three labels", () => {
    const item = fixture("media-item");
    const label = { id: "cafe", score: 0.5 };
    item.labels = [label, label, label, label];
    const result = validate(MediaItem, item, "media.json");
    expect(result).toEqual({
      ok: false,
      errors: ["media.json: labels must have at most 3 items."],
    });
  });

  it("treats null as not analysed yet", () => {
    const item = fixture("media-item");
    item.quality = { sharpness: null, exposure: null, faces: null, dupGroup: null };
    item.moment = null;
    item.labels = [];
    expect(validate(MediaItem, item, "media.json")).toMatchObject({ ok: true });
  });
});

describe("validate", () => {
  it("says what is missing in a plain sentence", () => {
    const plan = fixture("edit-plan");
    const shots = plan.shots as Record<string, unknown>[];
    plan.shots = [shots[0], shots[1], { ...shots[1], start: 4 }];
    delete (plan.shots as Record<string, unknown>[])[2]?.end;
    const result = validate(EditPlan, plan, "plan.json");
    expect(result).toEqual({ ok: false, errors: ["plan.json: shots[2].end is missing."] });
  });

  it("names the choices for a bad enum value", () => {
    const plan = fixture("edit-plan");
    plan.vibe = "spooky";
    expect(validate(EditPlan, plan, "plan.json")).toEqual({
      ok: false,
      errors: ["plan.json: vibe must be one of: chill, hype, cinematic, nostalgic."],
    });
  });

  it("names an unexpected field", () => {
    const plan = fixture("edit-plan");
    plan.colour = "red";
    expect(validate(EditPlan, plan, "plan.json")).toEqual({
      ok: false,
      errors: ['plan.json has a field it doesn\'t expect: "colour".'],
    });
  });

  it("explains a value of the wrong type", () => {
    const plan = fixture("edit-plan");
    plan.fps = "thirty";
    expect(validate(EditPlan, plan, "plan.json")).toEqual({
      ok: false,
      errors: ["plan.json: fps must be a number."],
    });
  });

  it("rejects a manifest with a licence outside the allowed list", () => {
    const manifest = fixture("template-manifest");
    manifest.licence = "GPL-3.0";
    expect(validate(TemplateManifest, manifest, "template.json")).toEqual({
      ok: false,
      errors: [
        "template.json: licence must be one of: Apache-2.0, MIT, CC0-1.0, CC-BY-4.0, OFL-1.1.",
      ],
    });
  });
});
