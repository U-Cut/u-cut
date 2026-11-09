// Renders templates/<id>/preview.gif for every template, from U-Cut's own sample photos, so the
// gallery shows each style moving. Run with:
//   pnpm exec tsx --conditions=source scripts/make-previews.ts [template ids...]
// It renders through the real engine, so `ucut setup` must have run. Each GIF is kept under 2 MB.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "ucut-previews-"));
// Everything the engine makes goes into a throwaway folder, not your reels.
process.env.UCUT_HOME = join(work, "home");

const { ingest } = await import("../packages/engine/src/ingest.ts");
const { planFor } = await import("../packages/engine/src/make.ts");
const { make } = await import("../packages/engine/src/make.ts");
const { makeDemo } = await import("../packages/engine/src/demo.ts");
const { makeStory } = await import("../packages/engine/src/story.ts");
const { renderPlan } = await import("../packages/engine/src/render.ts");
const { loadTracks, trackBeats } = await import("../packages/engine/src/library.ts");

const samples = join(root, "library/samples");
const maxBytes = 2 * 1024 * 1024;

/** A tall reel, its first few seconds, as a small looping GIF with its own palette. */
function toGif(video: string, gif: string) {
  const filter =
    "fps=10,scale=216:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4";
  execFileSync("ffmpeg", [
    ...["-hide_banner", "-loglevel", "error", "-y", "-t", "8", "-i", video],
    ...["-filter_complex", filter, "-loop", "0", gif],
  ]);
  const size = statSync(gif).size;
  if (size > maxBytes) throw new Error(`${gif} is ${Math.round(size / 1024)} KB, over 2 MB.`);
  return size;
}

/** Photos with capture times an hour apart, so stamps and stop labels have something to say. */
async function timedSamples(startHour: number, minutesApart: number) {
  const { items } = await ingest([samples]);
  return items.map((item, index) => {
    const minutes = startHour * 60 + index * minutesApart;
    return {
      ...item,
      takenAt: new Date(2026, 9, 31, Math.floor(minutes / 60), minutes % 60).toISOString(),
    };
  });
}

async function photoReel(
  template: string,
  vibe: "chill" | "hype" | "cinematic" | "nostalgic",
  title: string,
  output: string,
  times?: { startHour: number; minutesApart: number },
) {
  const items = times
    ? await timedSamples(times.startHour, times.minutesApart)
    : (await ingest([samples])).items;
  const track = loadTracks().find((candidate) => candidate.vibe === vibe);
  if (!track) throw new Error(`No ${vibe} track.`);
  const music = { src: track.file, length: track.length, beats: trackBeats(track) };
  const plan = planFor(
    items,
    { template, vibe, aspect: "9:16", duration: 9, seed: 3, title },
    music,
  );
  const result = await renderPlan(plan, items, {
    quality: "draft",
    projectDir: join(work, `${template}-project`),
  });
  execFileSync("cp", [result.path, output]);
}

/** A phone app where cards open, standing in for a screen recording of a product. */
function makeRecording(path: string) {
  const panels = [
    "drawbox=x=0:y=0:w=1080:h=220:color=0x17172a:t=fill",
    "drawbox=x=60:y=300:w=960:h=420:color=0x1f1f33:t=fill",
    "drawbox=x=60:y=780:w=960:h=420:color=white:t=fill:enable='between(t,2,7)'",
    "drawbox=x=60:y=1260:w=960:h=420:color=0x7c5cff:t=fill:enable='between(t,5,10)'",
    "drawbox=x=60:y=1740:w=960:h=120:color=0x7c5cff:t=fill:enable='between(t,8,12)'",
  ].join(",");
  execFileSync("ffmpeg", [
    ...["-hide_banner", "-loglevel", "error", "-y"],
    ...["-f", "lavfi", "-i", `color=c=0x0d0d14:s=1080x1920:r=30:d=12,${panels}`],
    ...["-c:v", "h264_videotoolbox", "-allow_sw", "1", "-b:v", "6M", "-pix_fmt", "yuv420p", path],
  ]);
}

const previews: Record<string, (output: string) => Promise<void>> = {
  "travel-montage": (output) => photoReel("travel-montage", "chill", "Coast to coast", output),
  "weekend-recap": (output) => photoReel("weekend-recap", "hype", "Weekend", output),
  "city-walk": (output) => photoReel("city-walk", "cinematic", "After dark", output),
  "cafe-crawl": (output) =>
    photoReel("cafe-crawl", "nostalgic", "Sunday cafés", output, {
      startHour: 9,
      minutesApart: 40,
    }),
  "day-in-my-life": (output) =>
    photoReel("day-in-my-life", "chill", "A Tuesday", output, { startHour: 7, minutesApart: 75 }),
  demo: async (output) => {
    const recording = join(work, "recording.mp4");
    makeRecording(recording);
    await makeDemo({
      recording,
      output,
      name: "Acme",
      colour: "#7c5cff",
      aspect: "9:16",
      captions: false,
      quality: "draft",
    });
  },
  explainer: async (output) => {
    await makeStory({
      prompt: "Three things for a mountain weekend",
      // "Your words" shows someone's own lines, so the preview uses written ones.
      lines: [
        { text: "Three things for the mountains." },
        { text: "Pack light." },
        { text: "Leave before sunrise." },
        { text: "Stay for the last light." },
      ],
      inputs: [samples],
      output,
      voice: null,
      quality: "draft",
      seed: 2,
      vibe: "cinematic",
      aspect: "9:16",
      duration: 9,
    });
  },
  recipe: async (output) => {
    // Its style comes from another reel, so it copies the weekend recap's cut.
    const reference = join(work, "reference.mp4");
    await photoReel("weekend-recap", "hype", "", reference);
    await make({
      inputs: [samples],
      output,
      like: reference,
      template: "recipe",
      vibe: "hype",
      aspect: "9:16",
      duration: 9,
      seed: 5,
      title: "Same cut, new trip",
      quality: "draft",
    });
  },
};

const wanted = process.argv.slice(2);
const templates = readdirSync(join(root, "templates"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((id) => wanted.length === 0 || wanted.includes(id));
try {
  for (const id of templates) {
    const render = previews[id];
    if (!render) throw new Error(`make-previews doesn't know how to show "${id}". Add it here.`);
    const video = join(work, `${id}.mp4`);
    await render(video);
    const size = toGif(video, join(root, "templates", id, "preview.gif"));
    console.log(`${id}: ${Math.round(size / 1024)} KB`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
