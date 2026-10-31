import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { master, verifyOutput } from "./master.ts";

describe("master", () => {
  let folder: string;
  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), "ucut-master-"));
  });
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  it("copes with a completely silent reel", async () => {
    const input = join(folder, "silent.mp4");
    const output = join(folder, "out.mp4");
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=black:s=320x568:r=30:d=2",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", input,
    ]); // biome-ignore format: flags read better in pairs
    await master(input, output);
    const report = await verifyOutput(output, { width: 320, height: 568, duration: 2, fps: 30 });
    expect(report.problems).toEqual([]);
  });
});
