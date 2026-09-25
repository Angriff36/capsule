/** Regenerate with the Builder CLI committed in scripts/manifest-builder. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyAggregateCompositeIndexes } from "./apply-aggregate-composite-indexes.ts";
import { applyOrgCapabilityCheckRole } from "./apply-org-capability-check-role.ts";
import { applyEventServiceStyleReferenceGuard } from "./apply-event-service-style-reference-guard.ts";
import { ManifestLineEndingNormalizer } from "./normalizeManifestLineEndings.ts";

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
  new ManifestLineEndingNormalizer(CAPSULE_ROOT).normalize();
  const result = spawnSync(process.execPath, [builderEntrypoint(), ...args], {
    stdio: "inherit",
    cwd: CAPSULE_ROOT,
  });
  return result.status ?? 1;
}

export function regenerate(passthrough: string[] = []): number {
  const status = runBuilder(["generate", "convex", "--apply", ...passthrough]);
  if (status !== 0) return status;
  // Builder emits checkRole(user.role). Re-apply org capability enforcement
  // and the service-style reference guard, and point aggregate sums at their
  // composite indexes, refreshing ownership digests.
  const touched = [
    ...applyOrgCapabilityCheckRole(CAPSULE_ROOT),
    ...applyEventServiceStyleReferenceGuard(CAPSULE_ROOT),
    ...applyAggregateCompositeIndexes(CAPSULE_ROOT),
  ];
  if (touched.length > 0) {
    console.log(
      `manifest-regen: applied generated runtime patches (${touched.join(", ")})`,
    );
  }
  return 0;
}

if (import.meta.main) process.exit(regenerate(process.argv.slice(2)));
