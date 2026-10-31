import type { z } from "zod";

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, part) => {
    if (typeof part === "number") return `${text}[${part}]`;
    return text ? `${text}.${String(part)}` : String(part);
  }, "");
}

function describe(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined ? "is missing." : `must be a ${issue.expected}.`;
    case "invalid_value":
      return `must be one of: ${issue.values.join(", ")}.`;
    case "too_big":
      return issue.origin === "array"
        ? `must have at most ${issue.maximum} items.`
        : `must be at most ${issue.maximum}.`;
    case "too_small":
      return issue.origin === "array"
        ? `must have at least ${issue.minimum} items.`
        : `must be at least ${issue.minimum}.`;
    case "unrecognized_keys":
      return `has a field it doesn't expect: ${issue.keys.map((key) => `"${key}"`).join(", ")}.`;
    case "invalid_format":
      return "isn't in the expected format.";
    case "invalid_union":
      return "must be a text, number or true/false value.";
    default:
      return issue.message;
  }
}

/** Checks data against a schema and reports problems as plain sentences. */
export function validate<T>(schema: z.ZodType<T>, data: unknown, label: string): Validated<T> {
  const result = schema.safeParse(data, { reportInput: true });
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = formatPath(issue.path);
      return path ? `${label}: ${path} ${describe(issue)}` : `${label} ${describe(issue)}`;
    }),
  };
}
