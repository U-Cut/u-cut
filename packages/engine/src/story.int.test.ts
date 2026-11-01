import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { samplesDir } from "./library.ts";
import { makeStory } from "./story.ts";
import { voiceReady } from "./voice.ts";

let home: string;

const base = { voice: null, quality: "draft", seed: 1 } as const;

function measure(path: string) {
  const [width, height, duration] = execFileSync(
    "ffprobe",
    // biome-ignore format: flags read better in pairs
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "default=nw=1:nk=1", path],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .map(Number);
  return { width, height, duration: duration ?? 0 };
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "ucut-story-"));
  process.env.UCUT_HOME = home;
});

afterAll(() => {
  delete process.env.UCUT_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe("a reel from a sentence", () => {
  it("is made from words alone, in the length and shape asked for", async () => {
    const output = join(home, "words.mp4");
    await makeStory({
      ...base,
      prompt: "a 10-second square reel about my Goa trip, hype vibe",
      inputs: [],
      output,
    });
    const reel = measure(output);
    expect([reel.width, reel.height]).toEqual([1080, 1080]);
    expect(reel.duration).toBeGreaterThan(8);
    expect(reel.duration).toBeLessThan(13);
  });

  it("uses someone's photos when there are some", async () => {
    const output = join(home, "photos.mp4");
    await makeStory({
      ...base,
      prompt: "an 8 second reel about our weekend",
      inputs: [samplesDir],
      output,
    });
    expect(measure(output)).toMatchObject({ width: 1080, height: 1920 });
  });

  it.runIf(voiceReady())("reads the script aloud, line by line", async () => {
    const output = join(home, "voice.mp4");
    const stages: string[] = [];
    await makeStory(
      {
        ...base,
        voice: "af_heart",
        prompt: "Goa was the best week. We never wanted to leave.",
        inputs: [],
        output,
      },
      (event) => {
        if (event.type === "progress") stages.push(event.stage);
      },
    );
    expect(stages).toContain("Voicing the script");
    expect(measure(output).duration).toBeGreaterThan(2);
  });
});
