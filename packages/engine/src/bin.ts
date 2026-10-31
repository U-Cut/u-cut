#!/usr/bin/env node
import { run } from "./cli.ts";

const { code, stdout, stderr } = await run(process.argv.slice(2));
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = code;
