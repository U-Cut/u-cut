import type { BeatGrid } from "@u-cut/schema";
import { hf } from "./hf.ts";

const evenGrid: BeatGrid = { bpm: null, source: "even", times: [] };

interface AudioReport {
  items?: { beats?: { times?: number[] }; bpm?: { value?: number | null } }[];
}

/** Finds the beats of a user's own track. A track with no steady beat gets an even grid. */
export async function detectBeats(path: string): Promise<BeatGrid> {
  try {
    const output = await hf(["audio", path, "--only", "beats,bpm", "--json"], {
      timeoutMs: 120_000,
    });
    const [item] = (JSON.parse(output) as AudioReport).items ?? [];
    const times = item?.beats?.times ?? [];
    const bpm = item?.bpm?.value;
    if (bpm && times.length >= 8) return { bpm, source: "detected", times };
  } catch {
    // Beat detection is an enhancement: an unreadable beat shouldn't stop the reel.
  }
  return evenGrid;
}
