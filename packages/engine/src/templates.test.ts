import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addedTemplatesDir, loadTemplates, newerVersion, unsafeCss } from "./library.ts";
import { repoRoot } from "./paths.ts";
import { updateTemplates } from "./templates.ts";

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const travel = JSON.parse(
  readFileSync(join(repoRoot, "templates/travel-montage/template.json"), "utf8"),
) as Record<string, unknown>;
const gif = readFileSync(join(repoRoot, "templates/travel-montage/preview.gif"));

/** A style as the registry lists it, with files served from the fake GitHub below. */
function style(id: string, version: string, css: string, options: { tamper?: boolean } = {}) {
  const files: Record<string, string | Buffer> = {
    "template.json": JSON.stringify({ ...travel, id, name: `Style ${id}`, version }),
    "style.css": css,
    "README.md": `# ${id}\n\nA test style.\n`,
    "preview.gif": gif,
  };
  const entry = {
    id,
    name: `Style ${id}`,
    version,
    summary: "A test style.",
    madeBy: "photos",
    preview: `templates/${id}/preview.gif`,
    files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, sha256(data)])),
  };
  if (options.tamper) files["style.css"] = `${css}\n/* changed after listing */`;
  return { entry, files };
}

let server: Server;
let home: string;
const served = new Map<string, string | Buffer>();

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "ucut-templates-"));
  process.env.UCUT_HOME = home;
  const styles = [
    style("rooftop", "1.0.0", ".text-title { color: #fff; }"),
    style("travel-montage", "2.0.0", ".text-title { color: #ff0; }"),
    style("tampered", "1.0.0", ".text-title { color: #f00; }", { tamper: true }),
    style("tracker", "1.0.0", '.text-title { background: url("https://example.com/p.gif"); }'),
  ];
  for (const { entry, files } of styles) {
    for (const [name, data] of Object.entries(files)) {
      served.set(`/templates/${entry.id}/${name}`, data);
    }
  }
  served.set(
    "/registry/index.json",
    JSON.stringify({ schemaVersion: 1, templates: styles.map((entry) => entry.entry) }),
  );
  server = createServer((request, response) => {
    const body = served.get(request.url ?? "");
    if (body === undefined) response.writeHead(404).end();
    else response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.UCUT_REGISTRY_URL = `http://127.0.0.1:${port}/registry/index.json`;
});

afterAll(() => {
  server.close();
  delete process.env.UCUT_REGISTRY_URL;
  rmSync(home, { recursive: true, force: true });
});

describe("styles added after installing", () => {
  it("compares versions by number, not by text", () => {
    expect(newerVersion("1.10.0", "1.9.2")).toBe(true);
    expect(newerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(newerVersion("0.9.9", "1.0.0")).toBe(false);
  });

  it("refuses CSS that could reach the network or run code", () => {
    expect(unsafeCss(".a { color: red; }")).toBeUndefined();
    expect(unsafeCss('.a { background: URL ("x") }')).toMatch(/URL\(/);
    expect(unsafeCss('@import "x.css";')).toMatch(/@import/);
    // Closing the style tag would let a style run script in the app.
    expect(unsafeCss(".a{}</style><img src=x onerror=alert(1)>")).toMatch(/</);
    // Escapes and image-set could reach the network without writing "url(".
    expect(unsafeCss(".a { background: \\75rl(x) }")).toBeDefined();
    expect(unsafeCss('.a { background: image-set("https://example.com/p.png" 1x) }')).toBeDefined();
    for (const template of loadTemplates()) expect(unsafeCss(template.css)).toBeUndefined();
  });

  it("leaves out a half-written or broken added style without losing the rest", () => {
    mkdirSync(join(addedTemplatesDir(), "half.partial"), { recursive: true });
    mkdirSync(join(addedTemplatesDir(), "empty"), { recursive: true });
    mkdirSync(join(addedTemplatesDir(), "sneaky"), { recursive: true });
    writeFileSync(
      join(addedTemplatesDir(), "sneaky", "template.json"),
      JSON.stringify({ ...travel, id: "sneaky", name: "Sneaky" }),
    );
    writeFileSync(
      join(addedTemplatesDir(), "sneaky", "style.css"),
      ".a{}</style><script>1</script>",
    );
    const ids = loadTemplates().map((template) => template.manifest.id);
    expect(ids).toContain("travel-montage");
    expect(ids).not.toContain("sneaky");
    for (const name of ["half.partial", "empty", "sneaky"]) {
      rmSync(join(addedTemplatesDir(), name), { recursive: true, force: true });
    }
  });

  it("adds new and newer styles, checking every file, and leaves out the rest", async () => {
    const result = await updateTemplates();
    expect(result.added).toEqual(["Style rooftop"]);
    expect(result.updated).toEqual(["Style travel-montage"]);
    expect(result.skipped).toEqual([
      { id: "tampered", reason: "its style.css didn't match the checksum in the list" },
      { id: "tracker", reason: `its CSS uses "url(", which templates can't` },
    ]);
    expect(existsSync(join(addedTemplatesDir(), "tracker"))).toBe(false);
    const loaded = new Map(loadTemplates().map((template) => [template.manifest.id, template]));
    expect(loaded.get("rooftop")?.added).toBe(true);
    // The newer download takes over from the built-in style of the same name.
    expect(loaded.get("travel-montage")?.manifest.version).toBe("2.0.0");
    // A second run finds nothing new.
    expect(await updateTemplates()).toEqual({ added: [], updated: [], skipped: expect.any(Array) });
  });
});
