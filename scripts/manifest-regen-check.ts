/**
 * Pre-push gate: generated Builder output must be current before code leaves
 * this machine (owner policy 2026-07-19 — regen is a LOCAL gate; CI has no
 * Builder). Runs the Builder plan in dry-run and fails if anything is
 * pending: run `bun run manifest:regen`, commit the result, push again.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { builderEntrypoint } from "./manifest-regen.ts";
import { ManifestBuildDenyPin } from "./manifest-build-deny-pin.ts";

const CAPSULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync(
  "bun",
  [builderEntrypoint(), "generate", "convex", "--json"],
  { encoding: "utf-8" },
);

const stdout = result.stdout ?? "";
const jsonStart = stdout.indexOf("{");
if (result.status === null || jsonStart < 0) {
  console.error(
    result.stderr || "manifest-regen-check: Builder plan failed to run.",
  );
  process.exit(1);
}

const plan = JSON.parse(stdout.slice(jsonStart));
const denyPinned = new ManifestBuildDenyPin(CAPSULE_ROOT).isPinned();

/** Builder always wants to restore unsafe `manifest build` — ignore when deny is pinned. */
function isIntentionalManifestBuildDeny(path: string): boolean {
  return denyPinned && path === "package.json";
}

const modifications = (plan.modifications ?? []).filter(
  (path: string) => !isIntentionalManifestBuildDeny(path),
);
const conflicts = (plan.conflicts ?? []).filter((c: { path?: string }) => {
  if (!c.path || !isIntentionalManifestBuildDeny(c.path)) return true;
  return false;
});

const pending =
  (plan.additions?.length ?? 0) +
  modifications.length +
  (plan.deletions?.length ?? 0);

if (conflicts.length > 0) {
  console.error(
    `manifest-regen-check: ${conflicts.length} ownership conflict(s) — resolve before pushing:`,
  );
  for (const c of conflicts) console.error(`  ${c.path}: ${c.message}`);
  process.exit(2);
}
if (pending > 0) {
  console.error(
    `manifest-regen-check: generated output is stale (${pending} pending change(s)).`,
  );
  console.error(
    "Run: bun run manifest:regen   then commit the result and push again.",
  );
  process.exit(1);
}
console.log("manifest-regen-check: generated output is current.");
