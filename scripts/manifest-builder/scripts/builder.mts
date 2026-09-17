#!/usr/bin/env tsx

import { runBuilderCli } from "../src/cli/main.ts";

const exitCode = await runBuilderCli(process.argv);
process.exitCode = exitCode;
