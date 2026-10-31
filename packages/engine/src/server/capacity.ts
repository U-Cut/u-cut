import { statfs } from "node:fs/promises";
import { cpus } from "node:os";

const gigabyte = 1024 ** 3;
/** Roughly what one single-worker render needs, Chrome and FFmpeg included. */
const memoryPerRender = 0.45 * gigabyte;
/** Below this, new work is refused rather than filling the disk. */
export const minimumFreeDisk = 1.5 * gigabyte;

export interface Capacity {
  renderSlots: number;
  /** Chrome workers shared between all renders. */
  totalWorkers: number;
  analysisSlots: number;
}

/**
 * How much work this machine can carry at once. On an 8 GB, 6-core Mac we measured three parallel
 * single-worker renders finishing 39% more work than one render with three workers, so slots beat
 * workers under load. See docs/ARCHITECTURE.md. Set UCUT_RENDER_SLOTS to override it.
 */
export function measureCapacity(
  cores = cpus().length,
  memory = process.availableMemory(),
): Capacity {
  const override = Number(process.env.UCUT_RENDER_SLOTS);
  const byMemory = Math.floor(memory / memoryPerRender);
  const byCores = Math.floor(cores / 2);
  const renderSlots = override > 0 ? override : Math.max(1, Math.min(byMemory, byCores));
  return {
    renderSlots,
    totalWorkers: Math.max(renderSlots, byCores),
    analysisSlots: Math.max(2, cores - 2),
  };
}

/** One person alone gets every worker. A busy queue shares them evenly across slots. */
export function workersFor(capacity: Capacity, running: number, queued: number): number {
  const active = Math.max(1, Math.min(capacity.renderSlots, running + queued));
  return Math.max(1, Math.floor(capacity.totalWorkers / active));
}

export async function freeDisk(path: string): Promise<number> {
  const info = await statfs(path);
  return info.bavail * info.bsize;
}
