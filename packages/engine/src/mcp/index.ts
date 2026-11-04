import { readFileSync } from "node:fs";
import { serveMcp } from "./protocol.ts";
import { tools } from "./tools.ts";

const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

const instructions = `U-Cut makes finished vertical reels and demos on this computer, rendered with HyperFrames.

Start with status, then catalog. Typical work:
- Photos and clips: read_media to see the scenes, plan_reel, then render. To change the cut, edit the plan from plan_reel or get_plan and save it with save_plan before render.
- A sentence or your own script: write_reel. Write the lines yourself, 3 to 8 words each, and match them to scenes from read_media.
- A screen recording: read_recording, choose moments, then make_demo with the product's name and colour.
- A reel someone has open in the U-Cut app: they give you a link from "Give this reel to your assistant". Use app_reel to read it and app_change to change it; the change shows up in their window.

For motion beyond U-Cut's styles, every job has a HyperFrames project/ folder. Edit it with the HyperFrames skills, then render with project: true.

Renders take about as long as the reel. Never upload or share the person's media.`;

/** `ucut mcp`: standard output belongs to the protocol, so anything else printed goes to stderr. */
export async function runMcp(): Promise<void> {
  const toStderr = (...args: unknown[]) => process.stderr.write(`${args.map(String).join(" ")}\n`);
  console.log = toStderr;
  console.info = toStderr;
  console.warn = toStderr;
  console.debug = toStderr;
  await serveMcp(tools, { name: "u-cut", title: "U-Cut", version, instructions });
}
