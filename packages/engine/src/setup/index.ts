import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { run } from "../exec.ts";
import { hf } from "../hf.ts";
import { prepareVoice, voiceReady } from "../voice.ts";
import { download } from "./download.ts";
import {
  browserPath,
  browserZip,
  fetchesOwnBrowser,
  ownBrowserPath,
  type PartId,
  speechFile,
  speechModelPath,
  toolsDir,
  uvArchive,
  uvPath,
  voiceEnvironmentBytes,
  voiceFiles,
  voiceModelPath,
  voiceVoicesPath,
} from "./parts.ts";

export { browserPath, type PartId, toolsDir } from "./parts.ts";

export interface PartStatus {
  id: PartId;
  name: string;
  /** What it's for, in a sentence. */
  purpose: string;
  /** Roughly how much it downloads. */
  bytes: number;
  /** U-Cut can't export a reel without it. */
  required: boolean;
  ready: boolean;
  state: "idle" | "working" | "waiting" | "failed";
  done: number;
  /** What it's doing now, when that isn't downloading. */
  step?: string;
  error?: string;
}

interface Report {
  progress: (done: number) => void;
  step: (text: string | undefined) => void;
  waiting: (seconds: number) => void;
}

/** Finds a command on the PATH, as a shell would. */
export function onPath(name: string): string | undefined {
  return (process.env.PATH ?? "")
    .split(delimiter)
    .map((folder) => join(folder, name))
    .find((path) => existsSync(path));
}

const whisperCli = () => process.env.HYPERFRAMES_WHISPER_PATH ?? onPath("whisper-cli");

async function installBrowser(report: Report, signal: AbortSignal): Promise<void> {
  if (!fetchesOwnBrowser()) {
    report.step("Downloading");
    await hf(["browser", "ensure"], { timeoutMs: 1_800_000, signal });
    return;
  }
  const zip = join(toolsDir(), "downloads", "chrome-headless-shell.zip");
  await download({
    ...browserZip,
    to: zip,
    signal,
    onProgress: report.progress,
    onWaiting: report.waiting,
  });
  report.step("Unpacking");
  const target = dirname(dirname(ownBrowserPath()));
  const partial = `${target}.partial`;
  await rm(partial, { recursive: true, force: true });
  await mkdir(partial, { recursive: true });
  await run("ditto", ["-x", "-k", zip, partial], { signal });
  await rm(target, { recursive: true, force: true });
  await rename(partial, target);
  await rm(zip, { force: true });
}

async function installSpeech(report: Report, signal: AbortSignal): Promise<void> {
  if (!whisperCli()) {
    throw new Error("Captions also need whisper-cli. Install it with: brew install whisper-cpp");
  }
  await download({
    ...speechFile,
    to: speechModelPath(),
    signal,
    onProgress: report.progress,
    onWaiting: report.waiting,
  });
}

/** uv, from the PATH, or fetched into U-Cut's own folder on an Apple Silicon Mac. */
async function uv(report: Report, signal: AbortSignal): Promise<string> {
  const found = onPath("uv") ?? (existsSync(uvPath()) ? uvPath() : undefined);
  if (found) return found;
  if (!fetchesOwnBrowser()) {
    throw new Error("The voice needs uv. Install it from https://docs.astral.sh/uv/");
  }
  const archive = join(toolsDir(), "downloads", "uv.tar.gz");
  await download({ ...uvArchive, to: archive, signal, onWaiting: report.waiting });
  // Unpacked beside its final place first, so a cut-short unpack is never taken for a working uv.
  const folder = dirname(dirname(uvPath()));
  const partial = `${folder}.partial`;
  await rm(partial, { recursive: true, force: true });
  await mkdir(partial, { recursive: true });
  await run("tar", ["-xzf", archive, "-C", partial], { signal });
  await rm(folder, { recursive: true, force: true });
  await rename(partial, folder);
  await rm(archive, { force: true });
  return uvPath();
}

async function installVoice(report: Report, signal: AbortSignal): Promise<void> {
  const uvBinary = await uv(report, signal);
  const model = voiceFiles.model.bytes;
  await download({
    ...voiceFiles.model,
    to: voiceModelPath(),
    signal,
    onProgress: report.progress,
    onWaiting: report.waiting,
  });
  await download({
    ...voiceFiles.voices,
    to: voiceVoicesPath(),
    signal,
    onProgress: (done) => report.progress(model + done),
    onWaiting: report.waiting,
  });
  report.step("Setting up the voice");
  await prepareVoice(uvBinary, signal);
}

interface Part {
  name: string;
  purpose: string;
  bytes: number;
  required: boolean;
  ready: () => boolean;
  install: (report: Report, signal: AbortSignal) => Promise<void>;
}

const parts: Record<PartId, Part> = {
  browser: {
    name: "The exporter",
    purpose: "U-Cut draws every frame of a reel with it, on this Mac.",
    bytes: browserZip.bytes,
    required: true,
    ready: () => Boolean(browserPath()),
    install: installBrowser,
  },
  speech: {
    name: "Captions",
    purpose: "Writes captions for screen recordings, on this Mac.",
    bytes: speechFile.bytes,
    required: false,
    ready: () => existsSync(speechModelPath()),
    install: installSpeech,
  },
  voice: {
    name: "The built-in voice",
    purpose: "Reads written reels aloud, on this Mac.",
    bytes: voiceFiles.model.bytes + voiceFiles.voices.bytes + voiceEnvironmentBytes,
    required: false,
    ready: voiceReady,
    install: installVoice,
  },
};

interface Running {
  promise: Promise<void>;
  controller: AbortController;
  done: number;
  step?: string;
  waiting: boolean;
}

/** Installs the parts, one run per part at a time, and remembers how each is going. */
export class Setup {
  private running = new Map<PartId, Running>();
  private failed = new Map<PartId, string>();

  status(): PartStatus[] {
    return (Object.keys(parts) as PartId[]).map((id) => this.statusOf(id));
  }

  statusOf(id: PartId): PartStatus {
    const part = parts[id];
    const run = this.running.get(id);
    const error = this.failed.get(id);
    const ready = !run && part.ready();
    return {
      id,
      name: part.name,
      purpose: part.purpose,
      bytes: part.bytes,
      required: part.required,
      ready,
      state: run ? (run.waiting ? "waiting" : "working") : error && !ready ? "failed" : "idle",
      done: ready ? part.bytes : (run?.done ?? 0),
      ...(run?.step ? { step: run.step } : {}),
      ...(error && !ready && !run ? { error } : {}),
    };
  }

  /** Starts installing a part, or joins the install already under way. */
  start(id: PartId): Promise<void> {
    const existing = this.running.get(id);
    if (existing) return existing.promise;
    const part = parts[id];
    if (part.ready()) return Promise.resolve();
    const controller = new AbortController();
    const entry: Running = { promise: Promise.resolve(), controller, done: 0, waiting: false };
    const report: Report = {
      progress: (done) => {
        entry.done = Math.min(done, part.bytes);
        entry.waiting = false;
      },
      step: (text) => {
        if (text) entry.step = text;
        else delete entry.step;
        entry.waiting = false;
      },
      waiting: () => {
        entry.waiting = true;
      },
    };
    this.failed.delete(id);
    entry.promise = part
      .install(report, controller.signal)
      .catch((error: unknown) => {
        const stopped = controller.signal.aborted;
        this.failed.set(id, stopped ? "Stopped." : (error as Error).message);
        throw stopped ? new Error(`${part.name} was stopped.`) : error;
      })
      .finally(() => {
        this.running.delete(id);
      });
    this.running.set(id, entry);
    return entry.promise;
  }

  /** Stops a part's install. What was downloaded is kept, so starting again carries on. */
  stop(id: PartId): void {
    this.running.get(id)?.controller.abort(new Error("Stopped."));
  }
}

export const setup = new Setup();

export const isPart = (id: string): id is PartId => Object.hasOwn(parts, id);
