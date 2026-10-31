import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type BeatGrid, TemplateManifest, type Vibe, validate } from "@u-cut/schema";
import { parse } from "yaml";
import { repoRoot } from "./paths.ts";

export interface Track {
  file: string;
  vibe: Vibe;
  bpm: number;
  length: number;
}

export interface FontFile {
  file: string;
  family: string;
  weight: number;
  style: string;
}

export interface Template {
  manifest: TemplateManifest;
  css: string;
}

const libraryDir = join(repoRoot, "library");
export const musicDir = join(libraryDir, "music");
export const fontsDir = join(libraryDir, "fonts");
export const samplesDir = join(libraryDir, "samples");
const templatesDir = join(repoRoot, "templates");

const readJson = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;

export function loadTracks(): Track[] {
  return readJson<Track[]>(join(musicDir, "assets.json"));
}

export function loadFonts(): FontFile[] {
  return readJson<FontFile[]>(join(fontsDir, "assets.json"));
}

/** Library tracks are generated, so their beats are exact and need no analysis. */
export function trackBeats(track: Track): BeatGrid {
  const interval = 60 / track.bpm;
  const count = Math.floor(track.length / interval);
  return {
    bpm: track.bpm,
    source: "detected",
    times: Array.from({ length: count }, (_, index) => Number((index * interval).toFixed(4))),
  };
}

export function fontCss(url: (file: string) => string): string {
  return loadFonts()
    .map(
      (font) =>
        `@font-face{font-family:"${font.family}";font-weight:${font.weight};font-style:${font.style};src:url("${url(font.file)}") format("woff2")}`,
    )
    .join("\n");
}

export function loadTemplates(): Template[] {
  return readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folder = join(templatesDir, entry.name);
      const label = `templates/${entry.name}/template.json`;
      const result = validate(TemplateManifest, readJson(join(folder, "template.json")), label);
      if (!result.ok) throw new Error(result.errors.join(" "));
      return { manifest: result.value, css: readFileSync(join(folder, "style.css"), "utf8") };
    })
    .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

export interface Scene {
  id: string;
  label: string;
  group: string;
  hiddenByDefault?: boolean;
}

interface Taxonomy {
  groups: Record<string, { id: string; label: string; exclude_by_default?: boolean }[]>;
}

/** Every scene a photo can be sorted into, from classifiers/taxonomy.yaml. */
export function loadScenes(): Scene[] {
  const text = readFileSync(join(repoRoot, "classifiers/taxonomy.yaml"), "utf8");
  const { groups } = parse(text) as Taxonomy;
  return Object.entries(groups).flatMap(([group, scenes]) =>
    scenes.map((scene) => ({
      id: scene.id,
      label: scene.label,
      group,
      ...(scene.exclude_by_default ? { hiddenByDefault: true } : {}),
    })),
  );
}

export function findTemplate(id: string): Template {
  const template = loadTemplates().find((candidate) => candidate.manifest.id === id);
  if (!template) {
    const names = loadTemplates()
      .map((candidate) => candidate.manifest.id)
      .join(", ");
    throw new Error(`There's no template called "${id}". Choose one of: ${names}.`);
  }
  return template;
}
