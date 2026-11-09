import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./check-dco.sh", import.meta.url));

describe("check-dco", () => {
  let repo: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  const check = (base: string) =>
    spawnSync("bash", [script, base], { cwd: repo, encoding: "utf8" });

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "ucut-dco-"));
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Ada Test");
    git("config", "user.email", "ada@example.com");
    git("commit", "-q", "--allow-empty", "-m", "base");
    git("tag", "base");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("accepts a signed commit", () => {
    git("commit", "-q", "--allow-empty", "-s", "-m", "signed");
    expect(check("base").status).toBe(0);
  });

  it("rejects an unsigned commit and says how to fix it", () => {
    git("commit", "-q", "--allow-empty", "-m", "unsigned");
    const result = check("base");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("has no sign-off from Ada Test <ada@example.com>");
    expect(result.stderr).toContain("git commit --amend -s");
  });

  it("rejects a sign-off from someone other than the author", () => {
    git("commit", "-q", "--allow-empty", "-m", "signed by another\n\nSigned-off-by: Bob <b@x.io>");
    expect(check("base").status).toBe(1);
  });
});
