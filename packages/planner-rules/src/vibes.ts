import type { EditPlan, Vibe } from "@u-cut/schema";

export interface VibeProfile {
  /** Whole beats per shot in each part of the reel. */
  beats: { hook: number; body: number; close: number };
  /** How far a photo moves: 0.14 means a 14% push-in. */
  motion: number;
  grade: EditPlan["grade"];
  fadeOut: number;
}

export const vibes: Record<Vibe, VibeProfile> = {
  chill: {
    beats: { hook: 4, body: 4, close: 8 },
    motion: 0.1,
    grade: { temp: 0.12, contrast: -0.04, sat: -0.06 },
    fadeOut: 0.6,
  },
  hype: {
    beats: { hook: 2, body: 2, close: 4 },
    motion: 0.2,
    grade: { temp: 0, contrast: 0.14, sat: 0.14 },
    fadeOut: 0,
  },
  cinematic: {
    beats: { hook: 4, body: 4, close: 8 },
    motion: 0.08,
    grade: { temp: -0.08, contrast: 0.16, sat: -0.14 },
    fadeOut: 1.2,
  },
  nostalgic: {
    beats: { hook: 4, body: 4, close: 8 },
    motion: 0.12,
    grade: { temp: 0.26, contrast: -0.1, sat: -0.2 },
    fadeOut: 0.8,
  },
};
