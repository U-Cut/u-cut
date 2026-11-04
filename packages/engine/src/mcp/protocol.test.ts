import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { serveMcp, tool } from "./protocol.ts";

/** A pretend client: sends lines, collects every message the server writes back. */
function connect() {
  const input = new PassThrough();
  const output = new PassThrough();
  const received: Record<string, unknown>[] = [];
  let buffer = "";
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line) received.push(JSON.parse(line));
  });
  const slow = tool({
    name: "slow",
    title: "Slow",
    description: "Waits, reporting progress, until cancelled or done.",
    input: z.object({ steps: z.number().int().min(1).max(5) }),
    async run({ steps }, context) {
      for (let step = 1; step <= steps; step += 1) {
        await new Promise((done) => setTimeout(done, 220));
        if (context.signal.aborted) throw new Error("Cancelled");
        context.progress(step / steps, `step ${step}`);
      }
      return { finished: steps };
    },
  });
  const broken = tool({
    name: "broken",
    title: "Broken",
    description: "Always fails.",
    input: z.object({}),
    async run() {
      throw new Error("The engine isn't installed.");
    },
  });
  const done = serveMcp(
    [slow, broken],
    { name: "u-cut", title: "U-Cut", version: "1.2.3", instructions: "Use it." },
    { input, output },
  );
  const send = (message: unknown) => input.write(`${JSON.stringify(message)}\n`);
  const reply = async (id: number) => {
    for (let wait = 0; wait < 100; wait += 1) {
      const found = received.find((message) => message.id === id);
      if (found) return found as { result?: Record<string, unknown>; error?: { code: number } };
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`No reply to ${id}`);
  };
  return { send, reply, received, input, done };
}

describe("the MCP server", () => {
  it("agrees on a protocol version and introduces itself", async () => {
    const client = connect();
    client.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    });
    client.send({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    const first = await client.reply(1);
    expect(first.result).toMatchObject({
      protocolVersion: "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "u-cut", version: "1.2.3" },
      instructions: "Use it.",
    });
    expect((await client.reply(2)).result?.protocolVersion).toBe("2025-06-18");
    client.input.end();
    await client.done;
  });

  it("lists tools with JSON Schema inputs", async () => {
    const client = connect();
    client.send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const { result } = await client.reply(1);
    const [slow] = (result?.tools ?? []) as {
      name: string;
      inputSchema: Record<string, unknown>;
    }[];
    expect(slow?.name).toBe("slow");
    expect(slow?.inputSchema).toMatchObject({ type: "object", required: ["steps"] });
    expect(slow?.inputSchema).not.toHaveProperty("$schema");
    client.input.end();
  });

  it("answers bad arguments and failures as tool errors, in plain words", async () => {
    const client = connect();
    client.send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "slow", arguments: { steps: 9 } },
    });
    client.send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "broken", arguments: {} },
    });
    client.send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "missing" } });
    client.send({ jsonrpc: "2.0", id: 4, method: "resources/read" });
    const bad = await client.reply(1);
    expect(bad.result?.isError).toBe(true);
    expect(JSON.stringify(bad.result)).toContain("steps");
    const broken = await client.reply(2);
    expect(broken.result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: "The engine isn't installed." }],
    });
    expect((await client.reply(3)).error?.code).toBe(-32602);
    expect((await client.reply(4)).error?.code).toBe(-32601);
    client.input.end();
  });

  it("reports progress only when asked, and returns structured results", async () => {
    const client = connect();
    client.send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "slow", arguments: { steps: 2 }, _meta: { progressToken: "p1" } },
    });
    const done = await client.reply(1);
    expect(done.result?.structuredContent).toEqual({ finished: 2 });
    const progress = client.received.filter(
      (message) => message.method === "notifications/progress",
    );
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toMatchObject({
      params: { progressToken: "p1", progress: 100, total: 100 },
    });
    client.input.end();
  });

  it("stops work the client cancels, without replying to it", async () => {
    const client = connect();
    client.send({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "slow", arguments: { steps: 5 } },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    client.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 } });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(client.received.some((message) => message.id === 7)).toBe(false);
    client.input.end();
  });

  it("says when a line isn't JSON, and keeps going", async () => {
    const client = connect();
    client.input.write("not json\n");
    client.send({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect((await client.reply(1)).result).toEqual({});
    expect(client.received[0]).toMatchObject({ id: null, error: { code: -32700 } });
    client.input.end();
  });
});

describe("a client that goes away", () => {
  it("doesn't take the server down with it", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const done = serveMcp(
      [],
      { name: "u-cut", title: "U-Cut", version: "1", instructions: "" },
      { input, output },
    );
    output.destroy(new Error("EPIPE"));
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`);
    input.end();
    await expect(done).resolves.toBeUndefined();
  });
});
