/**
 * Pre-push gate: generated Builder output must be current before code leaves
 * this machine, using the repository-local Builder. Regenerates for real
 * and fails
 * only if that leaves tracked files changed: run `bun run manifest:regen`,
 * commit the result, push again.
 *
 * Running the exact same pipeline as `manifest:regen` and diffing the result
 * against git also covers the baseline store sync that follows Builder
 * (issue #375 began with authored post-passes over generated output; those
 * were removed 2026-09-25 when Manifest 3.6.58 generated the same behavior).
 */
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { regenerate } from "./manifest-regen.ts";
import { baselineDrift } from "./sync-builder-baselines.ts";

const CAPSULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const status = regenerate();
if (status !== 0) {
  console.error(
    "manifest-regen-check: Builder plan failed or has ownership conflicts (see above).",
  );
  process.exit(status);
}

// The baseline store must hold exactly the blobs the ledger names; leftovers
// piled up to ~970 files twice (Sep 11, Sep 24 2026).
const drift = baselineDrift(CAPSULE_ROOT);
if (drift.unreferenced.length > 0 || drift.missing.length > 0) {
  console.error(
    `manifest-regen-check: .builder/baselines differs from the ledger (${String(drift.unreferenced.length)} unreferenced, ${String(drift.missing.length)} missing).`,
  );
  process.exit(1);
}

// Scope the drift check to Builder-owned paths only (issue #375 follow-up):
// a bare `git status --porcelain` also reports any unrelated uncommitted
// work in the tree, which would falsely block a push that touches nothing
// Builder owns.
const ownershipPath = ".builder/ownership.json";
const ownership = JSON.parse(
  readFileSync(resolve(CAPSULE_ROOT, ownershipPath), "utf-8"),
) as { files?: Record<string, unknown> };
// .builder/baselines is listed so new or pruned blobs are committed with the
// ledger instead of accumulating as untracked files.
const ownedPaths = [
  ownershipPath,
  ".builder/baselines",
  ...Object.keys(ownership.files ?? {}),
];

const dirty = execFileSync(
  "git",
  ["status", "--porcelain", "--", ...ownedPaths],
  { cwd: CAPSULE_ROOT, encoding: "utf-8" },
);
if (dirty.trim().length > 0) {
  console.error(
    "manifest-regen-check: generated output was stale and has now been regenerated:",
  );
  console.error(dirty);
  console.error("Review the change, commit it, and push again.");
  process.exit(1);
}
console.log("manifest-regen-check: generated output is current.");
