/** Regenerate with the Builder CLI committed in scripts/manifest-builder. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyOwnWorkspaceLinks } from "./apply-own-workspace-links.ts";
import { ManifestLineEndingNormalizer } from "./normalizeManifestLineEndings.ts";
import { syncBuilderBaselines } from "./sync-builder-baselines.ts";

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
  // The patches below read generated/ir/merged.ir.json, which is gitignored:
  // rebuild it so a new command from another checkout is never "missing".
  // Run this checkout's pinned CLI directly: `bun run manifest:compile` can
  // fall through to a global `manifest` shim that points at another checkout.
  const cli = join(
    CAPSULE_ROOT,
    "node_modules",
    "@angriff36",
    "manifest",
    "packages",
    "cli",
    "dist",
    "index.js",
  );
  const compiled = spawnSync(process.execPath, [cli, "compile", "--merge"], {
    stdio: "inherit",
    cwd: CAPSULE_ROOT,
  });
  if (compiled.status !== 0) return compiled.status ?? 1;
  // Make generated mutations refuse other-workspace record ids, refreshing
  // ownership digests.
  const touched = [...applyOwnWorkspaceLinks(CAPSULE_ROOT)];
  if (touched.length > 0) {
    console.log(
      `manifest-regen: applied generated runtime patches (${touched.join(", ")})`,
    );
  }
  // The patches moved ledger digests after Builder's own baseline prune.
  const synced = syncBuilderBaselines(CAPSULE_ROOT);
  if (synced.written + synced.removed > 0) {
    console.log(
      `manifest-regen: baseline store synced (${String(synced.written)} written, ${String(synced.removed)} removed)`,
    );
  }
  return 0;
}

if (import.meta.main) process.exit(regenerate(process.argv.slice(2)));
