import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { type ReelRequest, scriptFrom } from "@u-cut/planner-rules";
import type { ScriptLine, Vibe } from "@u-cut/schema";
import { z } from "zod";

/** The model that writes scripts. A dozen short lines needs little thought, so effort stays low. */
export const claudeModel = "claude-opus-5-5";

export interface ClaudeScriptInput {
  /** The sentence someone typed. */
  prompt: string;
  request: ReelRequest;
  /** The scenes in their media, in the order the reel reaches them. */
  scenes: string[];
  vibe: Vibe;
  duration: number;
  apiKey: string;
  signal?: AbortSignal;
  /** For tests: where requests go. */
  baseURL?: string;
  fetch?: typeof fetch;
}

const Written = z.object({
  lines: z.array(
    z.object({
      text: z.string().describe("One spoken line, 3 to 8 words."),
      scene: z
        .string()
        .nullable()
        .describe("The scene id this line talks about, from the list given, or null."),
    }),
  ),
});

const wordsPerSecond = 3;
const wordsPerLine = 5.5;

/** About as many lines as the voice can read in the time, as the rules lane aims for. */
export function linesWanted(duration: number): number {
  return Math.max(3, Math.min(14, Math.round((duration * wordsPerSecond) / wordsPerLine)));
}

const system = `You write the spoken script for a short vertical video reel. The script is read aloud by a voice and shown word by word on screen, over the person's own photos or over moving colour.

Write lines a person would say out loud: plain, warm, specific and concrete. Each line is one short sentence or phrase of 3 to 8 words. The first line hooks the viewer, the middle lines move through the scenes, and the last line settles.

Use only what the person told you and the scenes listed. Don't invent names, places, numbers, prices or facts about real people. No hashtags, emoji, quotation marks, stage directions or lists. Don't repeat a line.

When a line is about one of the listed scenes, set "scene" to that scene's id, and reach the scenes in the order given. Otherwise set "scene" to null.`;

function requestText(input: ClaudeScriptInput): string {
  const scenes = input.scenes.length > 0 ? input.scenes.join(", ") : "none: there are no photos";
  return [
    `What they asked for: ${input.prompt}`,
    `What it's about: ${input.request.topic || input.request.subject || "not said"}`,
    `Vibe: ${input.vibe}`,
    `Length: about ${input.duration} seconds, so write ${linesWanted(input.duration)} lines.`,
    `Scenes in their photos, in order: ${scenes}`,
  ].join("\n");
}

function client(input: Pick<ClaudeScriptInput, "apiKey" | "baseURL" | "fetch">) {
  return new Anthropic({
    apiKey: input.apiKey,
    maxRetries: 1,
    timeout: 60_000,
    ...(input.baseURL ? { baseURL: input.baseURL } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
  });
}

/** Plain sentences for what went wrong, so the app can say it and fall back to the rules. */
export class ClaudeError extends Error {
  override name = "ClaudeError";
}

function explain(error: unknown): never {
  if (error instanceof ClaudeError) throw error;
  // The SDK parses the answer before returning it, so a refusal or a cut-off answer lands here.
  if (/structured output|JSON/i.test((error as Error).message ?? "")) {
    throw new ClaudeError(
      "Claude didn't finish a script U-Cut could use, so its own script stays.",
    );
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    throw new ClaudeError("Anthropic didn't accept the key. Check it and connect again.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    throw new ClaudeError(
      "Anthropic says you've reached your limit. Wait a minute, or check your plan.",
    );
  }
  if (error instanceof Anthropic.APIConnectionError) {
    throw new ClaudeError("U-Cut couldn't reach Anthropic. Check your internet connection.");
  }
  if (error instanceof Anthropic.APIError) {
    throw new ClaudeError(`Claude couldn't write the script (${error.status ?? "no status"}).`);
  }
  throw new ClaudeError(
    `Claude couldn't write the script. ${(error as Error).message ?? ""}`.trim(),
  );
}

/** Checks a key with the cheapest call there is: one page of one model. */
export async function checkClaudeKey(
  apiKey: string,
  options: Pick<ClaudeScriptInput, "baseURL" | "fetch"> = {},
): Promise<void> {
  try {
    await client({ apiKey, ...options }).models.list({ limit: 1 });
  } catch (error) {
    explain(error);
  }
}

/** Keeps only lines that read like the rules lane's, so the reel after them is unchanged. */
function usable(lines: { text: string; scene: string | null }[]): boolean {
  if (lines.length < 2) return false;
  const words = lines.map((line) => line.text.trim().split(/\s+/).filter(Boolean).length);
  return words.every((count) => count >= 1 && count <= 14);
}

/** Writes a reel's script with Claude. Anything off throws, and the caller keeps the rules' script. */
export async function writeWithClaude(input: ClaudeScriptInput): Promise<ScriptLine[]> {
  let response: Awaited<ReturnType<Anthropic["beta"]["messages"]["parse"]>>;
  try {
    response = await client(input).beta.messages.parse(
      {
        model: claudeModel,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(Written) },
        system,
        messages: [{ role: "user", content: requestText(input) }],
      },
      input.signal ? { signal: input.signal } : {},
    );
  } catch (error) {
    explain(error);
  }
  if (response.stop_reason === "refusal") {
    throw new ClaudeError("Claude didn't write this one. U-Cut's own script is still there.");
  }
  const written = response.parsed_output as z.infer<typeof Written> | null;
  if (!written || !usable(written.lines)) {
    throw new ClaudeError("Claude's script didn't fit a reel, so U-Cut kept its own.");
  }
  return scriptFrom(written.lines, input.vibe, input.scenes);
}
