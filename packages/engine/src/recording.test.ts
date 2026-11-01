import { describe, expect, it } from "vitest";
import { cleanWords } from "./recording.ts";

describe("cleanWords", () => {
  it("drops what Whisper writes for silence", () => {
    const words = ["[BLANK_AUDIO]", "(wind blowing)", " Hello", "♪", "world."].map((text) => ({
      text,
      start: 0,
      end: 1,
    }));
    expect(cleanWords(words).map((word) => word.text)).toEqual(["Hello", "world."]);
  });
});
