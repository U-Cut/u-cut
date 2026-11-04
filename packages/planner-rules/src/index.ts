import type { Planner, PlannerInput } from "@u-cut/schema";
import { planRules } from "./plan.ts";

export {
  captionLines,
  type DemoInput,
  type DemoPlanInput,
  findMoments,
  planDemo,
  type ScreenWindow,
  spreadWords,
} from "./demo.ts";
export { replaceShot, setTitle, swapShots } from "./edit.ts";
export { PlanError, planRules, usableItems } from "./plan.ts";
export {
  defaultReelLength,
  longestReel,
  type ReelKind,
  type ReelRequest,
  readPrompt,
  type ScriptInput,
  scriptFrom,
  speedFor,
  splitIntoLines,
  writeScript,
} from "./prompt.ts";
export {
  describeRecipe,
  matchTrack,
  matchVibe,
  type ReelMeasurements,
  recipeFrom,
} from "./recipe.ts";
export { seededRng } from "./rng.ts";
export { lineLength, planScript, type ScriptPlanInput } from "./script.ts";
export { type VibeProfile, vibes } from "./vibes.ts";

export const rulesPlanner: Planner = {
  lane: "rules",
  plan: async (input: PlannerInput) => planRules(input),
};
