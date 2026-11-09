import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./paths.ts";

/**
 * Inside the Mac app, U-Cut carries its own Node, FFmpeg, speech tool and photo sorter, beside the
 * engine in a folder marked by runtime.json. See docs/decisions/0024-the-app-carries-its-own-tools.md.
 */
export const runtimeDir = join(repoRoot, "..");
const marker = join(runtimeDir, "runtime.json");

export interface RuntimeInfo {
  version: string;
  node: string;
  ffmpeg: string;
}

export function bundledRuntime(): RuntimeInfo | undefined {
  if (!existsSync(marker)) return undefined;
  return JSON.parse(readFileSync(marker, "utf8")) as RuntimeInfo;
}

/** Puts the bundled tools first, so every command U-Cut and HyperFrames run finds them. */
export function useBundledTools(env: NodeJS.ProcessEnv = process.env): void {
  if (!bundledRuntime()) return;
  const bin = join(runtimeDir, "bin");
  env.PATH = `${bin}:${env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin"}`;
  const tools: [string, string][] = [
    ["HYPERFRAMES_FFMPEG_PATH", "ffmpeg"],
    ["HYPERFRAMES_FFPROBE_PATH", "ffprobe"],
    ["HYPERFRAMES_WHISPER_PATH", "whisper-cli"],
    ["UCUT_VISION", "ucut-vision"],
  ];
  for (const [name, tool] of tools) {
    if (!env[name] && existsSync(join(bin, tool))) env[name] = join(bin, tool);
  }
}
