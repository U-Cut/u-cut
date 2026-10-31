import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateSwift, swiftOutputPath } from "../scripts/gen-swift.ts";
import { EditPlan, MediaItem, StyleRecipe, TemplateManifest, validate } from "./index.ts";

const repo = new URL("../../../", import.meta.url).pathname;
const hasSwift = process.platform === "darwin" && spawnSync("swift", ["--version"]).status === 0;

function fixturePath(name: string): string {
  return new URL(`../fixtures/${name}.json`, import.meta.url).pathname;
}

describe("generated Swift types", () => {
  it("match the schemas", () => {
    expect(readFileSync(swiftOutputPath, "utf8")).toBe(generateSwift());
  });

  it("quote Swift keywords used as field names", () => {
    const swift = generateSwift();
    expect(swift).toContain("public var `in`: Double");
    expect(swift).toContain("public var `case`: Case");
    expect(swift).toContain("public var `default`: ScalarValue");
  });

  describe.runIf(hasSwift)("round trip through Swift", () => {
    function roundTrip(type: string, fixture: string): unknown {
      const output = execFileSync(
        "swift",
        ["run", "--package-path", "apps/mac", "schema-roundtrip", type, fixturePath(fixture)],
        { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      return JSON.parse(output);
    }

    function expectLossless(fixture: string, decoded: unknown) {
      const original = JSON.parse(readFileSync(fixturePath(fixture), "utf8"));
      expect(decoded).toEqual(original);
    }

    it("keeps a MediaItem intact, including explicit nulls", { timeout: 300_000 }, () => {
      const decoded = roundTrip("MediaItem", "media-item");
      expect(validate(MediaItem, decoded, "swift media")).toMatchObject({ ok: true });
      expectLossless("media-item", decoded);
    });

    it("keeps a StyleRecipe intact", { timeout: 300_000 }, () => {
      const decoded = roundTrip("StyleRecipe", "style-recipe");
      expect(validate(StyleRecipe, decoded, "swift recipe")).toMatchObject({ ok: true });
      expectLossless("style-recipe", decoded);
    });

    it("keeps an EditPlan intact", { timeout: 300_000 }, () => {
      const decoded = roundTrip("EditPlan", "edit-plan");
      expect(validate(EditPlan, decoded, "swift plan")).toMatchObject({ ok: true });
      expectLossless("edit-plan", decoded);
    });

    it("keeps a TemplateManifest intact, including mixed default values", {
      timeout: 300_000,
    }, () => {
      const decoded = roundTrip("TemplateManifest", "template-manifest");
      expect(validate(TemplateManifest, decoded, "swift manifest")).toMatchObject({ ok: true });
      expectLossless("template-manifest", decoded);
    });
  });
});
