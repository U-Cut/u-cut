import { describe, expect, it } from "vitest";
import { readPrompt, splitIntoLines, writeScript } from "./prompt.ts";

const wordsIn = (text: string) => text.split(/\s+/).length;

describe("readPrompt", () => {
  it("reads the brief's own example", () => {
    expect(readPrompt("a 20-second reel about my Goa trip, chill vibe")).toMatchObject({
      kind: "trip",
      topic: "my Goa trip",
      subject: "Goa",
      vibe: "chill",
      duration: 20,
      aspect: null,
      ownWords: null,
    });
  });

  it.each([
    [
      "15 sec epic video of our road trip to Ladakh",
      { subject: "Ladakh", vibe: "cinematic", duration: 15 },
    ],
    ["make a square reel about my sister's wedding", { aspect: "1:1", kind: "moment" }],
    [
      "a one minute landscape video on how to make filter coffee",
      { aspect: "16:9", duration: 60, kind: "topic" },
    ],
    [
      "half a minute of memories from last summer",
      { vibe: "nostalgic", duration: 30, kind: "moment" },
    ],
    ["my trip to New York City", { subject: "New York City", kind: "trip" }],
  ])("reads %s", (text, expected) => {
    expect(readPrompt(text)).toMatchObject(expected);
  });

  it("keeps a reel to a sensible length", () => {
    expect(readPrompt("a 2 second reel").duration).toBe(6);
    expect(readPrompt("a 10 minute film").duration).toBe(60);
  });

  it("treats a pasted script as their own words", () => {
    const script = "We landed at dawn. The whole city was asleep. By noon we were on the water.";
    expect(readPrompt(script).ownWords).toBe(script);
  });

  it("uses quoted words as they are", () => {
    expect(readPrompt('a reel that says "Goa was the best week ever"').ownWords).toBe(
      "Goa was the best week ever",
    );
  });

  it("copes with almost nothing", () => {
    expect(readPrompt("reel").topic).toBe("this");
  });
});

describe("splitIntoLines", () => {
  it("keeps every line to eight words, breaking at pauses", () => {
    const lines = splitIntoLines(
      "We walked along the shore for hours, talking about everything and nothing at all until the sun went down.",
    );
    for (const line of lines) expect(wordsIn(line)).toBeLessThanOrEqual(8);
    expect(lines[0]).toMatch(/hours,$/);
    expect(lines.join(" ")).toContain("until the sun went down.");
  });

  it("joins a stray word to its neighbour", () => {
    expect(splitIntoLines("It was the best day. Really.")).toEqual([
      "It was the best day. Really.",
    ]);
  });
});

describe("writeScript", () => {
  const base = { scenes: [], vibe: "chill" as const, duration: 20, seed: 1 };
  const trip = readPrompt("my Goa trip");

  it("is the same for the same seed, and changes with it", () => {
    const first = writeScript({ ...base, request: trip });
    expect(writeScript({ ...base, request: trip })).toEqual(first);
    expect(writeScript({ ...base, request: trip, seed: 2 })).not.toEqual(first);
  });

  it.each(["chill", "hype", "cinematic", "nostalgic"] as const)(
    "writes %s lines of three to eight words",
    (vibe) => {
      for (const text of ["my Goa trip", "my birthday", "how sleep works"]) {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const lines = writeScript({ ...base, vibe, seed, request: readPrompt(text) });
          for (const line of lines) {
            expect(wordsIn(line.text)).toBeGreaterThanOrEqual(3);
            expect(wordsIn(line.text)).toBeLessThanOrEqual(8);
            expect(line.text).not.toContain("{");
          }
        }
      }
    },
  );

  it("never leaves a sentence starting in lower case", () => {
    const lines = writeScript({
      ...base,
      vibe: "hype",
      seed: 3,
      request: readPrompt("my trip to goa"),
    });
    for (const line of lines) expect(line.text.charAt(0)).toBe(line.text.charAt(0).toUpperCase());
  });

  it("fits about the right amount of speech to the length", () => {
    expect(writeScript({ ...base, duration: 10, request: trip })).toHaveLength(5);
    expect(writeScript({ ...base, duration: 20, request: trip })).toHaveLength(9);
  });

  it("never repeats a line, however long the reel", () => {
    const scenes = ["beach", "food", "city-street", "temple", "sky", "market"];
    const lines = writeScript({ ...base, duration: 60, scenes, request: trip });
    expect(lines.length).toBeGreaterThan(9);
    expect(new Set(lines.map((line) => line.text)).size).toBe(lines.length);
  });

  it("writes about the scenes in someone's photos, and says which", () => {
    const lines = writeScript({ ...base, request: trip, scenes: ["beach", "food"] });
    expect(lines[1]?.scene).toBe("beach");
    expect(lines[1]?.text).toMatch(/the beach/i);
    expect(lines[2]?.scene).toBe("food");
    expect(lines[2]?.text).toMatch(/good food/i);
  });

  it("gives lines their own speed", () => {
    const lines = writeScript({ ...base, request: trip });
    const speeds = new Set(lines.map((line) => line.speed));
    expect(speeds.size).toBeGreaterThan(1);
    expect(lines.at(-1)?.speed).toBeLessThan(lines[1]?.speed ?? 0);
  });

  it("leaves someone's own words as they wrote them", () => {
    const words = "We landed at dawn. The whole city was asleep. By noon we were on the water.";
    const lines = writeScript({ ...base, request: readPrompt(words) });
    expect(lines.map((line) => line.text).join(" ")).toBe(words);
  });
});
