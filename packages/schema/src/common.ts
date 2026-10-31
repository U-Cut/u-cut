import { z } from "zod";

export const Aspect = z.enum(["9:16", "1:1", "16:9"]);
export type Aspect = z.infer<typeof Aspect>;

export const Vibe = z.enum(["chill", "hype", "cinematic", "nostalgic"]);
export type Vibe = z.infer<typeof Vibe>;

export const TransitionType = z.enum(["cut", "whip", "zoom", "fade"]);
export type TransitionType = z.infer<typeof TransitionType>;

export const unit = z.number().min(0).max(1);
export const seconds = z.number().min(0);
export const positive = z.number().positive();
