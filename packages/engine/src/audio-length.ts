import { run } from "./exec.ts";

export async function musicLength(path: string): Promise<number> {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    path,
  ]);
  const length = Number(output.trim());
  if (!(length > 0)) throw new Error("U-Cut can't read that music file.");
  return length;
}
