import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { samplesDir } from "./library.ts";
import { make } from "./make.ts";
import { hashFile } from "./store.ts";
import { studyReel } from "./study.ts";

const title = "Secret caption words";

describe("studying a reel", () => {
  let home: string;
  let reel: string;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "ucut-study-"));
    process.env.UCUT_HOME = home;
    reel = join(home, "reference.mp4");
    await make({
      inputs: [samplesDir],
      output: reel,
      template: "travel-montage",
      vibe: "hype",
      aspect: "9:16",
      duration: 10,
      seed: 1,
      title,
      quality: "draft",
    });
  });
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  it("recovers the rhythm of a reel whose real cuts are known", async () => {
    const { recipe, description } = await studyReel(reel);
    expect(recipe.aspect).toBe("9:16");
    expect(recipe.bpm).toBeCloseTo(128, -1);
    expect(recipe.cutRhythm.median).toBeCloseTo(0.94, 1);
    expect(recipe.cutRhythm.onBeat).toBe(true);
    expect(recipe.text).toMatchObject({ case: "upper", position: "lower" });
    expect(description).toContain("cutting on the beat");
  });

  it("never records what the reel's words say", async () => {
    const { recipe, description } = await studyReel(reel);
    const everything = `${JSON.stringify(recipe)} ${description}`.toLowerCase();
    for (const word of title.toLowerCase().split(" ")) expect(everything).not.toContain(word);
  });

  it("keeps nothing from the reel when making a new one", async () => {
    const output = join(home, "mine.mp4");
    let job = "";
    await make(
      {
        inputs: [join(samplesDir, "night-city.jpg"), join(samplesDir, "open-ocean.jpg")],
        output,
        template: "travel-montage",
        vibe: "chill",
        aspect: "9:16",
        duration: 10,
        seed: 2,
        title: "",
        quality: "draft",
        like: reel,
      },
      (event) => {
        if (event.type === "done") job = event.job;
      },
    );

    const plan = readFileSync(join(job, "plan.json"), "utf8");
    expect(plan).not.toContain("reference");
    expect(plan.toLowerCase()).not.toContain("secret");

    // The reference's picture and sound are nowhere in the project or the store.
    const referenceHash = await hashFile(reel);
    expect(readdirSync(join(job, "project", "assets")).join()).not.toContain(referenceHash);
    expect(readdirSync(join(home, "store")).join()).not.toContain(
      referenceHash.slice(0, 2) + referenceHash,
    );
    const usedMedia = (JSON.parse(plan) as { shots: { media: string }[] }).shots.map(
      (shot) => shot.media,
    );
    expect(new Set(usedMedia).size).toBeLessThanOrEqual(2);

    const report = execFileSync(
      "bash",
      [
        "-c",
        `ffmpeg -hide_banner -i "${reel}" -i "${output}" -lavfi "[0:v][1:v]scale2ref[a][b];[a][b]ssim" -f null - 2>&1 | grep All`,
      ],
      { encoding: "utf8" },
    );
    expect(Number(/All:([\d.]+)/.exec(report)?.[1])).toBeLessThan(0.9);
  });
});
