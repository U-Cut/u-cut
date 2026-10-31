import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { run } from "./cli.ts";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

describe("ucut", () => {
  it("prints its version", async () => {
    const result = await run(["--version"]);
    expect(result).toEqual({ code: 0, stdout: `${version}\n`, stderr: "" });
  });

  it("explains an unknown command in a plain sentence", async () => {
    const result = await run(["frobnicate"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      'U-Cut doesn\'t have a command called "frobnicate". Run `ucut --help` to see what it can do.\n',
    );
  });

  it("lists what it can do", async () => {
    const result = await run(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ucut");
  });
});
