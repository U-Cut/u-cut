import { z } from "zod";
import { positive } from "./common.ts";

export const ScriptLine = z.strictObject({
  text: z.string().min(1).max(160),
  /** The scene this line talks about, so the picture under it can match. */
  scene: z.string().min(1).nullable(),
  /** How fast the voice reads this line. 1 is normal. */
  speed: z.number().min(0.5).max(2),
  /** The spoken line, once it has been voiced. */
  voice: z.strictObject({ src: z.string().regex(/^[0-9a-f]{32}$/), length: positive }).nullable(),
});
export type ScriptLine = z.infer<typeof ScriptLine>;

/** What a written reel is made from, kept so it can be re-cut and re-voiced line by line. */
export const Script = z.strictObject({
  prompt: z.string().max(4000),
  lines: z.array(ScriptLine).min(1),
  /** Which voice reads it, or null for words on screen only. */
  voice: z.string().min(1).nullable(),
});
export type Script = z.infer<typeof Script>;
