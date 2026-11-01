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
    voice?(src: string): string;
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

/** Black or white, whichever reads better on a brand colour. */
function inkOn(colour: string): string {
  const channel = (start: number) => Number.parseInt(colour.slice(start, start + 2), 16);
  return channel(1) * 0.299 + channel(3) * 0.587 + channel(5) * 0.114 > 150 ? "#000" : "#fff";
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

/** A screen recording pushes in quickly, holds while the action plays, then pulls back. */
function cameraKeyframes(shot: EditPlan["shots"][number], length: number): string {
  const from = transformFor(shot.motion.from);
  const to = transformFor(shot.motion.to);
  if (shot.fit !== "contain") return `from{transform:${from}}to{transform:${to}}`;
  const arrive = round(Math.min(0.35, 0.6 / length) * 100);
  const leave = round(100 - Math.min(0.25, 0.5 / length) * 100);
  const ease = "animation-timing-function:cubic-bezier(.3,0,.1,1)";
  return `0%{transform:${from};${ease}}${arrive}%{transform:${to}}${leave}%{transform:${to};${ease}}100%{transform:${from}}`;
}

function shotCss(plan: EditPlan): string {
  return plan.shots
    .map((shot, index) => {
      const id = `s${index}`;
      const length = round(shot.end - shot.start);
      return [
        `#${id}{animation:${id} ${length}s linear both;z-index:${index + 1};object-position:${round(shot.focus.x * 100)}% ${round(shot.focus.y * 100)}%${shot.fit === "contain" ? ";object-fit:contain" : ""}}`,
        `@keyframes ${id}{${cameraKeyframes(shot, length)}}`,
      ].join("");
    })
    .join("\n");
}

/** Sets a matched reel's words the way the reel did, inside the title-safe area. */
function textStyleCss(plan: EditPlan): string {
  const style = plan.textStyle;
  if (!style) return "";
  const top = { top: 12, upper: 28, center: 46, lower: 58, bottom: 66 }[style.position];
  const transform = {
    upper: "uppercase",
    lower: "lowercase",
    title: "capitalize",
    sentence: "none",
  }[style.case];
  const size = Math.max(44, Math.min(150, style.sizePx));
  return `.text-title{top:${top}%;bottom:auto;left:10%;right:10%;margin:0;text-align:center;font-size:calc(${size}*var(--unit));text-transform:${transform}}`;
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
      const sound = shot.keepAudio ? 'data-has-audio="true" data-volume="1"' : "muted";
      return `<video id="s${index}" class="clip shot" src="${src}" ${timing} data-media-start="${shot.in}" data-track-index="1" ${sound} playsinline></video>`;
    })
    .join("\n");
}

/** Words land one at a time, each given a share of the line that matches how long it is. */
function kineticWords(text: EditPlan["texts"][number], index: number): string {
  const words = text.text.split(/\s+/).filter(Boolean);
  const spoken = (text.end - text.start) * 0.86;
  const letters = words.reduce((sum, word) => sum + word.length + 1, 0);
  let at = text.start;
  return words
    .map((word, place) => {
      const start = round(at);
      at += (spoken * (word.length + 1)) / letters;
      return `<span id="t${index}w${place}" class="clip word" data-start="${start}" data-duration="${round(text.end - start)}" data-track-index="2">${escapeHtml(word)}</span>`;
    })
    .join(" ");
}

function textHtml(plan: EditPlan): string {
  return plan.texts
    .map((text, index) => {
      const timing = `data-start="${text.start}" data-duration="${round(text.end - text.start)}"`;
      if (text.style === "kinetic") {
        return `<div id="t${index}" class="clip text text-kinetic" ${timing} data-track-index="2"><p>${kineticWords(text, index)}</p></div>`;
      }
      return `<div id="t${index}" class="clip text text-${text.style}" ${timing} data-track-index="2"><span>${escapeHtml(text.text)}</span></div>`;
    })
    .join("\n");
}

function backdropHtml(plan: EditPlan): string {
  return (plan.backdrops ?? [])
    .map((backdrop, index) => {
      const length = round(backdrop.end - backdrop.start);
      return `<div id="b${index}" class="clip backdrop" data-start="${backdrop.start}" data-duration="${length}" data-track-index="1" style="--edge:${backdrop.edge};--glow:${backdrop.glow};animation-duration:${length}s"></div>`;
    })
    .join("\n");
}

function voiceHtml(input: ComposeInput): string {
  const voiceUrl = input.assets.voice;
  if (!voiceUrl) return "";
  return (input.plan.voice ?? [])
    .map(
      (line, index) =>
        `<audio id="voice${index}" src="${escapeHtml(voiceUrl(line.src))}" data-start="${line.at}" data-duration="${line.length}" data-media-start="0" data-volume="${line.vol}" data-timeline-role="voice" data-track-index="6"></audio>`,
    )
    .join("\n");
}

function cardHtml(input: ComposeInput): string {
  return (input.plan.cards ?? [])
    .map((card, index) => {
      const timing = `data-start="${card.start}" data-duration="${round(card.end - card.start)}"`;
      const item = card.logo ? input.items[card.logo] : undefined;
      const logo = item ? `<img src="${escapeHtml(input.assets.media(item))}" alt=""/>` : "";
      return `<div id="c${index}" class="clip card" ${timing} data-track-index="5" style="background:${card.colour};color:${inkOn(card.colour)}">${logo}<span>${escapeHtml(card.title)}</span></div>`;
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
      return `<audio id="music${index}" src="${escapeHtml(input.assets.music(plan.music.src))}" data-start="${segment.at}" data-duration="${segment.length}" data-media-start="${segment.from}" data-volume="${plan.music.volume ?? 1}"${fade} data-timeline-role="music" data-track-index="4"></audio>`;
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
    ".card{position:absolute;inset:0;z-index:150;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(36*var(--unit));padding:0 8%;text-align:center}",
    ".backdrop{position:absolute;inset:-12%;background:radial-gradient(circle at 50% 42%,var(--glow) 0%,var(--edge) 68%);animation:ucut-drift linear both}",
    "@keyframes ucut-drift{from{transform:scale(1)}to{transform:scale(1.14) rotate(3deg)}}",
    ".word{display:inline-block;animation:ucut-word .24s cubic-bezier(.2,1.3,.4,1) both}",
    "@keyframes ucut-word{from{opacity:0;transform:translateY(.32em) scale(.94)}to{opacity:1;transform:none}}",
    ".card span{animation:ucut-text .5s cubic-bezier(.2,.8,.2,1) both}",
    ".card img{max-width:44%;max-height:26%;object-fit:contain}",
    fade
      ? `#fade{position:absolute;inset:0;background:#000;z-index:200;animation:ucut-fade ${fade.duration}s linear both}`
      : "",
    "@keyframes ucut-fade{from{opacity:0}to{opacity:1}}",
    input.templateCss,
    textStyleCss(plan),
    shotCss(plan),
  ]
    .filter(Boolean)
    .join("\n");

  const children = [
    backdropHtml(plan),
    shotHtml(input),
    textHtml(plan),
    cardHtml(input),
    fadeHtml(plan),
    input.omitAudio ? "" : musicHtml(input),
    input.omitAudio ? "" : voiceHtml(input),
  ]
    .filter(Boolean)
    .join("\n");
  const root = `<div id="root" class="vibe-${plan.vibe} aspect-${plan.aspect.replace(":", "x")}" data-composition-id="main" data-start="0" data-duration="${plan.duration}" data-fps="${plan.fps}" data-width="${width}" data-height="${height}" data-no-timeline>\n${children}\n</div>`;
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
