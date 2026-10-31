import { z } from "zod";
import { Aspect, positive, seconds, TransitionType, unit, Vibe } from "./common.ts";

const adjustment = z.number().min(-1).max(1);

const Framing = z.strictObject({ x: unit, y: unit, scale: positive });

const Shot = z.strictObject({
  media: z.string().min(1),
  in: seconds,
  out: positive,
  start: seconds,
  end: positive,
  motion: z.strictObject({
    type: z.enum(["none", "push-in", "pull-out", "pan"]),
    from: Framing,
    to: Framing,
  }),
  crop: z.strictObject({ x: unit, y: unit, w: unit, h: unit }),
});

const Overlay = z.strictObject({
  text: z.string().min(1),
  start: seconds,
  end: positive,
  style: z.string().min(1),
});

const Sound = z.strictObject({ src: z.string().min(1), at: seconds, vol: z.number().min(0) });

export const EditPlan = z
  .strictObject({
    schemaVersion: z.literal(1),
    template: z.string().min(1),
    vibe: Vibe,
    aspect: Aspect,
    fps: z.number().int().positive(),
    seed: z.number().int().min(0),
    duration: positive,
    music: z.strictObject({
      src: z.string().min(1),
      bpm: positive.nullable(),
      start: seconds,
      length: positive,
    }),
    grade: z.strictObject({ temp: adjustment, contrast: adjustment, sat: adjustment }),
    voice: z.array(Sound.extend({ text: z.string().min(1) })).optional(),
    shots: z.array(Shot).min(1),
    texts: z.array(Overlay),
    transitions: z.array(z.strictObject({ type: TransitionType, at: seconds, duration: seconds })),
    sfx: z.array(Sound),
  })
  .superRefine((plan, ctx) => {
    plan.shots.forEach((shot, index) => {
      const path = ["shots", index];
      const previous = plan.shots[index - 1];
      if (shot.out <= shot.in) {
        ctx.addIssue({
          code: "custom",
          path,
          message: "must end its source range after it starts.",
        });
      } else if (shot.end <= shot.start) {
        ctx.addIssue({ code: "custom", path, message: "must end after it starts." });
      } else if (shot.end > plan.duration) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `runs past the end of the reel (${plan.duration} s).`,
        });
      } else if (previous && shot.start < previous.end) {
        ctx.addIssue({ code: "custom", path, message: "overlaps the shot before it." });
      }
    });
    plan.texts.forEach((text, index) => {
      if (text.end <= text.start || text.end > plan.duration) {
        ctx.addIssue({
          code: "custom",
          path: ["texts", index],
          message: "must end after it starts and within the reel.",
        });
      }
    });
  });
export type EditPlan = z.infer<typeof EditPlan>;
