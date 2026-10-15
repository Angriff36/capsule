/**
 * Authoritative `bun run check` runner.
 *
 * Same checks as before. Independent checks run together. Storybook, design
 * vocab, and Manifest fmt/scan/breaking skip only when the change set proves
 * they cannot be affected. CAPSULE_CHECK_FULL=1 turns skips off.
 */
import { resolve } from "node:path";
import { CheckGatePlan } from "./check-gate/CheckGatePlan";
import { CheckWaveRunner } from "./check-gate/CheckWaveRunner";

const root = resolve(import.meta.dir, "..");
const printPlan = process.argv.includes("--print-plan");

const plan = new CheckGatePlan(root);
if (plan.unproven) {
  console.log(`check: specialized skips off (${plan.unproven})`);
}

if (printPlan) {
  for (const wave of plan.waves) {
    console.log(wave.name);
    for (const task of wave.tasks) {
      if (task.skip?.skip)
        console.log(`  skip ${task.id} — ${task.skip.reason}`);
      else console.log(`  run  ${task.id}`);
    }
  }
  process.exit(0);
}

const runner = new CheckWaveRunner(root);

async function main(): Promise<number> {
  for (const wave of plan.waves) {
    const code = await runner.runWave(wave);
    if (code !== 0) return code;
  }
  console.log("check: ok");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
