import type { Aspect, EditPlan, MediaItem } from "@u-cut/schema";

/** The same composition drives the browser preview and the final render. */
export interface ComposeInput {
  plan: EditPlan;
  items: Record<string, MediaItem>;
  templateCss: string;
  fontCss: string;
  assets: {
    media(item: MediaItem): string;
    music(src: string): string;
  };
  /** The live preview plays the music itself, so it leaves the audio tags out. */
  omitAudio?: boolean;
}

export interface Composition {
  width: number;
  height: number;
  css: string;
  /** The root composition element, without the page around it. */
  root: string;
}

export interface MusicSegment {
  at: number;
  from: number;
  length: number;
}

const sizes: Record<Aspect, { width: number; height: number; unit: number }> = {
  "9:16": { width: 1080, height: 1920, unit: 1 },
  "1:1": { width: 1080, height: 1080, unit: 0.86 },
  "16:9": { width: 1920, height: 1080, unit: 0.86 },
};

const round = (value: number, places = 3) => Number(value.toFixed(places));

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function gradeFilter(grade: EditPlan["grade"]): string {
  const parts: string[] = [];
  if (grade.contrast !== 0) parts.push(`contrast(${round(1 + grade.contrast)})`);
  if (grade.sat !== 0) parts.push(`saturate(${round(1 + grade.sat)})`);
  if (grade.temp > 0) parts.push(`sepia(${round(grade.temp * 0.6)})`);
  if (grade.temp < 0) parts.push(`hue-rotate(${round(grade.temp * 20)}deg)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

function transformFor(framing: EditPlan["shots"][number]["motion"]["from"]): string {
  const x = round((0.5 - framing.x) * framing.scale * 100);
  const y = round((0.5 - framing.y) * framing.scale * 100);
  return `translate(${x}%,${y}%) scale(${framing.scale})`;
}

/** Splits the music so a track shorter than the reel loops instead of going silent. */
export function musicSegments(plan: EditPlan): MusicSegment[] {
  const segments: MusicSegment[] = [];
  let at = 0;
  let from = plan.music.start;
  while (at < plan.duration - 1e-6) {
    const length = round(Math.min(plan.duration - at, plan.music.length - from));
    segments.push({ at: round(at), from: round(from), length });
    at += length;
    from = 0;
  }
  return segments;
}

function shotCss(plan: EditPlan): string {
  return plan.shots
    .map((shot, index) => {
      const id = `s${index}`;
      const length = round(shot.end - shot.start);
      return [
        `#${id}{animation:${id} ${length}s linear both;z-index:${index + 1}}`,
        `@keyframes ${id}{from{transform:${transformFor(shot.motion.from)}}`,
        `to{transform:${transformFor(shot.motion.to)}}}`,
      ].join("");
    })
    .join("\n");
}

function shotHtml(input: ComposeInput): string {
  return input.plan.shots
    .map((shot, index) => {
      const item = input.items[shot.media];
      if (!item)
        throw new Error(`The plan uses media "${shot.media}", which isn't in this project.`);
      const src = escapeHtml(input.assets.media(item));
      const timing = `data-start="${shot.start}" data-duration="${round(shot.end - shot.start)}"`;
      if (item.kind === "photo") {
        return `<img id="s${index}" class="clip shot" src="${src}" ${timing} data-track-index="1" alt=""/>`;
      }
      return `<video id="s${index}" class="clip shot" src="${src}" ${timing} data-media-start="${shot.in}" data-track-index="1" muted playsinline></video>`;
    })
    .join("\n");
}

function textHtml(plan: EditPlan): string {
  return plan.texts
    .map((text, index) => {
      const timing = `data-start="${text.start}" data-duration="${round(text.end - text.start)}"`;
      return `<div id="t${index}" class="clip text text-${text.style}" ${timing} data-track-index="2"><span>${escapeHtml(text.text)}</span></div>`;
    })
    .join("\n");
}

function fadeHtml(plan: EditPlan): string {
  return plan.transitions
    .filter((transition) => transition.type === "fade")
    .map(
      (fade) =>
        `<div id="fade" class="clip" data-start="${fade.at}" data-duration="${fade.duration}" data-track-index="3"></div>`,
    )
    .join("\n");
}

function musicHtml(input: ComposeInput): string {
  const { plan } = input;
  const fadeOut = plan.transitions.find((transition) => transition.type === "fade")?.duration ?? 0;
  const segments = musicSegments(plan);
  return segments
    .map((segment, index) => {
      const fade =
        index === segments.length - 1 && fadeOut > 0 ? ` data-fade-out="${fadeOut}"` : "";
      return `<audio id="music${index}" src="${escapeHtml(input.assets.music(plan.music.src))}" data-start="${segment.at}" data-duration="${segment.length}" data-media-start="${segment.from}" data-volume="1"${fade} data-timeline-role="music" data-track-index="4"></audio>`;
    })
    .join("\n");
}

export function composeParts(input: ComposeInput): Composition {
  const { plan } = input;
  const { width, height, unit } = sizes[plan.aspect];
  const fade = plan.transitions.find((transition) => transition.type === "fade");
  const css = [
    input.fontCss,
    "*{margin:0;padding:0;box-sizing:border-box}",
    `#root{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#000;--unit:${unit}px}`,
    `.shot{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;filter:${gradeFilter(plan.grade)}}`,
    ".text{position:absolute;z-index:100;animation:ucut-text .42s cubic-bezier(.2,.8,.2,1) both}",
    "@keyframes ucut-text{from{opacity:0;transform:translateY(calc(26*var(--unit)))}to{opacity:1;transform:none}}",
    fade
      ? `#fade{position:absolute;inset:0;background:#000;z-index:200;animation:ucut-fade ${fade.duration}s linear both}`
      : "",
    "@keyframes ucut-fade{from{opacity:0}to{opacity:1}}",
    input.templateCss,
    shotCss(plan),
  ]
    .filter(Boolean)
    .join("\n");

  const children = [
    shotHtml(input),
    textHtml(plan),
    fadeHtml(plan),
    input.omitAudio ? "" : musicHtml(input),
  ]
    .filter(Boolean)
    .join("\n");
  const root = `<div id="root" class="vibe-${plan.vibe}" data-composition-id="main" data-start="0" data-duration="${plan.duration}" data-fps="${plan.fps}" data-width="${width}" data-height="${height}" data-no-timeline>\n${children}\n</div>`;
  return { width, height, css, root };
}

/** A whole page, as HyperFrames renders it. */
export function composeHtml(input: ComposeInput): string {
  const { width, height, css, root } = composeParts(input);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=${width}, height=${height}"/>
<style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#000}
${css}
</style>
</head>
<body>
${root}
</body>
</html>
`;
}
