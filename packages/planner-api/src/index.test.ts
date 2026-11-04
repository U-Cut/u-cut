import { readPrompt } from "@u-cut/planner-rules";
import { describe, expect, it } from "vitest";
import { ClaudeError, linesWanted, writeWithClaude } from "./index.ts";

function reply(body: Record<string, unknown>, status = 200) {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "request-id": "req_1" },
    });
  }) as typeof fetch;
  return { seen, fetchImpl };
}

const message = (text: string, stop = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text }],
  stop_reason: stop,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 20 },
});

const prompt = "a 15-second reel about my Goa trip, chill vibe";
const input = {
  prompt,
  request: readPrompt(prompt),
  scenes: ["beach", "food"],
  vibe: "chill" as const,
  duration: 15,
  apiKey: "sk-ant-test",
  baseURL: "https://claude.test",
};

describe("writing with Claude", () => {
  it("asks for structured lines and returns a script U-Cut can voice", async () => {
    const lines = {
      lines: [
        { text: "Goa slowed everything down.", scene: null },
        { text: "Warm sand and a long horizon.", scene: "beach" },
        { text: "Fish curry that tasted like sunshine.", scene: "food" },
        { text: "Already planning the way back.", scene: "mountains" },
      ],
    };
    const { seen, fetchImpl } = reply(message(JSON.stringify(lines)));
    const script = await writeWithClaude({ ...input, fetch: fetchImpl });
    expect(script.map((line) => line.text)).toEqual(lines.lines.map((line) => line.text));
    expect(script.map((line) => line.scene)).toEqual([null, "beach", "food", null]);
    expect(script.every((line) => line.voice === null && line.speed > 0)).toBe(true);
    const sent = seen[0]?.body ?? {};
    expect(sent.model).toBe("claude-opus-5-5");
    expect(sent.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect(JSON.stringify(sent.messages)).toContain("write 8 lines");
  });

  it("gives up cleanly when Claude declines", async () => {
    const { fetchImpl } = reply(message("", "refusal"));
    await expect(writeWithClaude({ ...input, fetch: fetchImpl })).rejects.toBeInstanceOf(
      ClaudeError,
    );
  });

  it("says the key was refused in plain words", async () => {
    const { fetchImpl } = reply(
      { type: "error", error: { type: "authentication_error", message: "x" } },
      401,
    );
    await expect(writeWithClaude({ ...input, fetch: fetchImpl })).rejects.toThrow(
      "Anthropic didn't accept the key.",
    );
  });

  it("aims for about as many lines as the rules lane", () => {
    expect(linesWanted(6)).toBe(3);
    expect(linesWanted(20)).toBe(11);
    expect(linesWanted(120)).toBe(14);
  });
});
