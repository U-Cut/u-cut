import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const engine = fileURLToPath(new URL("../bin.ts", import.meta.url));
const samples = fileURLToPath(new URL("../../../../library/samples", import.meta.url));

/** A real `ucut mcp`, talked to the way Claude Code talks to it. */
describe("ucut mcp", () => {
  let home: string;
  let server: ChildProcessWithoutNullStreams;
  let next = 1;
  const replies = new Map<number, Record<string, unknown>>();

  function call(method: string, params: Record<string, unknown> = {}) {
    const id = next++;
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const started = Date.now();
      const look = () => {
        const reply = replies.get(id);
        if (reply) return resolve(reply);
        if (Date.now() - started > 170_000) return reject(new Error(`No reply to ${method}`));
        setTimeout(look, 100);
      };
      look();
    });
  }

  async function tool(name: string, args: Record<string, unknown>) {
    const reply = await call("tools/call", { name, arguments: args });
    const result = reply.result as {
      isError?: boolean;
      content: { text: string }[];
      structuredContent?: unknown;
    };
    if (result.isError) throw new Error(result.content[0]?.text);
    return result.structuredContent as Record<string, unknown>;
  }

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "ucut-mcp-"));
    server = spawn(process.execPath, ["--conditions=source", "--import", "tsx", engine, "mcp"], {
      env: { ...process.env, UCUT_HOME: home, UCUT_SECRETS: "file" },
    });
    let buffer = "";
    server.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        // Anything that isn't JSON-RPC on standard output would break every client.
        const message = JSON.parse(line) as { id?: number };
        if (typeof message.id === "number") replies.set(message.id, message);
      }
    });
    await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test" },
    });
  });

  afterAll(() => {
    server.kill();
    rmSync(home, { recursive: true, force: true });
  });

  it("plans a reel, takes an edited plan, and renders it", async () => {
    const planned = await tool("plan_reel", {
      paths: [samples],
      vibe: "hype",
      duration: 6,
      title: "First",
    });
    const job = planned.job as string;
    expect(existsSync(join(job, "plan.json"))).toBe(true);
    const plan = planned.plan as { texts: { text: string }[] };
    expect(plan.texts[0]?.text).toBe("First");

    const edited = {
      ...plan,
      texts: plan.texts.map((text) => ({ ...text, text: "Edited by an assistant" })),
    };
    const saved = await tool("save_plan", { job, plan: edited });
    expect(saved.summary).toMatchObject({ words: ["Edited by an assistant"] });
    await expect(
      tool("save_plan", { job, plan: { ...edited, shots: [{ media: "nobody" }] } }),
    ).rejects.toThrow();

    const output = join(home, "edited.mp4");
    const rendered = await tool("render", { job, output, quality: "draft" });
    expect(rendered.output).toBe(output);
    expect(existsSync(output)).toBe(true);
  });

  it("keeps a hand-edited project: renders it as edited, and won't overwrite it by surprise", async () => {
    const planned = await tool("plan_reel", { paths: [samples], duration: 6, seed: 2 });
    const job = planned.job as string;
    // The project is there as soon as the reel is planned, ready for the HyperFrames skills.
    const index = join(job, "project", "index.html");
    expect(existsSync(index)).toBe(true);
    writeFileSync(
      index,
      readFileSync(index, "utf8").replace("</body>", "<!-- an assistant was here --></body>"),
    );
    await expect(
      tool("render", { job, output: join(home, "lost.mp4"), quality: "draft" }),
    ).rejects.toThrow("has edits");
    const output = join(home, "by-hand.mp4");
    await tool("render", { job, output, quality: "draft", project: true });
    expect(existsSync(output)).toBe(true);
    expect(readFileSync(index, "utf8")).toContain("an assistant was here");
  });
});
