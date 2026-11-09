// Builds registry/index.json: every template with its preview and file checksums, and every asset
// in the library with its licence. The app's style gallery reads it, and `ucut templates update`
// fetches the copy on GitHub to add new styles without a new app.
//
//   pnpm registry          writes registry/index.json
//   pnpm registry --check  fails if it's out of date, which CI does
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
export const registryPath = join(root, "registry/index.json");

/** How each style is made. Most cut photos to music; three are made by their own flows. */
const madeBy: Record<string, "recording" | "words" | "reference"> = {
  demo: "recording",
  explainer: "words",
  recipe: "reference",
};

const templateFiles = ["template.json", "style.css", "README.md", "preview.gif"];

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/** The README's first paragraph after its heading, on one line. */
function summaryOf(readme: string): string {
  const paragraphs = readme
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith("#"));
  return (paragraphs[0] ?? "").replace(/\s+/g, " ");
}

interface Manifest {
  id: string;
  name: string;
  version: string;
  author: string;
  licence: string;
  aspects: string[];
  vibes: string[];
  labels?: string;
}

export function buildRegistry() {
  const templates = readdirSync(join(root, "templates"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((id) => {
      const folder = join(root, "templates", id);
      const manifest = readJson<Manifest>(join(folder, "template.json"));
      const missing = templateFiles.filter((file) => !existsSync(join(folder, file)));
      if (missing.length > 0) {
        throw new Error(`templates/${id} is missing ${missing.join(" and ")}.`);
      }
      return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        author: manifest.author,
        licence: manifest.licence,
        summary: summaryOf(readFileSync(join(folder, "README.md"), "utf8")),
        madeBy: madeBy[id] ?? "photos",
        aspects: manifest.aspects,
        vibes: manifest.vibes,
        ...(manifest.labels ? { labels: manifest.labels } : {}),
        preview: `templates/${id}/preview.gif`,
        files: Object.fromEntries(templateFiles.map((file) => [file, sha256(join(folder, file))])),
      };
    });
  const assets = (folder: string) =>
    readJson<Record<string, unknown>[]>(join(root, "library", folder, "assets.json")).map(
      (entry) => ({
        ...entry,
        sha256: sha256(join(root, "library", folder, String(entry.file))),
      }),
    );
  return {
    schemaVersion: 1,
    repository: "https://github.com/mayank29deo/U-Cut",
    templates,
    library: {
      music: assets("music"),
      sfx: assets("sfx"),
      luts: assets("luts"),
      fonts: assets("fonts"),
    },
  };
}

export const registryText = () => `${JSON.stringify(buildRegistry(), null, 2)}\n`;

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const text = registryText();
  if (process.argv.includes("--check")) {
    const current = existsSync(registryPath) ? readFileSync(registryPath, "utf8") : "";
    if (current !== text) {
      console.error("registry/index.json is out of date. Run: pnpm registry");
      process.exit(1);
    }
    console.log("registry/index.json is up to date.");
  } else {
    writeFileSync(registryPath, text);
    console.log(`Wrote ${registryPath}`);
  }
}
