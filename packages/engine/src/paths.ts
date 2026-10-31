import { homedir } from "node:os";
import { join } from "node:path";

/** Where the repository's templates and library live. */
export const repoRoot = new URL("../../../", import.meta.url).pathname;

/** U-Cut's data folder. Set UCUT_HOME to move it. */
export function homeDir(): string {
  return process.env.UCUT_HOME ?? join(homedir(), "Movies", "U-Cut");
}

export const jobsDir = () => join(homeDir(), "jobs");
export const storeDir = () => join(homeDir(), "store");
export const rendersDir = () => join(homeDir(), "renders");
