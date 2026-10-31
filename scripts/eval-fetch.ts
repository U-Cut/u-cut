// Downloads the eval photos listed in classifiers/eval/manifest.json into a folder you choose.
// Run with: pnpm exec tsx scripts/eval-fetch.ts <folder>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Entry {
  title: string;
  url: string;
  label: string;
}

const folder = process.argv[2];
if (!folder) throw new Error("Say where to put the photos.");
const entries = JSON.parse(
  readFileSync(new URL("../classifiers/eval/manifest.json", import.meta.url), "utf8"),
) as Entry[];
const agent = "U-Cut classifier eval (https://github.com/mayank29deo/U-Cut)";

function hashName(title: string) {
  let hash = 0;
  for (const char of title) hash = (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) >>> 0;
  return `${hash.toString(16)}.jpg`;
}

let fetched = 0;
let failed = 0;
const queue = [...entries];
async function worker() {
  for (let entry = queue.shift(); entry; entry = queue.shift()) {
    const directory = join(folder as string, entry.label);
    mkdirSync(directory, { recursive: true });
    const path = join(directory, hashName(entry.title));
    if (existsSync(path)) continue;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(entry.url, { headers: { "user-agent": agent } });
      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 4000 * (attempt + 1)));
        continue;
      }
      if (response.ok) {
        writeFileSync(path, Buffer.from(await response.arrayBuffer()));
        fetched += 1;
      } else {
        failed += 1;
      }
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}
await Promise.all([worker(), worker()]);
console.log(`Fetched ${fetched}, failed ${failed}, of ${entries.length}.`);
