import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanAssets, scanDependencies } from "./license-scan.ts";

describe("license-scan", () => {
  let root: string;

  function write(path: string, content = "x") {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }

  function pkg(path: string, fields: Record<string, unknown>) {
    write(join(path, "package.json"), JSON.stringify(fields));
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ucut-scan-"));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  describe("scanAssets", () => {
    it("passes a listed asset with an allowed licence", () => {
      write("library/music/a.m4a");
      write(
        "library/music/assets.json",
        JSON.stringify([{ file: "a.m4a", licence: "CC0-1.0", source: "scripts/make-music.ts" }]),
      );
      expect(scanAssets(root).findings).toEqual([]);
    });

    it("reports an unlisted asset, a video and GSAP in a template", () => {
      write("library/music/song.wav");
      write("demo.mp4");
      write("templates/x/index.html", '<script src="gsap.min.js"></script>');
      expect(scanAssets(root).findings.sort()).toEqual([
        "demo.mp4 is a video file. Video doesn't belong in git (see docs/decisions/0007-media-in-the-repo.md).",
        "library/music/song.wav has no licence entry in library/music/assets.json.",
        "templates/x/index.html mentions GSAP. Templates must be GSAP-free (see docs/decisions/0002-no-gsap-in-templates.md).",
      ]);
    });

    it("reports a disallowed asset licence", () => {
      write("library/sfx/a.wav");
      write(
        "library/sfx/assets.json",
        JSON.stringify([{ file: "a.wav", licence: "CC-BY-NC-4.0", source: "somewhere" }]),
      );
      expect(scanAssets(root).findings).toEqual([
        "library/sfx/a.wav has a licence that isn't allowed: CC-BY-NC-4.0.",
      ]);
    });

    it("allows a small template preview but not a large one", () => {
      write("templates/x/preview.gif");
      expect(scanAssets(root).findings).toEqual([]);
      write("templates/x/preview.gif", "x".repeat(2 * 1024 * 1024 + 1));
      expect(scanAssets(root).findings).toEqual([
        "templates/x/preview.gif is over the 2 MB limit.",
      ]);
    });

    it("ignores installed and built folders", () => {
      write("node_modules/x/demo.mp4");
      write("apps/mac/.build/demo.mp4");
      expect(scanAssets(root).findings).toEqual([]);
    });
  });

  describe("scanDependencies", () => {
    it("follows production dependencies and reports non-permissive ones", () => {
      pkg("packages/a", {
        name: "a",
        dependencies: { fine: "1", dual: "1", vips: "npm:@img/sharp-libvips-darwin-arm64@1" },
        devDependencies: { devonly: "1" },
      });
      pkg("node_modules/fine", { name: "fine", license: "MIT", dependencies: { deep: "1" } });
      pkg("node_modules/deep", { name: "deep", license: "GPL-3.0" });
      pkg("node_modules/dual", { name: "dual", license: "(MIT OR GPL-2.0)" });
      pkg("node_modules/vips", {
        name: "@img/sharp-libvips-darwin-arm64",
        license: "LGPL-3.0-or-later",
      });
      pkg("node_modules/devonly", { name: "devonly", license: "GPL-3.0" });

      const result = scanDependencies(root);
      expect(result.findings).toEqual(["deep uses a licence that isn't allowed: GPL-3.0."]);
      expect(result.checked).toBe(4);
    });

    it("reports a package with no licence", () => {
      pkg("packages/a", { name: "a", dependencies: { mystery: "1" } });
      pkg("node_modules/mystery", { name: "mystery" });
      expect(scanDependencies(root).findings).toEqual(["mystery doesn't declare a licence."]);
    });
  });
});
