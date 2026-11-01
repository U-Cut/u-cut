import type { Planner, PlannerInput } from "@u-cut/schema";
import { planRules } from "./plan.ts";

export { replaceShot, setTitle, swapShots } from "./edit.ts";
export { PlanError, planRules } from "./plan.ts";
export {
  describeRecipe,
  matchTrack,
  matchVibe,
  type ReelMeasurements,
  recipeFrom,
} from "./recipe.ts";
export { seededRng } from "./rng.ts";
export { type VibeProfile, vibes } from "./vibes.ts";

export const rulesPlanner: Planner = {
  lane: "rules",
  plan: async (input: PlannerInput) => planRules(input),
};
