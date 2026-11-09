import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The folder three levels above a module, as a real path. A URL's `pathname` keeps spaces as
 * "%20", which broke the app: it runs from "Application Support". So this decodes it.
 */
export const rootFrom = (moduleUrl: string) => fileURLToPath(new URL("../../../", moduleUrl));

/** Where the repository's templates and library live. */
export const repoRoot = rootFrom(import.meta.url);

/** U-Cut's data folder. Set UCUT_HOME to move it. */
export function homeDir(): string {
  return process.env.UCUT_HOME ?? join(homedir(), "Movies", "U-Cut");
}

export const jobsDir = () => join(homeDir(), "jobs");
export const storeDir = () => join(homeDir(), "store");
export const rendersDir = () => join(homeDir(), "renders");
