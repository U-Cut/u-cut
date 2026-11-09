import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type BeatGrid, TemplateManifest, type Vibe, validate } from "@u-cut/schema";
import { parse } from "yaml";
import { unsafeCss } from "./css-safety.ts";
import { homeDir, repoRoot } from "./paths.ts";

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
  /** Its folder, where its README and preview live. */
  folder: string;
  /** Added after U-Cut was installed, with `ucut templates update`. */
  added?: boolean;
}

const libraryDir = join(repoRoot, "library");
export const musicDir = join(libraryDir, "music");
export const fontsDir = join(libraryDir, "fonts");
export const sfxDir = join(libraryDir, "sfx");
export const samplesDir = join(libraryDir, "samples");
const templatesDir = join(repoRoot, "templates");
/** Styles added after installing, which take over from a built-in one with an older version. */
export const addedTemplatesDir = () => join(homeDir(), "templates");

/** "1.10.0" is newer than "1.9.2". */
export function newerVersion(a: string, b: string): boolean {
  const [x, y] = [a, b].map((version) => version.split(".").map(Number));
  for (let index = 0; index < 3; index += 1) {
    const difference = (x?.[index] ?? 0) - (y?.[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export { unsafeCss } from "./css-safety.ts";

function readTemplates(folder: string, label: string, added: boolean): Template[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .filter((entry) => !entry.name.endsWith(".partial") && !entry.name.endsWith(".old"))
    .flatMap((entry) => {
      const dir = join(folder, entry.name);
      try {
        const where = `${label}/${entry.name}/template.json`;
        const result = validate(TemplateManifest, readJson(join(dir, "template.json")), where);
        if (!result.ok) throw new Error(result.errors.join(" "));
        const css = readFileSync(join(dir, "style.css"), "utf8");
        const problem = unsafeCss(css);
        if (problem) throw new Error(`${label}/${entry.name}: ${problem}.`);
        return [{ manifest: result.value, css, folder: dir, ...(added ? { added: true } : {}) }];
      } catch (error) {
        // A broken added style is left out, so one bad download never stops the rest. A broken
        // built-in style is a bug in U-Cut, so it stops here.
        if (added) return [];
        throw error;
      }
    });
}

const readJson = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;

export function loadTracks(): Track[] {
  return readJson<Track[]>(join(musicDir, "assets.json"));
}

export interface SoundFile {
  file: string;
  licence: string;
  use: string;
  length: number;
}

/** U-Cut's own sound effects, from library/sfx/assets.json. */
export function loadSounds(): SoundFile[] {
  return readJson<SoundFile[]>(join(sfxDir, "assets.json"));
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
  const byId = new Map<string, Template>();
  for (const template of readTemplates(templatesDir, "templates", false)) {
    byId.set(template.manifest.id, template);
  }
  for (const template of readTemplates(addedTemplatesDir(), "added templates", true)) {
    const builtIn = byId.get(template.manifest.id);
    if (!builtIn || newerVersion(template.manifest.version, builtIn.manifest.version)) {
      byId.set(template.manifest.id, template);
    }
  }
  return [...byId.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
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
