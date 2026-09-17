/**
 * Pre-push gate: generated Builder output must be current before code leaves
 * this machine (owner policy 2026-07-19 — regen is a LOCAL gate; CI has no
 * Builder). Regenerates for real, including authored post-passes, and fails
 * only if that leaves tracked files changed: run `bun run manifest:regen`,
 * commit the result, push again.
 *
 * A pure dry-run of the Builder plan is not enough (issue #375): the Builder
 * IR does not know about authored post-passes like
 * applyEventServiceStyleReferenceGuard, so a dry-run always reports their
 * patched lines in convex/mutations.ts as spuriously "pending" — permanently
 * blocking every push once such a patch lands on main. Running the exact
 * same pipeline as `manifest:regen` and diffing the result against git is
 * the only way to tell real drift from that false positive.
 */
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyEventServiceStyleReferenceGuard } from "./apply-event-service-style-reference-guard.ts";
import { applyOrgCapabilityCheckRole } from "./apply-org-capability-check-role.ts";
import { runBuilder } from "./manifest-regen.ts";
import { ManifestLineEndingNormalizer } from "./normalizeManifestLineEndings.ts";

const CAPSULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rewritten = new ManifestLineEndingNormalizer(CAPSULE_ROOT).normalize();
if (rewritten > 0) {
  console.log(
    `manifest-regen-check: normalized ${rewritten} .manifest file(s) to LF`,
  );
}

const status = runBuilder(["generate", "convex", "--apply"]);
if (status !== 0) {
  console.error(
    "manifest-regen-check: Builder plan failed or has ownership conflicts (see above).",
  );
  process.exit(status);
}
applyOrgCapabilityCheckRole(CAPSULE_ROOT);
applyEventServiceStyleReferenceGuard(CAPSULE_ROOT);

const dirty = execSync("git status --porcelain", {
  cwd: CAPSULE_ROOT,
  encoding: "utf-8",
});
if (dirty.trim().length > 0) {
  console.error(
    "manifest-regen-check: generated output was stale and has now been regenerated:",
  );
  console.error(dirty);
  console.error("Review the change, commit it, and push again.");
  process.exit(1);
}
console.log("manifest-regen-check: generated output is current.");
