/**
 * Pre-push gate: generated Builder output must be current before code leaves
 * this machine (owner policy 2026-07-19 — regen is a LOCAL gate; CI has no
 * Builder). Runs the Builder plan in dry-run and fails if anything is
 * pending: run `bun run manifest:regen`, commit the result, push again.
 */
import { spawnSync } from "node:child_process";
import { builderEntrypoint } from "./manifest-regen.ts";

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
const pending =
  (plan.additions?.length ?? 0) +
  (plan.modifications?.length ?? 0) +
  (plan.deletions?.length ?? 0);
const conflicts = plan.conflicts?.length ?? 0;

if (conflicts > 0) {
  console.error(
    `manifest-regen-check: ${conflicts} ownership conflict(s) — resolve before pushing:`,
  );
  for (const c of plan.conflicts) console.error(`  ${c.path}: ${c.message}`);
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
