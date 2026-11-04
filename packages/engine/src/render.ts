import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { cpus, platform } from "node:os";
import { dirname, extname, join } from "node:path";
import { composeHtml, composeParts, sizes } from "@u-cut/compose";
import type { EditPlan, MediaItem } from "@u-cut/schema";
import { renderPhoto } from "./derive.ts";
import { hf } from "./hf.ts";
import { findTemplate, fontsDir, loadFonts, musicDir } from "./library.ts";
import { master, verifyOutput } from "./master.ts";
import { rendersDir, repoRoot } from "./paths.ts";
import { isHash, storedFolder } from "./store.ts";
import { voiceFile } from "./voice.ts";

export type Quality = "draft" | "looks" | "delivery";

export interface RenderProgress {
  stage: "preparing" | "rendering" | "finishing";
  /** 0 to 1 across the whole render. */
  progress: number;
}

export interface RenderOptions {
  quality?: Quality;
  workers?: number;
  signal?: AbortSignal;
  /** Where the editable project is written. */
  projectDir: string;
  onProgress?: (progress: RenderProgress) => void;
}

export interface RenderResult {
  path: string;
  key: string;
  cached: boolean;
}

const gigabyte = 1024 ** 3;

/** Chrome workers that fit in memory without pushing the machine into swap. */
export function defaultWorkers(available = process.availableMemory()): number {
  const fitting = Math.floor(available / (0.6 * gigabyte));
  return Math.max(1, Math.min(fitting, Math.floor(cpus().length / 2), 4));
}

async function engineVersion(): Promise<string> {
  const file = join(repoRoot, "packages/engine/package.json");
  return (JSON.parse(await readFile(file, "utf8")) as { version: string }).version;
}

/** The same plan at the same quality is the same file, so it's only ever rendered once. */
export async function renderKey(plan: EditPlan, quality: Quality): Promise<string> {
  const template = findTemplate(plan.template);
  const hash = createHash("sha256");
  hash.update(await engineVersion());
  hash.update(template.css);
  hash.update(quality);
  hash.update(JSON.stringify(plan));
  return hash.digest("hex").slice(0, 32);
}

function musicSource(src: string): string {
  return src.startsWith("/") ? src : join(musicDir, src);
}

async function link(source: string, target: string) {
  await copyFile(source, target, constants.COPYFILE_FICLONE);
}

/** Whether someone has changed a project's composition since U-Cut wrote it. */
export async function projectEdited(projectDir: string): Promise<boolean> {
  const [html, written] = await Promise.all([
    readFile(join(projectDir, "index.html"), "utf8").catch(() => null),
    readFile(join(projectDir, ".ucut-written"), "utf8").catch(() => null),
  ]);
  if (html === null || written === null) return false;
  return createHash("sha256").update(html).digest("hex") !== written.trim();
}

/** Writes the HyperFrames project that people can open and edit. */
export async function writeProject(plan: EditPlan, items: MediaItem[], projectDir: string) {
  const template = findTemplate(plan.template);
  const assets = join(projectDir, "assets");
  await rm(projectDir, { recursive: true, force: true });
  await mkdir(join(assets, "fonts"), { recursive: true });

  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  const names = new Map<string, string>();
  const logos = (plan.cards ?? []).flatMap((card) => (card.logo ? [card.logo] : []));
  for (const id of new Set([...plan.shots.map((shot) => shot.media), ...logos])) {
    const item = byId[id];
    if (!item) throw new Error(`The plan uses media "${id}", which isn't in this project.`);
    const source = item.kind === "photo" ? await renderPhoto(item) : item.path;
    const name = `${id}${extname(source).toLowerCase()}`;
    await link(source, join(assets, name));
    names.set(id, name);
  }

  const musicName = `music${extname(plan.music.src)}`;
  await link(musicSource(plan.music.src), join(assets, musicName));
  for (const font of loadFonts()) {
    await link(join(fontsDir, font.file), join(assets, "fonts", font.file));
  }
  for (const src of new Set((plan.voice ?? []).map((line) => line.src))) {
    if (!isHash(src)) throw new Error("That reel's voice isn't one U-Cut made.");
    await link(join(storedFolder(src), voiceFile), join(assets, `${src}.wav`));
  }

  const fontCss = loadFonts()
    .map(
      (font) =>
        `@font-face{font-family:"${font.family}";font-weight:${font.weight};font-style:${font.style};src:url("assets/fonts/${font.file}") format("woff2")}`,
    )
    .join("\n");
  const input = {
    plan,
    items: byId,
    templateCss: template.css,
    fontCss,
    assets: {
      media: (item: MediaItem) => `assets/${names.get(item.id)}`,
      music: () => `assets/${musicName}`,
      voice: (src: string) => `assets/${src}.wav`,
    },
  };
  const html = composeHtml(input);
  await writeFile(join(projectDir, "index.html"), html);
  // A fingerprint of what U-Cut wrote, so edits made afterwards are never overwritten by surprise.
  await writeFile(
    join(projectDir, ".ucut-written"),
    `${createHash("sha256").update(html).digest("hex")}\n`,
  );
  await writeFile(
    join(projectDir, "hyperframes.json"),
    `${JSON.stringify({ paths: { assets: "assets" }, media: { autoProxy: true } }, null, 2)}\n`,
  );
  await writeFile(join(projectDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  return composeParts(input);
}

interface ProgressLine {
  done?: number;
  total?: number;
  pct?: number;
}

/** HyperFrames renders the folder's composition, frame by frame, with every offline switch on. */
async function renderFrames(
  projectDir: string,
  raw: string,
  options: {
    quality: Quality;
    workers: number;
    screen: boolean;
    report: (progress: RenderProgress) => void;
    signal?: AbortSignal;
  },
) {
  await hf(
    [
      "render",
      projectDir,
      "-o",
      raw,
      "--sdr",
      "--no-best-effort",
      "--quality",
      options.quality,
      "--workers",
      String(options.workers),
      ...(platform() === "darwin" ? ["--gpu"] : []),
      // Lossless frames, because JPEG smears the small text on a screen.
      ...(options.screen ? ["--video-frame-format", "png"] : []),
    ],
    {
      nice: 10,
      ...(options.signal ? { signal: options.signal } : {}),
      onLine: (line) => {
        if (!line.startsWith("@hf-progress")) return;
        try {
          const { pct } = JSON.parse(line.slice("@hf-progress".length)) as ProgressLine;
          if (typeof pct === "number") options.report({ stage: "rendering", progress: pct / 100 });
        } catch {
          // A malformed progress line only costs one update.
        }
      },
    },
  );
}

/**
 * Renders a project folder as it stands, for when someone has edited the composition by hand or
 * with the HyperFrames skills. The sound is still mastered and the file still checked.
 */
export async function renderProject(
  projectDir: string,
  plan: EditPlan,
  options: Omit<RenderOptions, "projectDir"> & { output: string },
): Promise<string> {
  const report = options.onProgress ?? (() => {});
  const html = await readFile(join(projectDir, "index.html"), "utf8");
  const duration = Number(/data-duration="([\d.]+)"/.exec(html)?.[1] ?? plan.duration);
  const { width, height } = sizes[plan.aspect];
  await mkdir(rendersDir(), { recursive: true });
  const stamp = `project-${Date.now()}`;
  const raw = join(rendersDir(), `${stamp}.raw.mp4`);
  const mastered = join(rendersDir(), `${stamp}.master.mp4`);
  const awake =
    platform() === "darwin" ? spawn("caffeinate", ["-i"], { stdio: "ignore" }) : undefined;
  try {
    report({ stage: "rendering", progress: 0 });
    await renderFrames(projectDir, raw, {
      quality: options.quality ?? "looks",
      workers: options.workers ?? defaultWorkers(),
      screen: plan.template === "demo",
      report,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    report({ stage: "finishing", progress: 0.97 });
    await master(raw, mastered, options.signal);
    const spec = await verifyOutput(mastered, { width, height, duration, fps: plan.fps });
    if (!spec.ok) throw new Error(`The finished reel isn't right: ${spec.problems.join(" ")}`);
    await mkdir(dirname(options.output), { recursive: true });
    await rename(mastered, options.output).catch(async () => {
      await copyFile(mastered, options.output);
    });
    report({ stage: "finishing", progress: 1 });
    return options.output;
  } finally {
    awake?.kill();
    await rm(raw, { force: true });
    await rm(mastered, { force: true });
  }
}

export async function renderPlan(
  plan: EditPlan,
  items: MediaItem[],
  options: RenderOptions,
): Promise<RenderResult> {
  const quality = options.quality ?? "looks";
  const key = await renderKey(plan, quality);
  const finalPath = join(rendersDir(), `${key}.mp4`);
  const report = options.onProgress ?? (() => {});
  const already = await stat(finalPath).catch(() => undefined);
  if (already?.isFile()) {
    report({ stage: "finishing", progress: 1 });
    return { path: finalPath, key, cached: true };
  }

  report({ stage: "preparing", progress: 0 });
  // A screen can sleep during an export, but the Mac itself has to stay awake to finish it.
  const awake =
    platform() === "darwin" ? spawn("caffeinate", ["-i"], { stdio: "ignore" }) : undefined;
  await mkdir(rendersDir(), { recursive: true });
  const { width, height } = await writeProject(plan, items, options.projectDir);
  const raw = join(rendersDir(), `${key}.raw.mp4`);
  const mastered = join(rendersDir(), `${key}.master.mp4`);
  const workers = options.workers ?? defaultWorkers();

  try {
    await renderFrames(options.projectDir, raw, {
      quality,
      workers,
      screen: plan.template === "demo",
      report,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    report({ stage: "finishing", progress: 0.97 });
    await master(raw, mastered, options.signal);
    const spec = await verifyOutput(mastered, {
      width,
      height,
      duration: plan.duration,
      fps: plan.fps,
    });
    if (!spec.ok) throw new Error(`The finished reel isn't right: ${spec.problems.join(" ")}`);
    await rename(mastered, finalPath);
    report({ stage: "finishing", progress: 1 });
    return { path: finalPath, key, cached: false };
  } finally {
    awake?.kill();
    await rm(raw, { force: true });
    await rm(mastered, { force: true });
  }
}
