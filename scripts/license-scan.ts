import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/** Non-permissive packages we accept. See docs/decisions/0009-licence-exceptions.md. */
const dependencyExceptions = ["@img/sharp-libvips-"];

const allowedDependencyLicences = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "ISC",
  "MIT",
  "OFL-1.1",
  "Unlicense",
]);
const allowedAssetLicences = new Set(["Apache-2.0", "CC-BY-4.0", "CC0-1.0", "MIT", "OFL-1.1"]);

const skippedFolders = new Set([".build", ".git", ".hyperframes", "dist", "node_modules"]);
const videoExtensions = new Set([".m4v", ".mkv", ".mov", ".mp4", ".webm"]);
const assetExtensions = new Set(
  ".aac .cube .flac .gif .heic .jpeg .jpg .m4a .mp3 .ogg .otf .png .ttf .wav .woff .woff2".split(
    " ",
  ),
);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs"]);
const maxPreviewBytes = 2 * 1024 * 1024;

export interface ScanResult {
  findings: string[];
  checked: number;
}

interface AssetEntry {
  file: string;
  licence: string;
}

function* walk(folder: string): Generator<string> {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedFolders.has(entry.name)) yield* walk(join(folder, entry.name));
    } else {
      yield join(folder, entry.name);
    }
  }
}

function readEntries(folder: string): AssetEntry[] {
  const file = join(folder, "assets.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as AssetEntry[]) : [];
}

export function scanAssets(root: string): ScanResult {
  const findings: string[] = [];
  let checked = 0;

  for (const file of walk(root)) {
    const path = relative(root, file);
    const extension = extname(file).toLowerCase();
    const inTemplate = path.startsWith("templates/") || path.startsWith("library/blocks/");

    if (videoExtensions.has(extension)) {
      findings.push(
        `${path} is a video file. Video doesn't belong in git (see docs/decisions/0007-media-in-the-repo.md).`,
      );
    }
    if (inTemplate && textExtensions.has(extension) && /gsap/i.test(readFileSync(file, "utf8"))) {
      findings.push(
        `${path} mentions GSAP. Templates must be GSAP-free (see docs/decisions/0002-no-gsap-in-templates.md).`,
      );
    }
    if (!assetExtensions.has(extension)) continue;
    if (!path.startsWith("library/") && !path.startsWith("templates/")) continue;

    checked += 1;
    if (basename(file) === "preview.gif") {
      if (statSync(file).size > maxPreviewBytes) findings.push(`${path} is over the 2 MB limit.`);
      continue;
    }
    const entry = readEntries(dirname(file)).find((asset) => asset.file === basename(file));
    if (!entry) {
      findings.push(
        `${path} has no licence entry in ${relative(root, dirname(file))}/assets.json.`,
      );
    } else if (!allowedAssetLicences.has(entry.licence)) {
      findings.push(`${path} has a licence that isn't allowed: ${entry.licence}.`);
    }
  }
  return { findings, checked };
}

function licenceAllowed(expression: string): boolean {
  const clean = expression.replace(/[()]/g, "");
  return clean
    .split(/\s+OR\s+/)
    .some((option) =>
      option.split(/\s+AND\s+/).every((licence) => allowedDependencyLicences.has(licence.trim())),
    );
}

function findPackage(from: string, name: string): string | undefined {
  for (let folder = from; ; folder = dirname(folder)) {
    const candidate = join(folder, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (folder === dirname(folder)) return undefined;
  }
}

interface PackageJson {
  name?: string;
  license?: string | { type: string };
  licenses?: { type: string }[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function readPackage(folder: string): PackageJson {
  return JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as PackageJson;
}

function productionDependencies(pkg: PackageJson): string[] {
  return Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies });
}

function declaredLicence(pkg: PackageJson): string | undefined {
  if (typeof pkg.license === "string") return pkg.license;
  return pkg.license?.type ?? pkg.licenses?.map((licence) => licence.type).join(" OR ");
}

export function scanDependencies(root: string): ScanResult {
  const findings: string[] = [];
  const seen = new Set<string>();
  const packagesFolder = join(root, "packages");

  const visit = (folder: string) => {
    if (seen.has(folder)) return;
    seen.add(folder);
    const pkg = readPackage(folder);
    const name = pkg.name ?? basename(folder);
    const licence = declaredLicence(pkg);

    if (dependencyExceptions.some((prefix) => name.startsWith(prefix))) {
      // Accepted by name.
    } else if (!licence) {
      findings.push(`${name} doesn't declare a licence.`);
    } else if (!licenceAllowed(licence)) {
      findings.push(`${name} uses a licence that isn't allowed: ${licence}.`);
    }
    for (const dependency of productionDependencies(pkg)) {
      const found = findPackage(folder, dependency);
      if (found) visit(found);
    }
  };

  for (const entry of readdirSync(packagesFolder, { withFileTypes: true })) {
    const folder = join(packagesFolder, entry.name);
    if (!entry.isDirectory() || !existsSync(join(folder, "package.json"))) continue;
    for (const dependency of productionDependencies(readPackage(folder))) {
      const found = findPackage(folder, dependency);
      if (found && !found.startsWith(`${realpathSync(packagesFolder)}/`)) visit(found);
    }
  }
  return { findings, checked: seen.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL("..", import.meta.url).pathname;
  const assets = scanAssets(root);
  const dependencies = scanDependencies(root);
  const findings = [...assets.findings, ...dependencies.findings];
  for (const finding of findings) console.error(finding);
  if (findings.length > 0) process.exit(1);
  console.log(
    `Licence scan passed: ${dependencies.checked} packages and ${assets.checked} assets checked.`,
  );
}
