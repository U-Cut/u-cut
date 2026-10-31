import { z } from "zod";
import { Aspect, positive, Vibe } from "./common.ts";

export const TemplateLicence = z.enum(["Apache-2.0", "MIT", "CC0-1.0", "CC-BY-4.0", "OFL-1.1"]);

const Slot = z
  .strictObject({
    accepts: z.array(z.string().min(1)).min(1),
    count: z.number().int().positive(),
    minDur: positive,
    maxDur: positive,
  })
  .refine((slot) => slot.maxDur >= slot.minDur, {
    message: "must have a longest duration at least as long as its shortest.",
  });

export const TemplateManifest = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  author: z.string().min(1),
  licence: TemplateLicence,
  aspects: z.array(Aspect).min(1),
  durationRange: z.strictObject({ min: positive, max: positive }),
  sections: z
    .array(z.strictObject({ name: z.string().min(1), slots: z.array(Slot).min(1) }))
    .min(1),
  variables: z.array(
    z.strictObject({
      id: z.string().min(1),
      type: z.enum(["string", "number", "color", "boolean", "enum"]),
      label: z.string().min(1),
      default: z.union([z.string(), z.number(), z.boolean()]),
    }),
  ),
  vibes: z.array(Vibe).min(1),
  preview: z.string().regex(/\.gif$/),
  requires: z.array(z.string().min(1)),
});
export type TemplateManifest = z.infer<typeof TemplateManifest>;
