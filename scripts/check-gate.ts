/**
 * Authoritative `bun run check` runner.
 *
 * Same checks as before. Wave 0 is sequential and stops on the first failure.
 * Wave 0b emits proof files then checks them, before Manifest integration
 * reads those files. Wave 1 runs independent checks together. Wave 2 overlaps
 * at most two heavy jobs so coverage never shares the box with two Vite builds.
 * Storybook, design vocab, Manifest fmt/scan/breaking, and the registry pin
 * skip only when the change set proves they cannot be affected. Completeness,
 * wiring-drift, and Manifest integration always run. CAPSULE_CHECK_FULL=1
 * turns skips off.
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
