/**
 * Capsule regeneration — the only supported path for Builder-owned output.
 * Plans via Builder; applies only when the plan is conflict-free.
 * Pass Builder flags after `--`, e.g. `bun run manifest:regen -- --install`.
 *
 * Builder is resolved as a LOCAL TOOL, not a package dependency: the
 * `file:../builder` dependency broke CI (`bun install` cannot resolve it on
 * GitHub runners, which have no sibling checkout). Regeneration is a local
 * pre-push gate instead — see scripts/manifest-regen-check.ts and
 * .githooks/pre-push.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export function builderEntrypoint(): string {
  const builderDir =
    process.env.BUILDER_DIR ?? resolve(process.cwd(), "..", "builder");
  const entry = join(builderDir, "scripts", "builder.mts");
  if (!existsSync(entry)) {
    console.error(
      `Builder not found at ${entry}. Clone Angriff36/builder as a sibling of this repo or set BUILDER_DIR.`,
    );
    process.exit(1);
  }
  return entry;
}

export function runBuilder(args: string[]): number {
  const result = spawnSync("bun", [builderEntrypoint(), ...args], {
    stdio: "inherit",
  });
  return result.status ?? 1;
}

if (import.meta.main) {
  const passthrough = process.argv.slice(2);
  process.exit(runBuilder(["generate", "convex", "--apply", ...passthrough]));
}
