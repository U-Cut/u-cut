// Writes library/luts: one .cube look per vibe, made from the same colour grade U-Cut puts on that
// vibe's reels, so the look can be carried into DaVinci Resolve, Premiere, Final Cut or FFmpeg.
// Run with: pnpm exec tsx --conditions=source scripts/make-luts.ts
// Everything here is generated from this file, so the looks are dedicated to CC0.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gradeFilter } from "../packages/compose/src/index.ts";
import { vibes } from "../packages/planner-rules/src/vibes.ts";

const folder = fileURLToPath(new URL("../library/luts/", import.meta.url));
const size = 17;
type Rgb = [number, number, number];
type Matrix = [Rgb, Rgb, Rgb];

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const apply = (m: Matrix, [r, g, b]: Rgb): Rgb =>
  m.map((row) => clamp(row[0] * r + row[1] * g + row[2] * b)) as Rgb;

// The matrices CSS uses for each filter, from the Filter Effects specification. Browsers apply
// the filter functions to sRGB values, one after another, clamping in between.
function saturate(s: number): Matrix {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
}

function sepia(amount: number): Matrix {
  const a = 1 - Math.min(1, amount);
  return [
    [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a],
    [0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a],
    [0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a],
  ];
}

function hueRotate(degrees: number): Matrix {
  const c = Math.cos((degrees * Math.PI) / 180);
  const s = Math.sin((degrees * Math.PI) / 180);
  return [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  ];
}

/** Reads the CSS filter U-Cut writes, and runs a colour through it. */
function filterOf(css: string): (colour: Rgb) => Rgb {
  const steps = [...css.matchAll(/([a-z-]+)\(([-\d.]+)(deg)?\)/g)].map(([, name, value]) => {
    const amount = Number(value);
    switch (name) {
      case "contrast":
        return (colour: Rgb) => colour.map((v) => clamp((v - 0.5) * amount + 0.5)) as Rgb;
      case "saturate":
        return (colour: Rgb) => apply(saturate(amount), colour);
      case "sepia":
        return (colour: Rgb) => apply(sepia(amount), colour);
      case "hue-rotate":
        return (colour: Rgb) => apply(hueRotate(amount), colour);
      default:
        throw new Error(`make-luts doesn't know the CSS filter ${name}.`);
    }
  });
  return (colour) => steps.reduce((value, step) => step(value), colour);
}

const entries = Object.entries(vibes).map(([vibe, profile]) => {
  const css = gradeFilter(profile.grade);
  const look = filterOf(css);
  const lines = [
    `TITLE "U-Cut ${vibe}"`,
    `# The ${vibe} vibe's grade, CSS filter: ${css}. CC0, made by scripts/make-luts.ts.`,
    `LUT_3D_SIZE ${size}`,
    "DOMAIN_MIN 0 0 0",
    "DOMAIN_MAX 1 1 1",
  ];
  // .cube lists red fastest, then green, then blue.
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const out = look([r / (size - 1), g / (size - 1), b / (size - 1)]);
        lines.push(out.map((value) => value.toFixed(6)).join(" "));
      }
    }
  }
  const file = `${vibe}.cube`;
  writeFileSync(join(folder, file), `${lines.join("\n")}\n`);
  return { file, licence: "CC0-1.0", source: "scripts/make-luts.ts", vibe, css };
});
writeFileSync(join(folder, "assets.json"), `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Wrote ${entries.length} looks to ${folder}`);
