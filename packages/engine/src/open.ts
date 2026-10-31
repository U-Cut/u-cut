import { platform } from "node:os";
import { run } from "./exec.ts";

export default async function open(url: string) {
  const command = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  await run(command, [url]).catch(() => {
    // The address is already printed, so people can open it by hand.
  });
}
