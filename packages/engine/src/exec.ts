import { spawn } from "node:child_process";
import { setPriority } from "node:os";

export interface ExecOptions {
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs?: number;
  /** Lower priority for heavy work, so the interface stays quick. */
  nice?: number;
  onLine?: (line: string) => void;
}

export class ExecError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(message);
  }
}

const keepTail = (text: string) => (text.length > 64_000 ? text.slice(-64_000) : text);

/** Runs a command and resolves with its stdout. Kills it if the signal aborts. */
export function run(command: string, args: string[], options: ExecOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      action();
    };
    const abort = () => child.kill("SIGTERM");
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          finish(() =>
            reject(new ExecError(`${command} took too long and was stopped.`, null, stderr)),
          );
        }, options.timeoutMs)
      : undefined;

    if (options.signal?.aborted) abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.nice && child.pid) {
      try {
        setPriority(child.pid, options.nice);
      } catch {
        // Priority is an optimisation, so a failure here doesn't matter.
      }
    }

    const scan = (chunk: string) => {
      if (!options.onLine) return;
      lineBuffer += chunk;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) options.onLine(line);
    };
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout = keepTail(stdout + chunk);
      scan(chunk);
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr = keepTail(stderr + chunk);
      scan(chunk);
    });
    child.on("error", (error) => {
      finish(() =>
        reject(new ExecError(`Couldn't run ${command}: ${error.message}`, null, stderr)),
      );
    });
    child.on("close", (code) => {
      finish(() => {
        if (code === 0) resolve(stdout);
        else {
          const reason = stderr.trim().split("\n").at(-1)?.trim();
          const detail = reason ? `: ${reason.slice(0, 300)}` : ".";
          reject(new ExecError(`${command} stopped with code ${code}${detail}`, code, stderr));
        }
      });
    });
  });
}
