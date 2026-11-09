import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SetupId, type SetupPart } from "./api";

const pollMs = 600;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const megabytes = (bytes: number) => `${Math.round(bytes / 1024 ** 2)} MB`;

/** "42 of 93 MB", or what it's doing when that isn't downloading. */
export function progressText(part: SetupPart): string {
  if (part.ready) return "Ready";
  if (part.state === "waiting") {
    return `Waiting for the internet to come back. It carries on from ${megabytes(part.done)}.`;
  }
  if (part.step) return `${part.step}…`;
  return `${megabytes(part.done)} of ${megabytes(part.bytes)}`;
}

/** Starts a part, or joins its download, and resolves once it's ready. */
export async function installPart(id: SetupId, onStatus: (part: SetupPart) => void): Promise<void> {
  let part = await api.startSetup(id);
  onStatus(part);
  while (!part.ready) {
    if (part.state === "failed") throw new Error(part.error ?? `${part.name} didn't finish.`);
    await sleep(pollMs);
    const found = (await api.setup()).parts.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`U-Cut has nothing to add called ${id}.`);
    part = found;
    onStatus(part);
  }
}

/** One part's status, kept current while it downloads, with ways to start and stop it. */
export function useSetupPart(initial: SetupPart | undefined) {
  const [part, setPart] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    if (!initial) return;
    setProblem(null);
    try {
      await installPart(initial.id, (next) => {
        if (alive.current) setPart(next);
      });
    } catch (error) {
      if (alive.current) setProblem((error as Error).message);
    }
  }, [initial]);

  const stop = useCallback(async () => {
    if (!initial) return;
    const next = await api.stopSetup(initial.id).catch(() => undefined);
    if (next && alive.current) setPart(next);
  }, [initial]);

  return { part, problem, start, stop };
}
