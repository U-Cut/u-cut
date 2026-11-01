import { z } from "zod";
import { positive, seconds, unit } from "./common.ts";

export const DemoWord = z.strictObject({
  text: z.string().min(1),
  start: seconds,
  end: seconds,
});
export type DemoWord = z.infer<typeof DemoWord>;

/** A part of a recording worth keeping, and why U-Cut suggests it. */
export const Moment = z.strictObject({
  in: seconds,
  out: positive,
  /** What was said, or empty for a silent moment. */
  quote: z.string(),
  why: z.string().min(1),
  /** Where to push in to, from 0 to 1 across and down the screen. */
  focus: z.strictObject({ x: unit, y: unit }).nullable(),
  zoom: z.number().min(1).max(4),
  /** The words to show instead of what was heard, when someone corrects them. */
  caption: z.string().optional(),
});
export type Moment = z.infer<typeof Moment>;

export const Brand = z.strictObject({
  name: z.string().max(60),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** The id of an uploaded picture. */
  logo: z.string().min(1).optional(),
});
export type Brand = z.infer<typeof Brand>;

/** What a demo is made from, kept so it can be re-cut without reading the recording again. */
export const Demo = z.strictObject({
  media: z.string().min(1),
  /** Whether the recording has a sound track at all. */
  sound: z.boolean(),
  words: z.array(DemoWord),
  moments: z.array(Moment),
  /** Moments left out, by their place in the list. */
  skipped: z.array(z.number().int().min(0)),
  captions: z.boolean(),
  /** Whether speech was found, or couldn't be listened for. */
  speech: z.enum(["heard", "none", "no-model"]),
  brand: Brand,
});
export type Demo = z.infer<typeof Demo>;
