import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { type ExecOptions, run } from "./exec.ts";

// Every HyperFrames call goes through here. See docs/decisions/0001-hyperframes-pinned-and-offline.md.

export const offlineEnv = {
  HYPERFRAMES_NO_TELEMETRY: "1",
  HF_CLI_TELEMETRY_DISABLED: "1",
  HYPERFRAMES_NO_UPDATE_CHECK: "1",
  HYPERFRAMES_NO_AUTO_INSTALL: "1",
  HYPERFRAMES_NO_OPTIONAL_INSTALL: "1",
  DO_NOT_TRACK: "1",
} as const;

const allowed = new Set([
  "audio",
  "beats",
  "browser",
  "check",
  "doctor",
  "lint",
  "measure",
  "render",
  "snapshot",
  "transcribe",
  "tts",
]);

export function hfArguments(args: string[]): string[] {
  const [command] = args;
  if (!command || !allowed.has(command)) {
    throw new Error(`U-Cut doesn't use the HyperFrames command "${command ?? ""}".`);
  }
  const joined = args.join(" ");
  if (/--quality[= ]best\b/.test(joined) && command === "audio") {
    throw new Error("U-Cut never uploads audio for analysis.");
  }
  if (/--engine[= ]heygen\b/.test(joined)) {
    throw new Error("U-Cut never sends speech to an online service.");
  }
  return args;
}

function hfBinary(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("hyperframes/package.json")), "bin", "hyperframes.mjs");
}

export function hf(args: string[], options: ExecOptions = {}): Promise<string> {
  return run(process.execPath, [hfBinary(), ...hfArguments(args)], {
    ...options,
    env: { ...process.env, ...offlineEnv, ...options.env },
  });
}
