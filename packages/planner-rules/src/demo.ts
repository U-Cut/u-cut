import type { Aspect, Brand, DemoWord, EditPlan, Moment } from "@u-cut/schema";
import { PlanError } from "./plan.ts";

/** A moment the screen changed, and which cells of a grid over the frame it changed in. */
export interface ScreenWindow {
  start: number;
  end: number;
  what: string[];
}

export interface DemoInput {
  duration: number;
  words: DemoWord[];
  windows: ScreenWindow[];
  grid: { cols: number; rows: number };
}

const breath = 0.25;
const sentencePause = 0.7;
const longestMoment = 8;
const activityGap = 1.2;
const activityPadding = 1;
const cardLength = 1.6;
const fps = 30;
const wordsPerLine = 5;
const fadeOut = 0.4;
const pushLead = 0.4;
const shortestPush = 1.4;
const smallestZoom = 1.6;
const largestZoom = 2;

const round = (value: number) => Math.round(value * 1000) / 1000;
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/** Spoken text, grouped into sentences by punctuation, long pauses and a length limit. */
function sentencesOf(words: DemoWord[]): DemoWord[][] {
  const sentences: DemoWord[][] = [];
  let current: DemoWord[] = [];
  for (const [index, word] of words.entries()) {
    current.push(word);
    const next = words[index + 1];
    const ends = /[.!?]["')]*$/.test(word.text);
    const paused = next ? next.start - word.end > sentencePause : true;
    const tooLong = word.end - (current[0]?.start ?? word.start) >= longestMoment - 1;
    if (ends || paused || tooLong) {
      sentences.push(current);
      current = [];
    }
  }
  return sentences;
}

function cellsIn(what: string): [number, number][] {
  return [...what.matchAll(/r(\d+)c(\d+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
}

/** Picks the clearest change in a stretch of the recording, and where and when it happened. */
function aimAt(windows: ScreenWindow[], grid: DemoInput["grid"]) {
  const wholeScreen = grid.cols * grid.rows;
  const changes = windows.flatMap((window) => {
    // A cut replaces everything, so it can't say where to look.
    if (window.what.some((line) => line.startsWith("cut"))) return [];
    const seen = new Map(window.what.flatMap(cellsIn).map((cell) => [cell.join(), cell]));
    const cells = [...seen.values()];
    return cells.length > 0 && cells.length <= wholeScreen / 2 ? [{ window, cells }] : [];
  });
  const [best] = changes.sort(
    (a, b) => b.cells.length - a.cells.length || a.window.start - b.window.start,
  );
  if (!best) return { focus: null, zoom: 1 };
  const { cells, window } = best;
  const middle = (values: number[], size: number) =>
    round((values.reduce((sum, value) => sum + value, 0) / values.length + 0.5) / size);
  const share = cells.length / wholeScreen;
  return {
    focus: {
      x: middle(
        cells.map((cell) => cell[1]),
        grid.cols,
      ),
      y: middle(
        cells.map((cell) => cell[0]),
        grid.rows,
      ),
    },
    zoom: round(largestZoom - (largestZoom - smallestZoom) * Math.min(1, share * 2)),
    at: round(window.start),
  };
}

function overlapping(windows: ScreenWindow[], from: number, to: number) {
  return windows.filter((window) => window.end > from && window.start < to);
}

function spokenMoments(input: DemoInput): Moment[] {
  const sentences = sentencesOf(input.words);
  return sentences.map((sentence, index) => {
    const start = sentence[0]?.start ?? 0;
    const end = sentence.at(-1)?.end ?? start;
    const previousEnd = sentences[index - 1]?.at(-1)?.end;
    const nextStart = sentences[index + 1]?.[0]?.start;
    const aim = aimAt(overlapping(input.windows, start, end), input.grid);
    const why =
      aim.focus !== null
        ? "Something happens on screen as you explain it"
        : index === 0
          ? "You introduce it"
          : "You talk through this";
    return {
      // Sentences close together share the gap, so no words are heard twice.
      in: round(
        Math.max(previousEnd === undefined ? 0 : (previousEnd + start) / 2, start - breath),
      ),
      out: round(
        Math.min(nextStart === undefined ? input.duration : (end + nextStart) / 2, end + breath),
      ),
      quote: sentence.map((word) => word.text).join(" "),
      why,
      ...aim,
    };
  });
}

function silentMoments(input: DemoInput): Moment[] {
  const bursts: ScreenWindow[][] = [];
  for (const window of [...input.windows].sort((a, b) => a.start - b.start)) {
    const burst = bursts.at(-1);
    const last = burst?.at(-1);
    if (burst && last && window.start - last.end <= activityGap) burst.push(window);
    else bursts.push([window]);
  }
  if (bursts.length === 0) {
    return [
      {
        in: 0,
        out: round(input.duration),
        quote: "",
        why: "The whole recording",
        focus: null,
        zoom: 1,
      },
    ];
  }
  return bursts.map((burst) => ({
    in: round(Math.max(0, (burst[0]?.start ?? 0) - activityPadding)),
    out: round(Math.min(input.duration, (burst.at(-1)?.end ?? 0) + activityPadding)),
    quote: "",
    why: "Something changes on screen",
    ...aimAt(burst, input.grid),
  }));
}

/** Finds the parts of a recording worth keeping: what's said, or else what happens. */
export function findMoments(input: DemoInput): Moment[] {
  return input.words.length > 0 ? spokenMoments(input) : silentMoments(input);
}

/** Spreads corrected words evenly across the time the original words took. */
export function spreadWords(text: string, start: number, end: number): DemoWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const length = (end - start) / Math.max(1, words.length);
  return words.map((word, index) => ({
    text: word,
    start: round(start + index * length),
    end: round(start + (index + 1) * length),
  }));
}

export function captionLines(words: DemoWord[], perLine = wordsPerLine) {
  const lines: { text: string; start: number; end: number }[] = [];
  let current: DemoWord[] = [];
  const flush = () => {
    const first = current[0];
    const last = current.at(-1);
    if (first && last) {
      lines.push({
        text: current.map((word) => word.text).join(" "),
        start: first.start,
        end: last.end,
      });
    }
    current = [];
  };
  for (const word of words) {
    current.push(word);
    if (current.length >= perLine || /[.!?]["')]*$/.test(word.text)) flush();
  }
  flush();
  return lines;
}

/** How much of a frame's height a screen fills once it's fitted inside. */
function screenShare(source: { w: number; h: number }, aspect: Aspect) {
  const frame = { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 }[aspect];
  const screen = source.w / source.h;
  return screen > frame ? { x: 1, y: frame / screen } : { x: screen / frame, y: 1 };
}

export interface DemoPlanInput {
  source: { id: string; w: number; h: number; sound: boolean };
  words: DemoWord[];
  moments: Moment[];
  brand: Brand;
  aspect: Aspect;
  music: { src: string; length: number; bpm: number | null };
  /** Off leaves the words out of the picture. The voice stays. */
  captions?: boolean;
}

/** Builds the demo: a title card, the kept moments with camera moves, and an end card. */
export function planDemo(input: DemoPlanInput): EditPlan {
  const { source, moments, brand, aspect, music, words, captions = true } = input;
  if (moments.length === 0) throw new PlanError("Keep at least one moment to make a demo.");

  const share = screenShare(source, aspect);
  const hasCards = brand.name.trim().length > 0;
  const shots: EditPlan["shots"] = [];
  const texts: EditPlan["texts"] = [];
  let at = hasCards ? cardLength : 0;

  moments.forEach((moment, index) => {
    const length = round(moment.out - moment.in);
    const start = round(at);
    const end = round(at + length);
    const still = { x: 0.5, y: 0.5, scale: 1 };
    // The camera stays wide until just before the action, so the screen is seen first.
    const wait =
      moment.at === undefined
        ? 0
        : round(Math.max(0, Math.min(moment.at - moment.in - pushLead, length - shortestPush)));
    const zooms = moment.focus !== null && moment.zoom > 1 && (index > 0 || wait > 0);
    const margin = (moment.zoom - 1) / (2 * moment.zoom);
    const to =
      zooms && moment.focus
        ? {
            // The screen sits inside the frame, so its focus is moved towards the middle to match.
            x: round(0.5 + clamp((moment.focus.x - 0.5) * share.x, margin)),
            y: round(0.5 + clamp((moment.focus.y - 0.5) * share.y, margin)),
            scale: moment.zoom,
          }
        : still;
    shots.push({
      media: source.id,
      in: moment.in,
      out: moment.out,
      start,
      end,
      motion: {
        type: zooms ? "push-in" : "none",
        from: still,
        to,
        ...(zooms && wait > 0 ? { at: wait } : {}),
      },
      crop: { x: 0, y: 0, w: 1, h: 1 },
      focus: { x: 0.5, y: 0.5 },
      fit: "contain",
      ...(source.sound ? { keepAudio: true } : {}),
    });
    const heard = words.filter((word) => word.start >= moment.in && word.start < moment.out);
    const spoken =
      moment.caption === undefined
        ? heard
        : spreadWords(
            moment.caption,
            heard[0]?.start ?? moment.in,
            heard.at(-1)?.end ?? moment.out,
          );
    for (const line of captions ? captionLines(spoken) : []) {
      const lineStart = round(start + Math.max(0, line.start - moment.in));
      const lineEnd = round(Math.min(end, start + (line.end - moment.in) + 0.1));
      if (lineEnd > lineStart) {
        texts.push({ text: line.text, start: lineStart, end: lineEnd, style: "caption" });
      }
    }
    at = end;
  });

  const endOfShots = round(at);
  const duration = round(endOfShots + (hasCards ? cardLength : 0));
  const logo = brand.logo ? { logo: brand.logo } : {};
  const card = (start: number) => ({
    title: brand.name.trim(),
    start: round(start),
    end: round(start + cardLength),
    colour: brand.colour,
    ...logo,
  });

  return {
    schemaVersion: 1,
    template: "demo",
    vibe: "chill",
    aspect,
    fps,
    seed: 1,
    duration,
    music: {
      src: music.src,
      bpm: music.bpm,
      start: 0,
      length: music.length,
      // A recording with speech keeps the music well under it.
      volume: moments.some((moment) => moment.quote.length > 0) ? 0.12 : 0.7,
    },
    grade: { temp: 0, contrast: 0, sat: 0 },
    shots,
    texts,
    transitions: [{ type: "fade", at: round(duration - fadeOut), duration: fadeOut }],
    sfx: [],
    ...(hasCards ? { cards: [card(0), card(endOfShots)] } : {}),
  };
}
