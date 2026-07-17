/**
 * Capsule regeneration — the only supported path for Builder-owned output.
 * Plans via Builder; applies only when the plan is conflict-free.
 * Pass Builder flags after `--`, e.g. `bun run manifest:regen -- --install`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const passthrough = process.argv.slice(2);
const localBuilder = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "builder.cmd" : "builder",
);
const builderCmd = existsSync(localBuilder) ? localBuilder : "builder";

const result = spawnSync(
  builderCmd,
  ["generate", "convex", "--apply", ...passthrough],
  {
    stdio: "inherit",
    shell: true,
  },
);

process.exit(result.status ?? 1);
