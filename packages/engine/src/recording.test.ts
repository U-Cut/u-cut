import { describe, expect, it } from "vitest";
import { applyHints, cleanWords } from "./recording.ts";

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

describe("spelling names the way they were given", () => {
  const word = (text: string, start: number) => ({ text, start, end: start + 0.3 });

  it("joins a name heard as two words, keeping its punctuation and timing", () => {
    const heard = [word("Open", 0), word("U", 0.4), word("Cut.", 0.7), word("Now", 1.1)];
    expect(applyHints(heard, ["U-Cut"])).toEqual([
      word("Open", 0),
      { text: "U-Cut.", start: 0.4, end: 1 },
      word("Now", 1.1),
    ]);
  });

  it("fixes the capitals of a name heard as one word, and leaves other words alone", () => {
    const heard = [word("claude", 0), word("is", 0.4), word("ucut", 0.8)];
    expect(applyHints(heard, ["Claude", "U-Cut"]).map((entry) => entry.text)).toEqual([
      "Claude",
      "is",
      "U-Cut",
    ]);
    expect(applyHints(heard, [])).toEqual(heard);
  });
});
