import { installProjectDependencies } from "../../lib/projectGeneration.ts";
import { LiveManifestProject } from "../../lib/manifest-project/liveManifestProject.ts";
import {
  hasFlag,
  readOption,
  resolveApplyMode,
  wantsJsonOutput,
} from "../args.ts";
import { formatGenerateConvexDryRun } from "../planSummary.ts";
import { resolveProjectName, resolveTargetDir } from "../targetDefaults.ts";

export interface GenerateConvexOptions {
  argv: string[];
}

export async function runGenerateConvexCommand({
  argv,
}: GenerateConvexOptions): Promise<number> {
  const applyMode = resolveApplyMode(argv);
  const modeArgument = readOption(argv, "--mode", "update");
  if (modeArgument !== "initial" && modeArgument !== "update") {
    throw new Error(
      `--mode must be initial or update, received ${modeArgument}`,
    );
  }
  const mode = modeArgument;
  const targetDir = resolveTargetDir(argv);
  const projectName = resolveProjectName(targetDir, argv);
  const manifestSourceDir = readOption(argv, "--manifest-source");

  if (mode === "initial" && !manifestSourceDir) {
    throw new Error("Initial mode requires --manifest-source <path>.");
  }

  const live = new LiveManifestProject();
  const result = await live.plan({
    mode,
    targetDir,
    projectName,
    ...(mode === "initial" && manifestSourceDir ? { manifestSourceDir } : {}),
    ...(mode === "initial" && hasFlag(argv, "--destructive-override")
      ? { destructiveOverride: true }
      : {}),
  });

  const { plan, assembly } = result;
  const payload = {
    dryRun: applyMode === "dry-run",
    mode: plan.mode,
    targetDir: plan.targetDir,
    compiledFrom: result.compiledFrom,
    editablePaths: result.editablePaths,
    configPath: result.configPath,
    additions: plan.additions,
    modifications: plan.modifications,
    conflicts: plan.conflicts,
    deletions: plan.deletions,
    ledgerRepairs: plan.ledgerRepairs,
    dependencyRequirementsChanged: plan.dependencyRequirementsChanged,
    followUps: plan.followUps,
    ownershipEditableManifest: plan.nextOwnership.editableManifest,
    assemblyReport: {
      complete: assembly.complete,
      exportAllowed: assembly.complete && assembly.errors.length === 0,
      errorCount: assembly.errors.length,
      compiledFrom: result.compiledFrom,
      editablePaths: result.editablePaths,
      configPath: result.configPath,
      fileCount: assembly.files.length,
      errors: assembly.errors,
      blockers: assembly.blockers,
      assemblyVerification: assembly.assemblyVerification,
      dependencies: assembly.dependencies,
      files: assembly.files.map((file) => file.path),
    },
  };

  if (applyMode === "dry-run" && !wantsJsonOutput(argv)) {
    console.log(
      formatGenerateConvexDryRun({
        mode: plan.mode,
        targetDir: plan.targetDir,
        compiledFrom: result.compiledFrom,
        additions: plan.additions,
        modifications: plan.modifications,
        deletions: plan.deletions,
        ledgerRepairs: plan.ledgerRepairs,
        conflicts: plan.conflicts.map((conflict) => ({
          path: conflict.path,
          reason: conflict.reason,
          message: conflict.message,
        })),
        dependencyRequirementsChanged: plan.dependencyRequirementsChanged,
        followUps: plan.followUps,
        assemblyComplete: assembly.complete,
        assemblyErrorCount: assembly.errors.length,
      }),
    );
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }

  if (plan.conflicts.length > 0) {
    return 2;
  }
  if (applyMode === "apply") {
    await live.apply(result);
    const installed = await installProjectDependencies(plan, {
      enabled: hasFlag(argv, "--install"),
      allowLifecycleScripts: hasFlag(argv, "--allow-lifecycle-scripts"),
    });
    console.log(
      installed
        ? "Applied project update and installed dependencies."
        : "Applied project update without installing dependencies.",
    );
  }
  return 0;
}
