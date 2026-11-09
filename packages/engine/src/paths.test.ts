import { describe, expect, it } from "vitest";
import { rootFrom } from "./paths.ts";

describe("paths", () => {
  it("finds its folder when the app runs it from Application Support, which has a space", () => {
    const module =
      "file:///Users/someone/Library/Application%20Support/U-Cut/runtime/0.1.1-abc/engine/packages/engine/dist/paths.js";
    expect(rootFrom(module)).toBe(
      "/Users/someone/Library/Application Support/U-Cut/runtime/0.1.1-abc/engine/",
    );
  });
});
