import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TemplateManifest, validate } from "@u-cut/schema";
import { addedTemplatesDir, loadTemplates, newerVersion, unsafeCss } from "./library.ts";
import { repoRoot } from "./paths.ts";

// The style gallery reads registry/index.json, which CI builds. `ucut templates update` reads the
// newest copy on GitHub and adds styles that are new or newer, checking every file's checksum.
// It's the only part of U-Cut that looks for styles online, and only when someone asks.

export const registryUrl = () =>
  process.env.UCUT_REGISTRY_URL ??
  "https://raw.githubusercontent.com/U-Cut/u-cut/main/registry/index.json";

export interface RegistryTemplate {
  id: string;
  name: string;
  version: string;
  summary: string;
  madeBy: "photos" | "recording" | "words" | "reference";
  preview: string;
  files: Record<string, string>;
}

interface Registry {
  schemaVersion: number;
  templates: RegistryTemplate[];
}

const files = ["template.json", "style.css", "README.md", "preview.gif"];
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** The registry that came with this copy of U-Cut. */
export function bundledRegistry(): Registry | undefined {
  const path = join(repoRoot, "registry/index.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Registry) : undefined;
}

/** A style's one-line description, from its README. */
export function summaryOf(folder: string): string {
  const path = join(folder, "README.md");
  if (!existsSync(path)) return "";
  const paragraphs = readFileSync(path, "utf8")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith("#"));
  return (paragraphs[0] ?? "").replace(/\s+/g, " ");
}

export interface UpdateResult {
  added: string[];
  updated: string[];
  /** Styles that couldn't be used, each with a plain reason. */
  skipped: { id: string; reason: string }[];
}

interface UpdateOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function get(url: string, options: UpdateOptions): Promise<Uint8Array> {
  const response = await (options.fetchImpl ?? fetch)(url, {
    signal: options.signal ?? AbortSignal.timeout(30_000),
  }).catch(() => {
    throw new Error("U-Cut couldn't reach GitHub to look for new styles. Check the connection.");
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${url}.`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Adds styles that are new, or newer than the ones here, from the registry on GitHub. */
export async function updateTemplates(options: UpdateOptions = {}): Promise<UpdateResult> {
  const url = registryUrl();
  const base = url.slice(0, url.lastIndexOf("/registry/") + 1);
  const registry = JSON.parse(new TextDecoder().decode(await get(url, options))) as Registry;
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.templates)) {
    throw new Error("The style list on GitHub is from a newer U-Cut. Update the app first.");
  }
  const installed = new Map(loadTemplates().map((template) => [template.manifest.id, template]));
  const result: UpdateResult = { added: [], updated: [], skipped: [] };
  // Only styles made from photos can arrive this way. The others depend on code in the app.
  for (const entry of registry.templates.filter((template) => template.madeBy === "photos")) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.id)) continue;
    const current = installed.get(entry.id);
    if (current && !newerVersion(entry.version, current.manifest.version)) continue;
    try {
      const downloaded = new Map<string, Uint8Array>();
      for (const file of files) {
        const data = await get(`${base}templates/${entry.id}/${file}`, options);
        if (sha256(data) !== entry.files[file]) {
          throw new Error(`its ${file} didn't match the checksum in the list`);
        }
        downloaded.set(file, data);
      }
      const text = (file: string) => new TextDecoder().decode(downloaded.get(file));
      const manifest = validate(TemplateManifest, JSON.parse(text("template.json")), entry.id);
      if (!manifest.ok || manifest.value.id !== entry.id) {
        throw new Error("it needs a newer version of U-Cut");
      }
      const problem = unsafeCss(text("style.css"));
      if (problem) throw new Error(problem);
      const target = join(addedTemplatesDir(), entry.id);
      const partial = `${target}.partial`;
      await rm(partial, { recursive: true, force: true });
      await mkdir(partial, { recursive: true });
      for (const [file, data] of downloaded) await writeFile(join(partial, file), data);
      // The old copy is moved aside, not deleted, until the new one is in place.
      const old = `${target}.old`;
      await rm(old, { recursive: true, force: true });
      if (existsSync(target)) await rename(target, old);
      await rename(partial, target);
      await rm(old, { recursive: true, force: true });
      (current ? result.updated : result.added).push(entry.name);
    } catch (error) {
      result.skipped.push({ id: entry.id, reason: (error as Error).message });
    }
  }
  return result;
}
