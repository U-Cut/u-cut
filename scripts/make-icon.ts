// Draws apps/mac/Icon/AppIcon.svg at every size macOS asks for and packs them into AppIcon.icns.
// Run with: pnpm exec tsx scripts/make-icon.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { browserPath } from "../packages/engine/src/setup/parts.ts";

const folder = new URL("../apps/mac/Icon/", import.meta.url).pathname;
const svg = readFileSync(join(folder, "AppIcon.svg"), "utf8");
const executablePath = process.env.CHROME_PATH ?? browserPath();
if (!executablePath) throw new Error("Run `ucut setup` first, or set CHROME_PATH.");

const work = mkdtempSync(join(tmpdir(), "ucut-icon-"));
const iconset = join(work, "AppIcon.iconset");
execFileSync("mkdir", ["-p", iconset]);
const browser = await puppeteer.launch({ executablePath, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = size * scale;
      await page.setViewport({ width: pixels, height: pixels });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${pixels}px;height:${pixels}px}</style>${svg}`,
      );
      const name = scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@2x.png`;
      await page.screenshot({ path: join(iconset, name) as `${string}.png`, omitBackground: true });
    }
  }
} finally {
  await browser.close();
}
execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(folder, "AppIcon.icns")]);
rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${join(folder, "AppIcon.icns")}`);
