import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The site plays reels from U-Cut's own free library, so nothing is stored twice.
const root = fileURLToPath(new URL("../../..", import.meta.url));
const media = fileURLToPath(new URL("../public/media", import.meta.url));

rmSync(media, { recursive: true, force: true });
mkdirSync(join(media, "samples"), { recursive: true });
cpSync(join(root, "library/music"), join(media, "music"), {
  recursive: true,
  filter: (path) => !path.endsWith(".json"),
});
cpSync(join(root, "library/sfx"), join(media, "sfx"), {
  recursive: true,
  filter: (path) => !path.endsWith(".json"),
});
cpSync(join(root, "library/fonts"), join(media, "fonts"), {
  recursive: true,
  filter: (path) => !path.endsWith(".json") && !path.includes("licenses"),
});
cpSync(join(root, "library/samples"), join(media, "samples"), {
  recursive: true,
  filter: (path) => !path.endsWith(".json"),
});
cpSync(join(root, "docs/images/studio.jpg"), join(media, "samples/studio-screen.jpg"));
cpSync(join(root, "docs/images/studio.jpg"), join(media, "preview.jpg"));
