import { z } from "zod";
import { Aspect, positive, seconds, TransitionType, unit } from "./common.ts";

const adjustment = z.number().min(-1).max(1);

export const StyleRecipe = z.strictObject({
  aspect: Aspect,
  duration: positive,
  bpm: positive.optional(),
  cutRhythm: z.strictObject({ median: positive, p90: positive, onBeat: z.boolean() }),
  sections: z.array(
    z.strictObject({
      name: z.string().min(1),
      start: seconds,
      end: positive,
      energy: unit,
      /** The typical shot length in this part of the reel. */
      cut: positive,
    }),
  ),
  /** How a reel's words look, or null if it has none. What they say is never recorded. */
  text: z
    .strictObject({
      font: z.string().min(1),
      sizePx: positive,
      position: z.enum(["top", "upper", "center", "lower", "bottom"]),
      case: z.enum(["upper", "lower", "title", "sentence"]),
      timing: z.enum(["word", "line", "block"]),
    })
    .nullable(),
  transitions: z.array(z.strictObject({ type: TransitionType, share: unit })),
  grade: z.strictObject({ temp: adjustment, contrast: adjustment, sat: adjustment }),
  notes: z.string(),
});
export type StyleRecipe = z.infer<typeof StyleRecipe>;
