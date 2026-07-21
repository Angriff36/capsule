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
 *
 * Before generate, Capsule's exact `@angriff36/manifest` pin is synced into
 * the sibling Builder checkout so regen never silently uses a stale
 * projection (no cross-repo GitHub PAT required).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BuilderManifestPinSync } from "./builder-manifest-pin.ts";

const CAPSULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function builderDir(): string {
  return process.env.BUILDER_DIR ?? resolve(CAPSULE_ROOT, "..", "builder");
}

export function builderEntrypoint(): string {
  const entry = join(builderDir(), "scripts", "builder.mts");
  if (!existsSync(entry)) {
    console.error(
      `Builder not found at ${entry}. Clone Angriff36/builder as a sibling of this repo or set BUILDER_DIR.`,
    );
    process.exit(1);
  }
  return entry;
}

export function syncBuilderManifestPin(): void {
  new BuilderManifestPinSync(
    CAPSULE_ROOT,
    builderDir(),
  ).ensureBuilderMatchesCapsule();
}

export function runBuilder(args: string[]): number {
  syncBuilderManifestPin();
  const result = spawnSync("bun", [builderEntrypoint(), ...args], {
    stdio: "inherit",
  });
  return result.status ?? 1;
}

if (import.meta.main) {
  const passthrough = process.argv.slice(2);
  process.exit(runBuilder(["generate", "convex", "--apply", ...passthrough]));
}
