import { z } from "zod";
import { positive, unit } from "./common.ts";

/** A null quality or moment field means that analysis has not run yet. */
export const MediaItem = z.strictObject({
  id: z.string().min(1),
  path: z.string().min(1),
  kind: z.enum(["photo", "video"]),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  duration: positive.optional(),
  takenAt: z.iso.datetime({ offset: true }).optional(),
  gps: z
    .strictObject({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
    .optional(),
  orientation: z.number().int().min(1).max(8),
  quality: z.strictObject({
    sharpness: unit.nullable(),
    exposure: unit.nullable(),
    faces: z.number().int().min(0).nullable(),
    dupGroup: z.string().min(1).nullable(),
    /** How good a photo this is, from Apple's aesthetics model. */
    score: z.number().min(-1).max(1).nullable(),
  }),
  /** Where the subject is, from 0 to 1 across and down the frame. */
  focus: z.strictObject({ x: unit, y: unit }).nullable(),
  labels: z.array(z.strictObject({ id: z.string().min(1), score: unit })).max(3),
  moment: z.string().min(1).nullable(),
});
export type MediaItem = z.infer<typeof MediaItem>;
