/** Verify committed generated output with the repository-local Builder CLI. */
import { spawnSync } from "node:child_process";
import { builderEntrypoint } from "./manifest-regen.ts";

const result = spawnSync(
  process.execPath,
  [builderEntrypoint(), "generate", "convex", "--json"],
  { encoding: "utf-8" },
);

const stdout = result.stdout ?? "";
const jsonStart = stdout.indexOf("{");
if ((result.status !== 0 && result.status !== 2) || jsonStart < 0) {
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
if (result.status !== 0) {
  console.error("manifest-regen-check: Builder returned an unsuccessful plan.");
  process.exit(1);
}
if (
  pending > 0 ||
  (plan.ledgerRepairs?.length ?? 0) > 0 ||
  plan.dependencyRequirementsChanged
) {
  console.error(
    `manifest-regen-check: generated output is stale (${pending} pending change(s)).`,
  );
  console.error(
    "Run: bun run manifest:regen   then commit the result and push again.",
  );
  process.exit(1);
}
console.log("manifest-regen-check: generated output is current.");
