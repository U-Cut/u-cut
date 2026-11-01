import { type ChildProcessByStdio, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { repoRoot } from "./paths.ts";

export interface VisionResult {
  path: string;
  error?: string;
  labels?: { id: string; score: number }[];
  print?: string;
  faces?: number;
  faceArea?: number;
  score?: number;
  utility?: boolean;
  focus?: [number, number];
  sharpness?: number;
  exposure?: number;
}

const idleMs = 30_000;

/** Finds the on-device helper. It only exists on macOS, and U-Cut works without it. */
export function visionBinary(): string | undefined {
  if (process.env.UCUT_VISION) return process.env.UCUT_VISION;
  if (platform() !== "darwin") return undefined;
  const candidates = ["release", "debug"].map((build) =>
    join(repoRoot, "apps/mac/.build", build, "ucut-vision"),
  );
  return candidates.find((path) => existsSync(path));
}

/**
 * One long-running helper shared by everyone, because loading Apple's models is the slow part.
 * It closes itself when idle, which gives its memory back.
 */
export class Vision {
  private child: ChildProcessByStdio<Writable, Readable, null> | undefined;
  private readonly waiting = new Map<string, (result: VisionResult) => void>();
  private idle: NodeJS.Timeout | undefined;

  constructor(private readonly binary: string) {}

  analyse(path: string): Promise<VisionResult> {
    clearTimeout(this.idle);
    return new Promise((resolve) => {
      this.waiting.set(path, resolve);
      this.helper().stdin.write(`${path}\n`);
    });
  }

  stop() {
    clearTimeout(this.idle);
    this.child?.stdin.end();
    this.child = undefined;
  }

  private helper() {
    if (this.child) return this.child;
    // Its log output is ignored: an unread pipe fills up and blocks the helper for good.
    const child = spawn(this.binary, ["analyze"], { stdio: ["pipe", "pipe", "ignore"] });
    createInterface({ input: child.stdout }).on("line", (line) => {
      const result = JSON.parse(line) as VisionResult;
      this.waiting.get(result.path)?.(result);
      this.waiting.delete(result.path);
      if (this.waiting.size === 0) {
        this.idle = setTimeout(() => this.stop(), idleMs);
        this.idle.unref();
      }
    });
    child.on("close", () => {
      if (this.child === child) this.child = undefined;
      for (const [path, resolve] of this.waiting) resolve({ path, error: "The helper stopped." });
      this.waiting.clear();
    });
    child.on("error", () => child.emit("close"));
    child.stdin.on("error", () => {});
    this.child = child;
    return child;
  }
}

let shared: Vision | undefined;

/** Lets a one-off command exit at once, rather than waiting for the helper's idle timer. */
export function stopVision() {
  shared?.stop();
}

export function vision(): Vision | undefined {
  if (shared) return shared;
  const binary = visionBinary();
  if (binary) shared = new Vision(binary);
  return shared;
}
