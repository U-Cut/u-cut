import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeDemo } from "./demo.ts";
import { ingest } from "./ingest.ts";
import { readRecording } from "./recording.ts";

let home: string;
let recording: string;

/** A dark screen where a panel opens top right, then another bottom left. */
function makeRecording(path: string) {
  const panels = [
    "drawbox=x=800:y=100:w=300:h=200:color=white:t=fill:enable='between(t,3,5)'",
    "drawbox=x=100:y=480:w=300:h=180:color=white:t=fill:enable='between(t,8,10)'",
  ].join(",");
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=0x101018:s=1280x720:r=30:d=12,${panels}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", path,
  ]); // biome-ignore format: flags read better in pairs
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "ucut-demo-"));
  process.env.UCUT_HOME = home;
  recording = join(home, "recording.mp4");
  makeRecording(recording);
});

afterAll(() => {
  delete process.env.UCUT_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe("a silent screen recording", () => {
  it("is read from what happens on screen", async () => {
    const { items } = await ingest([recording]);
    const { moments, words } = await readRecording(items[0] as (typeof items)[number]);
    expect(words).toEqual([]);
    expect(moments.length).toBeGreaterThanOrEqual(2);
    const first = moments[0];
    expect(first?.focus?.x).toBeGreaterThan(0.5);
    expect(first?.focus?.y).toBeLessThan(0.5);
    expect(first?.zoom).toBeGreaterThan(1.5);
  });

  it("becomes a finished demo with cards", async () => {
    const output = join(home, "demo.mp4");
    await makeDemo({
      recording,
      output,
      name: "Acme",
      colour: "#7b5cff",
      captions: true,
      quality: "draft",
    });
    const [width, height, duration] = execFileSync(
      "ffprobe",
      // biome-ignore format: flags read better in pairs
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "default=nw=1:nk=1", output],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .map(Number);
    expect([width, height]).toEqual([1920, 1080]);
    // Two cards plus at least two moments.
    expect(duration).toBeGreaterThan(5);
    expect(duration).toBeLessThan(12 + 3.2);
  });
});
