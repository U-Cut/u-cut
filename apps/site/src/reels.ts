import { type Composition, composeParts } from "@u-cut/compose";
import {
  matchTrack,
  matchVibe,
  planDemo,
  planRules,
  planScript,
  readPrompt,
  recipeFrom,
  spreadWords,
  writeScript,
} from "@u-cut/planner-rules";
import type {
  Aspect,
  BeatGrid,
  EditPlan,
  MediaItem,
  Moment,
  TemplateManifest,
  Vibe,
} from "@u-cut/schema";
import tracks from "../../../library/music/assets.json";
import demoCss from "../../../templates/demo/style.css?raw";
import demoManifest from "../../../templates/demo/template.json";
import explainerCss from "../../../templates/explainer/style.css?raw";
import explainerManifest from "../../../templates/explainer/template.json";
import recipeCss from "../../../templates/recipe/style.css?raw";
import recipeManifest from "../../../templates/recipe/template.json";
import travelCss from "../../../templates/travel-montage/style.css?raw";
import travelManifest from "../../../templates/travel-montage/template.json";

export type Way = "sentence" | "photos" | "reference" | "recording";

export interface Request {
  way: Way;
  prompt: string;
  /** A vibe someone picked, which wins over one they typed. */
  vibe: Vibe | null;
  seed: number;
}

export interface Cut {
  plan: EditPlan;
  composition: Composition;
  /** What to tell people about this cut. */
  note: string;
}

export const firstPrompt = "A 20-second reel about my Goa trip, chill vibe";

const templates: Record<string, { manifest: TemplateManifest; css: string }> = {
  demo: { manifest: demoManifest as TemplateManifest, css: demoCss },
  explainer: { manifest: explainerManifest as TemplateManifest, css: explainerCss },
  recipe: { manifest: recipeManifest as TemplateManifest, css: recipeCss },
  "travel-montage": { manifest: travelManifest as TemplateManifest, css: travelCss },
};

/** The same free art the app ships with, already sorted into scenes. */
const scenes: Record<string, string> = {
  "open-ocean": "beach",
  "sunset-ridge": "mountains",
  "night-city": "night-city",
  "forest-mist": "forest",
  "rainy-lights": "city-street",
  "desert-dunes": "desert",
  "blue-hour-lake": "lake",
  "snow-peaks": "snow",
  "violet-dusk": "sky",
  "golden-fields": "sky",
};

const photo = (id: string, w: number, h: number, scene: string | null): MediaItem => ({
  id,
  path: id,
  kind: "photo",
  w,
  h,
  orientation: 1,
  quality: { sharpness: null, exposure: null, faces: null, dupGroup: null, score: 0.7 },
  focus: null,
  labels: scene ? [{ id: scene, score: 0.9 }] : [],
  moment: null,
});

const samples = Object.entries(scenes).map(([id, scene]) => photo(id, 1080, 1440, scene));
const screen = photo("studio-screen", 1400, 875, null);
const library = Object.fromEntries([...samples, screen].map((item) => [item.id, item]));

const withBeats = (track: (typeof tracks)[number]) => {
  const interval = 60 / track.bpm;
  const count = Math.floor(track.length / interval);
  const beats: BeatGrid = {
    bpm: track.bpm,
    source: "detected",
    times: Array.from({ length: count }, (_, index) => Number((index * interval).toFixed(4))),
  };
  return { ...track, vibe: track.vibe as Vibe, beats };
};

const catalog = tracks.map(withBeats);

function trackFor(vibe: Vibe) {
  const track = catalog.find((entry) => entry.vibe === vibe) ?? catalog[0];
  if (!track) throw new Error("U-Cut's music didn't load.");
  return track;
}

/** The measurements of a fast reel, cut every half second on a 128 BPM beat. */
const fastReel = recipeFrom({
  width: 1080,
  height: 1920,
  duration: 12,
  cuts: Array.from({ length: 23 }, (_, index) => (index + 1) * 0.5),
  beats: Array.from({ length: 25 }, (_, index) => Number((index * 0.46875).toFixed(4))),
  bpm: 128,
  look: { luma: 96, contrast: 58, saturation: 42, warmth: 12 },
  text: [],
});

function written(request: Request): EditPlan {
  const asked = readPrompt(request.prompt);
  const vibe = request.vibe ?? asked.vibe ?? "chill";
  const duration = asked.duration ?? 20;
  const aspect: Aspect = asked.aspect ?? "9:16";
  const { seed } = request;
  const found = [...new Set(samples.map((item) => item.labels[0]?.id ?? ""))];
  const lines = writeScript({ request: asked, scenes: found, vibe, duration, seed });
  const track = trackFor(vibe);
  return planScript({
    lines,
    items: samples,
    excludedScenes: [],
    vibe,
    aspect,
    seed,
    target: duration,
    music: { src: track.file, length: track.length, bpm: track.bpm },
  });
}

function photos(request: Request): EditPlan {
  const vibe = request.vibe ?? "cinematic";
  const track = trackFor(vibe);
  return planRules({
    items: samples,
    template: (templates["travel-montage"] as { manifest: TemplateManifest }).manifest,
    vibe,
    aspect: "9:16",
    duration: 14,
    music: { src: track.file, length: track.length, beats: track.beats },
    copy: { title: "A week away" },
    excludedScenes: [],
    recipe: null,
    seed: request.seed,
  });
}

function matched(request: Request): EditPlan {
  const track = matchTrack(fastReel, catalog);
  if (!track) throw new Error("U-Cut's music didn't load.");
  return planRules({
    items: samples,
    template: (templates.recipe as { manifest: TemplateManifest }).manifest,
    vibe: matchVibe(fastReel),
    aspect: "9:16",
    duration: 12,
    music: { src: track.file, length: track.length, beats: track.beats },
    copy: { title: "" },
    excludedScenes: [],
    recipe: fastReel,
    seed: request.seed,
  });
}

/** A still of U-Cut itself, moved the way a demo moves. The app does this on real recordings. */
function recording(): EditPlan {
  const said = [
    { quote: "Pick a vibe for your reel.", focus: { x: 0.11, y: 0.5 }, zoom: 1.9 },
    { quote: "Swap any shot along the bottom.", focus: { x: 0.5, y: 0.93 }, zoom: 1.7 },
    { quote: "Then export when it feels right.", focus: { x: 0.92, y: 0.08 }, zoom: 2 },
  ];
  const opening = "Here's how a reel comes together.";
  const quotes = [opening, ...said.map((line) => line.quote)];
  const moments: Moment[] = [
    { in: 0, out: 2.4, quote: opening, why: "You introduce it", focus: null, zoom: 1 },
    ...said.map((line, index) => ({
      in: 2.4 + index * 2.4,
      out: 4.8 + index * 2.4,
      why: "Something happens on screen as you explain it",
      ...line,
    })),
  ];
  return planDemo({
    source: { id: screen.id, w: screen.w, h: screen.h, sound: false },
    words: quotes.flatMap((quote, index) =>
      spreadWords(quote, index * 2.4 + 0.2, index * 2.4 + 2.2),
    ),
    moments,
    brand: { name: "U-Cut", colour: "#7b5cff" },
    aspect: "16:9",
    music: (() => {
      const track = trackFor("chill");
      return { src: track.file, length: track.length, bpm: track.bpm };
    })(),
  });
}

function compose(plan: EditPlan): Composition {
  return composeParts({
    plan,
    items: library,
    templateCss: templates[plan.template]?.css ?? "",
    fontCss: "",
    omitAudio: true,
    assets: { media: (item) => `/media/samples/${item.id}.jpg`, music: () => "" },
  });
}

const notes: Record<Way, (plan: EditPlan) => string> = {
  sentence: (plan) => `${plan.texts.length} lines, ${Math.round(plan.duration)} seconds`,
  photos: (plan) => `${plan.shots.length} shots, cut on the beat`,
  reference: () => fastReel.notes || "Fast, about 0.5 s a shot, cutting on the beat",
  recording: () => "Title card, push-ins and captions",
};

const planners: Record<Way, (request: Request) => EditPlan> = {
  sentence: written,
  photos,
  reference: matched,
  recording,
};

/** Runs the same planner and composer as the app. Nothing here talks to a server. */
export function cut(request: Request): Cut {
  const plan = planners[request.way](request);
  return { plan, composition: compose(plan), note: notes[request.way](plan) };
}
