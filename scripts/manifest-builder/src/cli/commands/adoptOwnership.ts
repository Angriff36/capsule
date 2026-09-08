import { OwnershipAdopter } from "../../lib/manifest-project/adoptOwnership.ts";
import { readOption, resolveApplyMode, wantsJsonOutput } from "../args.ts";
import { formatAdoptDryRun } from "../planSummary.ts";
import { resolveProjectName, resolveTargetDir } from "../targetDefaults.ts";

export interface AdoptOwnershipOptions {
  argv: string[];
}

export async function runAdoptOwnershipCommand({
  argv,
}: AdoptOwnershipOptions): Promise<number> {
  const applyMode = resolveApplyMode(argv);
  const targetDir = resolveTargetDir(argv);
  const projectName = resolveProjectName(targetDir, argv);
  const reportPath = readOption(argv, "--report");

  const adopter = new OwnershipAdopter();
  const plan = await adopter.plan({
    targetDir,
    projectName,
    ...(reportPath ? { reportPath } : {}),
  });

  const identical = plan.adopted.filter(
    (entry) => entry.kind === "identical",
  ).length;
  const baselined = plan.adopted.filter(
    (entry) => entry.kind === "baselined",
  ).length;
  const digestOnly = plan.adopted.filter(
    (entry) => entry.kind === "digest-only",
  ).length;

  const payload = {
    dryRun: applyMode === "dry-run",
    targetDir: plan.targetDir,
    compiledFrom: plan.compiledFrom,
    trust: plan.trust,
    adoptedCount: plan.adopted.length,
    identicalCount: identical,
    baselinedCount: baselined,
    digestOnlyCount: digestOnly,
    baselineRejected: plan.baselineRejected,
    unprovenExisting: plan.unprovenExisting,
    missingExpectedCount: plan.missingExpected.length,
    missingExpectedSample: plan.missingExpected.slice(0, 20),
    skipped: plan.skipped,
    editableManifest: plan.nextOwnership.editableManifest,
    packageOwnershipKeys: {
      dependencies: Object.keys(plan.nextOwnership.package.dependencies).length,
      devDependencies: Object.keys(plan.nextOwnership.package.devDependencies)
        .length,
      scripts: Object.keys(plan.nextOwnership.package.scripts).length,
    },
    adoptedSample: plan.adopted.slice(0, 15),
  };

  if (applyMode === "dry-run" && !wantsJsonOutput(argv)) {
    console.log(
      formatAdoptDryRun({
        targetDir: plan.targetDir,
        adoptedCount: plan.adopted.length,
        identicalCount: identical,
        baselinedCount: baselined,
        digestOnlyCount: digestOnly,
        baselineRejected: plan.baselineRejected,
        unprovenExisting: plan.unprovenExisting.length,
      }),
    );
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }

  if (applyMode === "apply") {
    await adopter.apply(plan);
    console.log(
      `Adopted ${String(plan.adopted.length)} proven generated path(s) into ownership.files ` +
        `(${String(identical)} identical, ${String(baselined)} baselined, ${String(digestOnly)} digest-only). ` +
        "No application files were rewritten.",
    );
  }
  return 0;
}
