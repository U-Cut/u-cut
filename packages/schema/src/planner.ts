import { z } from "zod";
import type { Aspect, Vibe } from "./common.ts";
import { positive, seconds } from "./common.ts";
import type { MediaItem } from "./media.ts";
import type { EditPlan } from "./plan.ts";
import type { StyleRecipe } from "./recipe.ts";
import type { TemplateManifest } from "./template.ts";

export const BeatGrid = z.strictObject({
  bpm: positive.nullable(),
  times: z.array(seconds),
  source: z.enum(["detected", "even"]),
});
export type BeatGrid = z.infer<typeof BeatGrid>;

export interface PlannerInput {
  items: MediaItem[];
  template: TemplateManifest;
  vibe: Vibe;
  aspect: Aspect;
  duration: number;
  music: { src: string; length: number; beats: BeatGrid };
  copy: { title: string };
  /** Scenes left out of this reel, such as screenshots. */
  excludedScenes: string[];
  recipe: StyleRecipe | null;
  seed: number;
  /** Sound effects at the reel's turning points. On unless this is false. */
  sounds?: boolean;
}

export interface Planner {
  readonly lane: "rules" | "plugin" | "api";
  plan(input: PlannerInput): Promise<EditPlan>;
}
