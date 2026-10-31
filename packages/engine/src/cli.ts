import { readFileSync } from "node:fs";
import { defineCommand, renderUsage } from "citty";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const main = defineCommand({
  meta: {
    name: "ucut",
    version,
    description: "Turn your photos, clips and recordings into finished reels on your own Mac.",
  },
});

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function run(argv: string[]): Promise<RunResult> {
  const [first] = argv;
  if (first === "--version" || first === "-v") {
    return { code: 0, stdout: `${version}\n`, stderr: "" };
  }
  if (first === undefined || first === "--help" || first === "-h") {
    return { code: 0, stdout: `${await renderUsage(main)}\n`, stderr: "" };
  }
  return {
    code: 1,
    stdout: "",
    stderr: `U-Cut doesn't have a command called "${first}". Run \`ucut --help\` to see what it can do.\n`,
  };
}
