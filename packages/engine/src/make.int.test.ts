import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hf } from "./hf.ts";
import { ingest } from "./ingest.ts";
import { loadTracks, samplesDir, trackBeats } from "./library.ts";
import { make, planFor } from "./make.ts";
import { writeProject } from "./render.ts";

let home: string;
const ffmpeg = (...args: string[]) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

const defaults = {
  template: "travel-montage",
  vibe: "hype",
  aspect: "9:16",
  duration: 6,
  seed: 1,
  title: "",
  quality: "draft",
} as const;

function probeVideo(path: string) {
  const output = execFileSync(
    "ffprobe",
    // biome-ignore format: flags read better in pairs
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,color_transfer,width,height",
      "-of", "json", path],
    { encoding: "utf8" },
  );
  return (JSON.parse(output) as { streams: Record<string, string | number>[] }).streams[0];
}

function measureLoudness(path: string) {
  const result = execFileSync(
    "bash",
    [
      "-c",
      `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true -f null - 2>&1 | tail -14`,
    ],
    { encoding: "utf8" },
  );
  return {
    integrated: Number(/I:\s+(-?[\d.]+) LUFS/.exec(result)?.[1]),
    peak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(result)?.[1]),
  };
}

function messyPhoneFolder(): string {
  const folder = join(home, "From my iPhone 📱");
  mkdirSync(join(folder, "Day 2"), { recursive: true });
  const sample = join(samplesDir, "sunset-ridge.jpg");
  execFileSync(
    "sips",
    ["-s", "format", "heic", sample, "--out", join(folder, "IMG_1234 (1).HEIC")],
    {
      stdio: "ignore",
    },
  );
  copyFileSync(join(samplesDir, "open-ocean.jpg"), join(folder, "Day 2", "IMG_0001.JPG"));
  copyFileSync(join(samplesDir, "snow-peaks.jpg"), join(folder, "IMG_7777.JPG"));
  // The moving half of a Live Photo, sitting beside its still.
  ffmpeg("-f", "lavfi", "-i", "testsrc2=size=480x640:rate=30", "-t", "2", "-pix_fmt", "yuv420p",
    join(folder, "IMG_7777.MOV")); // biome-ignore format: flags read better in pairs
  // Rotated 10-bit HLG HEVC, as an iPhone records by default.
  // The Mac app's FFmpeg has no libx265, so it uses Apple's encoder, as the iPhone does.
  const hevc = execFileSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" }).includes(
    " libx265 ",
  )
    ? [
        "-vf",
        "format=yuv420p10le",
        "-c:v",
        "libx265",
        "-preset",
        "ultrafast",
        "-x265-params",
        "log-level=error:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc",
      ]
    : [
        "-vf",
        "format=p010le",
        "-c:v",
        "hevc_videotoolbox",
        "-profile:v",
        "main10",
        "-allow_sw",
        "1",
        "-b:v",
        "6M",
        "-color_primaries",
        "bt2020",
        "-color_trc",
        "arib-std-b67",
        "-colorspace",
        "bt2020nc",
      ];
  ffmpeg("-display_rotation", "90", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-t", "4",
    ...hevc, "-tag:v", "hvc1", join(folder, "IMG_2000.MOV")); // biome-ignore format: flags read better in pairs
  writeFileSync(join(folder, "IMG_1234.AAE"), "<plist/>");
  writeFileSync(join(folder, ".DS_Store"), "junk");
  writeFileSync(join(folder, "broken.jpg"), "");
  return folder;
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "ucut-int-"));
  process.env.UCUT_HOME = home;
});

afterAll(() => rmSync(home, { recursive: true, force: true }));

describe("ucut make", () => {
  it("turns the samples into a reel that meets the output spec", async () => {
    const output = join(home, "samples.mp4");
    await make({ ...defaults, inputs: [samplesDir], output });
    expect(probeVideo(output)).toMatchObject({
      codec_name: "h264",
      pix_fmt: "yuv420p",
      width: 1080,
      height: 1920,
    });
    const { integrated, peak } = measureLoudness(output);
    expect(Math.abs(integrated + 14)).toBeLessThan(0.5);
    expect(peak).toBeLessThanOrEqual(-1);
  });

  it("copes with a real phone's folder and still delivers H.264 SDR", async () => {
    const folder = messyPhoneFolder();
    const skipped: string[] = [];
    const output = join(home, "phone.mp4");
    await make({ ...defaults, inputs: [folder], output }, (event) => {
      if (event.type === "skipped") skipped.push(`${event.name}: ${event.reason}`);
    });
    expect(probeVideo(output)).toMatchObject({ codec_name: "h264", pix_fmt: "yuv420p" });
    expect(probeVideo(output)?.color_transfer).not.toBe("arib-std-b67");
    expect(skipped).toContain("IMG_7777.MOV: is the moving part of a Live Photo");
    expect(skipped).toContain("IMG_1234.AAE: isn't a photo or video");
    expect(skipped.some((line) => line.startsWith("broken.jpg"))).toBe(true);
  });

  it("reuses a finished render when nothing changed", async () => {
    const output = join(home, "again.mp4");
    const events: unknown[] = [];
    const options = { ...defaults, inputs: [samplesDir], output };
    await make(options);
    await make(options, (event) => events.push(event));
    expect(events.at(-1)).toMatchObject({ type: "done", cached: true });
  });

  it("explains an empty folder in a plain sentence", async () => {
    const empty = join(home, "nothing");
    mkdirSync(empty);
    await expect(
      make({ ...defaults, inputs: [empty], output: join(home, "x.mp4") }),
    ).rejects.toThrow("Add at least one photo or clip");
  });
});

describe("composed projects", () => {
  const track = loadTracks().find((candidate) => candidate.vibe === "hype");
  if (!track) throw new Error("no track");
  const music = { src: track.file, length: track.length, beats: trackBeats(track) };

  it.each([
    ["travel-montage", "9:16"],
    ["weekend-recap", "1:1"],
    ["city-walk", "16:9"],
    ["cafe-crawl", "9:16"],
    ["day-in-my-life", "9:16"],
  ] as const)("%s at %s passes the HyperFrames check", async (template, aspect) => {
    const read = await ingest([samplesDir]);
    // An hour apart, so time stamps and stop labels are drawn and checked too.
    const items = read.items.map((item, index) => ({
      ...item,
      takenAt: new Date(2026, 9, 31, 8 + index, (index * 7) % 60).toISOString(),
    }));
    const plan = planFor(items, { ...defaults, template, aspect, title: "Long way home" }, music);
    if (template === "day-in-my-life")
      expect(plan.texts.some((text) => text.style === "stamp")).toBe(true);
    if (template === "cafe-crawl")
      expect(plan.texts.some((text) => text.style === "stop")).toBe(true);
    const project = join(home, `check-${template}`);
    await writeProject(plan, items, project);
    const report = JSON.parse(
      await hf(["check", project, "--json", "--samples", "3", "--no-contrast"], {
        timeoutMs: 120_000,
      }),
    ) as { ok: boolean };
    expect(report.ok).toBe(true);
  });

  it("draws Hindi captions with real glyphs, not empty boxes", async () => {
    const { items } = await ingest([join(samplesDir, "night-city.jpg")]);
    async function frameFor(title: string, name: string) {
      const output = join(home, `${name}.mp4`);
      const plan = planFor(items, { ...defaults, duration: 2, title }, music);
      expect(plan.texts[0]?.text).toBe(title);
      await make({
        ...defaults,
        duration: 2,
        title,
        inputs: [join(samplesDir, "night-city.jpg")],
        output,
      });
      const frame = join(home, `${name}.png`);
      ffmpeg("-ss", "1", "-i", output, "-frames:v", "1", "-update", "1", frame);
      return frame;
    }
    // Missing glyphs all draw as the same box, so two different words would look identical.
    const first = await frameFor("नमस्ते", "hindi-a");
    const second = await frameFor("घर चलो", "hindi-b");
    const diff = execFileSync(
      "bash",
      [
        "-c",
        `ffmpeg -hide_banner -i "${first}" -i "${second}" -lavfi psnr -f null - 2>&1 | grep average`,
      ],
      { encoding: "utf8" },
    );
    expect(Number(/average:([\d.]+)/.exec(diff)?.[1])).toBeLessThan(45);
  });
});

describe("repeatability", () => {
  it("makes a byte-identical plan and a visually identical render", async () => {
    const homes = [join(home, "first"), join(home, "second")];
    const outputs: string[] = [];
    const plans: string[] = [];
    for (const [index, folder] of homes.entries()) {
      process.env.UCUT_HOME = folder;
      const output = join(home, `repeat-${index}.mp4`);
      let job = "";
      await make({ ...defaults, seed: 9, inputs: [samplesDir], output }, (event) => {
        if (event.type === "done") job = event.job;
      });
      outputs.push(output);
      plans.push(readFileSync(join(job, "plan.json"), "utf8"));
    }
    process.env.UCUT_HOME = home;
    expect(plans[0]).toBe(plans[1]);
    const report = execFileSync(
      "bash",
      [
        "-c",
        `ffmpeg -hide_banner -i "${outputs[0]}" -i "${outputs[1]}" -lavfi ssim -f null - 2>&1 | grep All`,
      ],
      { encoding: "utf8" },
    );
    expect(Number(/All:([\d.]+)/.exec(report)?.[1])).toBeGreaterThanOrEqual(0.995);
  });
});
