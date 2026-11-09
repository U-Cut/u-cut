#!/usr/bin/env node
import { useBundledTools } from "./runtime.ts";

useBundledTools();
const { run } = await import("./cli.ts");
const { stopVision } = await import("./vision.ts");

const { code, stdout, stderr } = await run(process.argv.slice(2));
stopVision();
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = code;
