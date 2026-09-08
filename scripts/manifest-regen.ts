/** Regenerate with the Builder CLI committed in scripts/manifest-builder. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyOrgCapabilityCheckRole } from "./apply-org-capability-check-role.ts";

const CAPSULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function builderDir(): string {
  return resolve(CAPSULE_ROOT, "scripts", "manifest-builder");
}

export function builderEntrypoint(): string {
  const entry = join(builderDir(), "scripts", "builder.mts");
  if (!existsSync(entry)) {
    console.error(
      `Builder not found at ${entry}. Restore scripts/manifest-builder from this repository.`,
    );
    process.exit(1);
  }
  return entry;
}

export function runBuilder(args: string[]): number {
  const result = spawnSync(process.execPath, [builderEntrypoint(), ...args], {
    stdio: "inherit",
    cwd: CAPSULE_ROOT,
  });
  return result.status ?? 1;
}

if (import.meta.main) {
  const passthrough = process.argv.slice(2);
  const status = runBuilder(["generate", "convex", "--apply", ...passthrough]);
  if (status !== 0) process.exit(status);
  // Builder emits checkRole(user.role). Re-apply org capability enforcement
  // and refresh ownership digests so `bun run check` stays green.
  const touched = applyOrgCapabilityCheckRole(CAPSULE_ROOT);
  if (touched.length > 0) {
    console.log(
      `manifest-regen: applied org-capability checkRole patch (${touched.join(", ")})`,
    );
  }
  process.exit(0);
}
