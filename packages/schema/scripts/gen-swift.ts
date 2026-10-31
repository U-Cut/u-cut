import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { BeatGrid, EditPlan, MediaItem, StyleRecipe, TemplateManifest } from "../src/index.ts";

export const swiftOutputPath = new URL(
  "../../../apps/mac/Sources/UCutSchema/Generated.swift",
  import.meta.url,
).pathname;

interface JsonSchema {
  type?: string | string[];
  const?: unknown;
  enum?: string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
}

const swiftKeywords = new Set(
  `associatedtype class deinit enum extension fileprivate func import init inout internal let open
  operator private precedencegroup protocol public rethrows static struct subscript typealias var
  break case catch continue default defer do else fallthrough for guard if in repeat return throw
  switch where while Any as await false is nil self Self super throws true try`.split(/\s+/),
);

function quoted(name: string): string {
  return swiftKeywords.has(name) ? `\`${name}\`` : name;
}

function typeName(key: string): string {
  if (key === "type") return "Kind"; // Swift reserves `Type` as a member name.
  const singular = key.length > 3 && key.endsWith("s") ? key.slice(0, -1) : key;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

function caseName(value: string): string {
  const words = value.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const name = words
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
  return /^\d/.test(name) ? `r${words.join("x")}` : quoted(name);
}

function indent(lines: string[], depth: number): string[] {
  return lines.map((line) => (line ? `${"    ".repeat(depth)}${line}` : line));
}

function renderEnum(name: string, values: string[]): string[] {
  return [
    `public enum ${name}: String, Codable, Sendable, Equatable {`,
    ...values.map((value) => `    case ${caseName(value)} = ${JSON.stringify(value)}`),
    "}",
  ];
}

/** Returns the Swift type for a schema, adding any nested declarations it needs to `nested`. */
function resolveType(key: string, schema: JsonSchema, nested: string[]): string {
  if (Array.isArray(schema.type)) return "ScalarValue";
  if (schema.anyOf) {
    const variants = schema.anyOf.filter((option) => option.type !== "null");
    if (variants.length > 1) return "ScalarValue";
    const [only] = variants;
    if (!only) throw new Error(`${key} has no usable type`);
    return resolveType(key, only, nested);
  }
  if (schema.const !== undefined) return "Int";
  if (schema.enum) {
    const name = typeName(key);
    nested.push(...renderEnum(name, schema.enum), "");
    return name;
  }
  switch (schema.type) {
    case "string":
      return "String";
    case "number":
      return "Double";
    case "integer":
      return "Int";
    case "boolean":
      return "Bool";
    case "array": {
      if (!schema.items) throw new Error(`${key} has no item type`);
      return `[${resolveType(key, schema.items, nested)}]`;
    }
    case "object": {
      const name = typeName(key);
      nested.push(...renderStruct(name, schema), "");
      return name;
    }
    default:
      throw new Error(`${key} has an unsupported schema: ${JSON.stringify(schema)}`);
  }
}

function isNullable(schema: JsonSchema): boolean {
  return schema.anyOf?.some((option) => option.type === "null") ?? false;
}

function renderStruct(name: string, schema: JsonSchema): string[] {
  const required = new Set(schema.required ?? []);
  const nested: string[] = [];
  const fields = Object.entries(schema.properties ?? {}).map(([key, property]) => {
    const swiftType = resolveType(key, property, nested);
    const optional = !required.has(key) || isNullable(property);
    return { key, optional, nullable: required.has(key) && isNullable(property), swiftType };
  });

  const declaration = (field: (typeof fields)[number]) =>
    `${quoted(field.key)}: ${field.swiftType}${field.optional ? "?" : ""}`;
  const lines = fields.map((field) => `public var ${declaration(field)}`);

  const initArguments = fields
    .map((field) => `${declaration(field)}${field.optional ? " = nil" : ""}`)
    .join(", ");
  lines.push(
    "",
    `public init(${initArguments}) {`,
    ...fields.map((field) => `    self.${field.key} = ${quoted(field.key)}`),
    "}",
  );

  // Synthesised encoding drops nil, but a nullable field must stay in the JSON as an explicit null.
  if (fields.some((field) => field.nullable)) {
    lines.push(
      "",
      "private enum CodingKeys: String, CodingKey {",
      ...fields.map((field) => `    case ${quoted(field.key)}`),
      "}",
      "",
      "public func encode(to encoder: any Encoder) throws {",
      "    var container = encoder.container(keyedBy: CodingKeys.self)",
      ...fields.map((field) => {
        const method = field.optional && !field.nullable ? "encodeIfPresent" : "encode";
        return `    try container.${method}(${field.key}, forKey: .${quoted(field.key)})`;
      }),
      "}",
    );
  }

  const body = nested.length > 0 ? [...nested, ...lines] : lines;
  return [`public struct ${name}: Codable, Sendable, Equatable {`, ...indent(body, 1), "}"];
}

const scalarValue = `public enum ScalarValue: Codable, Sendable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else {
            self = .string(try container.decode(String.self))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        }
    }
}`;

export function generateSwift(): string {
  const schemas = { MediaItem, StyleRecipe, EditPlan, TemplateManifest, BeatGrid };
  const structs = Object.entries(schemas).map(([name, schema]) => {
    const json = z.toJSONSchema(schema, { unrepresentable: "any" }) as JsonSchema;
    return renderStruct(name, json).join("\n");
  });
  const header = "// Generated from packages/schema by `pnpm gen:swift`. Do not edit by hand.";
  return `${[header, "", "import Foundation", "", scalarValue, ...structs.flatMap((s) => ["", s])].join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(dirname(swiftOutputPath), { recursive: true });
  writeFileSync(swiftOutputPath, generateSwift());
}
