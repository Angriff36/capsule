import { ManifestSourceMigrator } from "../../lib/manifest-project/migrateManifestSource.ts";
import { readOption, resolveApplyMode, wantsJsonOutput } from "../args.ts";
import { formatMigrateDryRun } from "../planSummary.ts";
import { resolveTargetDir } from "../targetDefaults.ts";

export interface MigrateManifestSourceOptions {
  argv: string[];
}

export async function runMigrateManifestSourceCommand({
  argv,
}: MigrateManifestSourceOptions): Promise<number> {
  const applyMode = resolveApplyMode(argv);
  const fromDir = readOption(argv, "--from");
  const targetDir = resolveTargetDir(argv);
  if (!fromDir) {
    throw new Error(
      "Missing required option --from <path> (Manifest source directory).",
    );
  }

  const migrator = new ManifestSourceMigrator();
  const plan = await migrator.plan({ fromDir, targetDir });

  const payload = {
    dryRun: applyMode === "dry-run",
    fromDir: plan.fromDir,
    targetDir: plan.targetDir,
    configPath: plan.configPath,
    additions: plan.additions,
    unchanged: plan.unchanged,
    conflicts: plan.conflicts,
    editableManifest: plan.ownershipUpdate.editableManifest,
  };

  if (applyMode === "dry-run" && !wantsJsonOutput(argv)) {
    console.log(
      formatMigrateDryRun({
        fromDir: plan.fromDir,
        targetDir: plan.targetDir,
        additions: plan.additions,
        unchanged: plan.unchanged,
        conflicts: plan.conflicts,
      }),
    );
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }

  if (plan.conflicts.length > 0) {
    return 2;
  }
  if (applyMode === "apply") {
    await migrator.apply(plan);
    console.log(
      "Imported editable Manifest source/config and updated ownership.editableManifest.",
    );
  }
  return 0;
}
