// The part of the Model Context Protocol U-Cut serves: tools over standard input and output.
// Messages are JSON-RPC 2.0, one per line. Nothing else may be written to standard output.
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { z } from "zod";

export interface ToolContext {
  /** Reports progress when the client asked for it. Progress runs from 0 to 1. */
  progress(fraction: number, message?: string): void;
  signal: AbortSignal;
}

export interface Tool<Input extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: Input;
  /** Tools that only read say so, so clients can run them without asking. */
  readOnly?: boolean;
  /** Tools that may reach a service the person connected, which can cost them money. */
  openWorld?: boolean;
  run(args: z.infer<Input>, context: ToolContext): Promise<unknown>;
}

/** Keeps `run`'s arguments typed by each tool's own schema. */
export const tool = <Input extends z.ZodType>(definition: Tool<Input>): Tool => definition as Tool;

export interface ServerInfo {
  name: string;
  title: string;
  version: string;
  instructions: string;
}

/** Newest first. A client asking for one of these gets it; anything else gets the newest. */
export const protocolVersions = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Id = string | number;
interface Message {
  jsonrpc?: string;
  id?: Id | null;
  method?: string;
  params?: Record<string, unknown>;
}

const errors = { parse: -32700, invalid: -32600, method: -32601, params: -32602 };

/** Plain words for a schema mismatch, which is what an assistant can act on. */
export function explainIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`)
    .join("; ");
}

export function inputSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _version, ...rest } = z.toJSONSchema(schema, { io: "input" }) as Record<
    string,
    unknown
  >;
  return rest;
}

function textOf(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}

export function serveMcp(
  tools: Tool[],
  info: ServerInfo,
  io: { input: Readable; output: Writable } = { input: process.stdin, output: process.stdout },
): Promise<void> {
  const running = new Map<Id, AbortController>();
  let closed = false;
  // A client that goes away mid-reply closes the pipe. That ends the session, not the program.
  io.output.on("error", () => {
    closed = true;
    for (const controller of running.values()) controller.abort(new Error("Cancelled"));
  });
  const send = (message: Record<string, unknown>) => {
    if (closed) return;
    io.output.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  };
  const reply = (id: Id, result: unknown) => send({ id, result });
  const fail = (id: Id | null, code: number, message: string) =>
    send({ id, error: { code, message } });

  async function call(id: Id, params: Record<string, unknown>) {
    const name = String(params.name ?? "");
    const found = tools.find((candidate) => candidate.name === name);
    if (!found) return fail(id, errors.params, `U-Cut has no tool called "${name}".`);
    const parsed = found.input.safeParse(params.arguments ?? {});
    if (!parsed.success) {
      return reply(id, {
        isError: true,
        content: [
          { type: "text", text: `Those arguments don't fit: ${explainIssues(parsed.error)}` },
        ],
      });
    }
    const meta = (params._meta ?? {}) as { progressToken?: Id };
    const controller = new AbortController();
    running.set(id, controller);
    let last = 0;
    let highest = -1;
    const context: ToolContext = {
      signal: controller.signal,
      progress(fraction, message) {
        if (meta.progressToken === undefined) return;
        // The protocol says progress must only go up, and five updates a second is plenty.
        const progress = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
        const now = Date.now();
        if (progress <= highest || (now - last < 200 && progress < 100)) return;
        last = now;
        highest = progress;
        send({
          method: "notifications/progress",
          params: {
            progressToken: meta.progressToken,
            progress,
            total: 100,
            ...(message ? { message } : {}),
          },
        });
      },
    };
    try {
      const result = await found.run(parsed.data, context);
      if (controller.signal.aborted) return;
      reply(id, {
        content: [{ type: "text", text: textOf(result) }],
        ...(result && typeof result === "object" && !Array.isArray(result)
          ? { structuredContent: result }
          : {}),
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      reply(id, { isError: true, content: [{ type: "text", text: (error as Error).message }] });
    } finally {
      running.delete(id);
    }
  }

  function handle(message: Message) {
    const { id, method, params = {} } = message;
    const isRequest = id !== undefined && id !== null;
    if (typeof method !== "string") {
      if (isRequest) fail(id, errors.invalid, "That message has no method.");
      return;
    }
    if (!isRequest) {
      if (method === "notifications/cancelled") {
        running.get(params.requestId as Id)?.abort(new Error("Cancelled"));
      }
      return;
    }
    switch (method) {
      case "initialize": {
        const asked = String(params.protocolVersion ?? "");
        return reply(id, {
          protocolVersion: protocolVersions.includes(asked) ? asked : protocolVersions[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: info.name, title: info.title, version: info.version },
          instructions: info.instructions,
        });
      }
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, {
          tools: tools.map((entry) => ({
            name: entry.name,
            title: entry.title,
            description: entry.description,
            inputSchema: inputSchema(entry.input),
            annotations: {
              title: entry.title,
              readOnlyHint: entry.readOnly === true,
              openWorldHint: entry.openWorld === true,
            },
          })),
        });
      case "tools/call":
        void call(id, params);
        return;
      case "resources/list":
        return reply(id, { resources: [] });
      case "prompts/list":
        return reply(id, { prompts: [] });
      default:
        return fail(id, errors.method, `U-Cut doesn't answer "${method}".`);
    }
  }

  return new Promise((resolve) => {
    const lines = createInterface({ input: io.input, crlfDelay: Number.POSITIVE_INFINITY });
    lines.on("line", (line) => {
      if (!line.trim()) return;
      let message: Message;
      try {
        message = JSON.parse(line) as Message;
      } catch {
        return fail(null, errors.parse, "That wasn't JSON.");
      }
      if (Array.isArray(message)) {
        for (const each of message as Message[]) handle(each);
      } else {
        handle(message);
      }
    });
    lines.on("close", () => {
      for (const controller of running.values()) controller.abort(new Error("Cancelled"));
      resolve();
    });
  });
}
