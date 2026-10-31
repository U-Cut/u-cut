import { describe, expect, it } from "vitest";
import { run } from "./exec.ts";

describe("run", () => {
  it("returns what a command prints", async () => {
    await expect(run("sh", ["-c", "echo hello"])).resolves.toBe("hello\n");
  });

  it("gives the tool's own reason when it fails", async () => {
    const failing = run("sh", ["-c", "echo noise >&2; echo 'No audio stream' >&2; exit 3"]);
    await expect(failing).rejects.toThrow("sh stopped with code 3: noise / No audio stream");
  });

  it("stays short when a tool fails with nothing to say", async () => {
    await expect(run("sh", ["-c", "exit 2"])).rejects.toThrow(/^sh stopped with code 2\.$/);
  });

  it("explains a command that isn't installed", async () => {
    await expect(run("no-such-tool-here", [])).rejects.toThrow("Couldn't run no-such-tool-here");
  });
});
