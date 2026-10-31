// Paints the sample photos in library/samples, so anyone can try U-Cut before adding their own.
// Run with: pnpm exec tsx scripts/make-samples.ts. They're generated here, so they're CC0.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const width = 1080;
const height = 1440;
type Rgb = [number, number, number];

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * ux;
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * ux;
  return top + (bottom - top) * uy;
}

function fractal(x: number, y: number, octaves = 5): number {
  let value = 0;
  let amplitude = 0.5;
  let scale = 1;
  for (let i = 0; i < octaves; i += 1) {
    value += noise(x * scale, y * scale) * amplitude;
    amplitude *= 0.5;
    scale *= 2.03;
  }
  return value;
}

interface Ridge {
  base: number;
  height: number;
  scale: number;
  color: Rgb;
  seed: number;
  rough?: number;
}

interface Scene {
  name: string;
  sky: Rgb[];
  sun?: { x: number; y: number; r: number; color: Rgb; glow: number };
  ridges: Ridge[];
  water?: { level: number; tint: Rgb };
  stars?: boolean;
  clouds?: Rgb;
  city?: boolean;
  bokeh?: boolean;
}

function skyColor(scene: Scene, v: number): Rgb {
  const stops = scene.sky;
  const position = clamp(v) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(position));
  return mix(stops[index] as Rgb, stops[index + 1] as Rgb, position - index);
}

function ridgeHeight(ridge: Ridge, u: number): number {
  const rough = ridge.rough ?? 5;
  return (
    ridge.base - (fractal(u * ridge.scale + ridge.seed, ridge.seed, rough) - 0.45) * ridge.height
  );
}

function cityAt(u: number, v: number): Rgb | undefined {
  const column = Math.floor(u * 15);
  const top = 0.42 + hash(column, 3) * 0.3;
  if (v < top) return undefined;
  const windowX = (u * 15 - column) * 9;
  const windowY = (v - top) * 110;
  const lit = hash(Math.floor(windowX) + column * 13, Math.floor(windowY)) > 0.62;
  const inset = windowX % 1 > 0.25 && windowX % 1 < 0.8 && windowY % 1 > 0.3;
  const warm = hash(column, Math.floor(windowY)) > 0.5 ? hex("#ffd27a") : hex("#a9c8ff");
  return lit && inset ? warm : mix(hex("#0a0d1e"), hex("#141231"), hash(column, 9));
}

function shade(scene: Scene, u: number, v: number): Rgb {
  let color = skyColor(scene, v);

  if (scene.stars && hash(Math.floor(u * 900), Math.floor(v * 1200)) > 0.9985) {
    color = mix(color, [255, 255, 255], 0.5 + 0.5 * (1 - v));
  }
  if (scene.sun) {
    const { x, y, r, color: sunColor, glow } = scene.sun;
    const distance = Math.hypot((u - x) * (width / height), v - y);
    color = mix(color, sunColor, Math.exp(-distance / glow) * 0.75);
    color = mix(color, sunColor, smooth(r + 0.004, r - 0.004, distance));
  }
  if (scene.clouds) {
    const cover = smooth(0.5, 0.74, fractal(u * 3, v * 9 + 4));
    color = mix(color, scene.clouds, cover * 0.7 * (1 - v));
  }
  if (scene.bokeh) {
    for (let i = 0; i < 46; i += 1) {
      const cx = hash(i, 1);
      const cy = 0.15 + hash(i, 2) * 0.75;
      const r = 0.018 + hash(i, 3) * 0.06;
      const distance = Math.hypot((u - cx) * (width / height), v - cy);
      const tone = mix(hex("#ff5e7e"), mix(hex("#ffc266"), hex("#7c9dff"), hash(i, 5)), hash(i, 4));
      color = mix(color, tone, smooth(r, r - 0.006, distance) * (0.2 + hash(i, 6) * 0.35));
    }
  }
  if (scene.city) {
    const building = cityAt(u, v);
    if (building) color = building;
  }

  for (const ridge of scene.ridges) {
    const top = ridgeHeight(ridge, u);
    if (v > top) {
      const depth = clamp((v - top) * 6);
      const detail = fractal(u * 40 + ridge.seed, v * 40, 3) * 0.12;
      color = mix(ridge.color, skyColor(scene, top), 0.1 + detail - depth * 0.1);
    }
  }

  if (scene.water && v > scene.water.level) {
    const level = scene.water.level;
    const mirror = level - (v - level) * 0.9;
    const ripple = (fractal(u * 6, v * 90, 3) - 0.5) * 0.05 * (v - level + 0.05) * 6;
    const { water: _water, ...above } = scene;
    color = mix(shade(above, clamp(u + ripple), mirror), scene.water.tint, 0.28 + (v - level));
  }
  return color;
}

const scenes: Scene[] = [
  {
    name: "sunset-ridge",
    sky: [hex("#2a1a5e"), hex("#a43e7c"), hex("#ff7a4d"), hex("#ffd27a")],
    sun: { x: 0.62, y: 0.6, r: 0.05, color: hex("#fff0c2"), glow: 0.22 },
    ridges: [
      { base: 0.68, height: 0.34, scale: 3, color: hex("#5b2a6e"), seed: 3 },
      { base: 0.78, height: 0.36, scale: 4, color: hex("#3a1a52"), seed: 9 },
      { base: 0.9, height: 0.34, scale: 5, color: hex("#1c0d2e"), seed: 14 },
    ],
  },
  {
    name: "blue-hour-lake",
    sky: [hex("#0c1845"), hex("#28408f"), hex("#a58fd6"), hex("#ffc6a8")],
    ridges: [
      { base: 0.56, height: 0.3, scale: 3.4, color: hex("#26265c"), seed: 21 },
      { base: 0.6, height: 0.22, scale: 5, color: hex("#13163c"), seed: 26 },
    ],
    water: { level: 0.6, tint: hex("#0f1d4e") },
    stars: true,
  },
  {
    name: "night-city",
    sky: [hex("#070a1f"), hex("#1a1646"), hex("#512a7a"), hex("#c2527e")],
    ridges: [],
    city: true,
    stars: true,
    water: { level: 0.8, tint: hex("#0b0b24") },
  },
  {
    name: "desert-dunes",
    sky: [hex("#6ea6d9"), hex("#cfe3ee"), hex("#fbe6c2")],
    sun: { x: 0.26, y: 0.2, r: 0.04, color: hex("#fffbe8"), glow: 0.16 },
    ridges: [
      { base: 0.6, height: 0.2, scale: 1.6, color: hex("#e9a65f"), seed: 31, rough: 2 },
      { base: 0.72, height: 0.26, scale: 1.8, color: hex("#d57f3f"), seed: 37, rough: 2 },
      { base: 0.86, height: 0.3, scale: 1.4, color: hex("#a9552a"), seed: 42, rough: 2 },
    ],
  },
  {
    name: "snow-peaks",
    sky: [hex("#3f73b8"), hex("#9fc6ea"), hex("#e8f2fa")],
    clouds: hex("#ffffff"),
    ridges: [
      { base: 0.56, height: 0.62, scale: 2.4, color: hex("#e9eff7"), seed: 51, rough: 6 },
      { base: 0.76, height: 0.56, scale: 3, color: hex("#b5c7dd"), seed: 56, rough: 6 },
      { base: 0.92, height: 0.3, scale: 6, color: hex("#21354f"), seed: 60 },
    ],
  },
  {
    name: "open-ocean",
    sky: [hex("#2b7fd0"), hex("#7bc1ee"), hex("#dff3fa")],
    sun: { x: 0.7, y: 0.26, r: 0.036, color: hex("#ffffff"), glow: 0.2 },
    clouds: hex("#ffffff"),
    ridges: [],
    water: { level: 0.56, tint: hex("#0c84a8") },
  },
  {
    name: "forest-mist",
    sky: [hex("#b9cdc4"), hex("#dfe7da"), hex("#f2ece0")],
    ridges: [
      { base: 0.42, height: 0.2, scale: 14, color: hex("#8fac9c"), seed: 71, rough: 3 },
      { base: 0.56, height: 0.26, scale: 16, color: hex("#5a8671"), seed: 75, rough: 3 },
      { base: 0.7, height: 0.32, scale: 20, color: hex("#2f5a48"), seed: 79, rough: 3 },
      { base: 0.86, height: 0.36, scale: 24, color: hex("#112c24"), seed: 84, rough: 3 },
    ],
  },
  {
    name: "violet-dusk",
    sky: [hex("#160b3a"), hex("#4a2a9a"), hex("#b77fe0"), hex("#ffd3e8")],
    sun: { x: 0.34, y: 0.3, r: 0.034, color: hex("#f7f1ff"), glow: 0.1 },
    stars: true,
    ridges: [
      { base: 0.74, height: 0.2, scale: 2.2, color: hex("#3a1f73"), seed: 91, rough: 3 },
      { base: 0.86, height: 0.2, scale: 2.8, color: hex("#1b0e3f"), seed: 95, rough: 3 },
    ],
  },
  {
    name: "golden-fields",
    sky: [hex("#7fb2e0"), hex("#fbe0a8"), hex("#ffcf7e")],
    sun: { x: 0.8, y: 0.5, r: 0.05, color: hex("#fff3cc"), glow: 0.26 },
    ridges: [
      { base: 0.62, height: 0.1, scale: 2, color: hex("#c79a3c"), seed: 101, rough: 3 },
      { base: 0.72, height: 0.12, scale: 2.4, color: hex("#ad7f26"), seed: 104, rough: 3 },
      { base: 0.86, height: 0.14, scale: 3, color: hex("#6e4c17"), seed: 108, rough: 3 },
    ],
  },
  {
    name: "rainy-lights",
    sky: [hex("#0c0a1c"), hex("#1a1231"), hex("#2a1740")],
    bokeh: true,
    ridges: [],
  },
];

const root = new URL("../library/samples/", import.meta.url).pathname;
const entries = scenes.map((scene, index) => {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = shade(scene, x / width, y / height);
      const grain = (hash(x + index * 7, y) - 0.5) * 7;
      const offset = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = clamp((color[channel] ?? 0) + grain, 0, 255);
      }
    }
  }
  const file = `${scene.name}.jpg`;
  execFileSync(
    "ffmpeg",
    // biome-ignore format: flags read better in pairs
    ["-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`,
      "-i", "pipe:0", "-frames:v", "1", "-update", "1", "-q:v", "5", `${root}${file}`],
    { input: pixels, maxBuffer: 2 ** 30 },
  );
  return { file, licence: "CC0-1.0", source: "scripts/make-samples.ts" };
});
writeFileSync(`${root}assets.json`, `${JSON.stringify(entries, null, 2)}\n`);
