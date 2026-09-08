/**
 * Transactional apply + optional dependency install for project generation plans.
 */
import { spawn } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { baselineBlobPath } from "./projectGenerationBaselineStore";
import type {
  OwnershipManifest,
  ProjectGenerationPlan,
} from "./projectGenerationTypes";
import {
  OWNERSHIP_MANIFEST_PATH,
  existsPath,
  formatOwnershipManifest,
  hashContent,
  readPathIfPresent,
  resolveTargetPath,
} from "./projectGenerationPaths";

/** Ownership-only transactional write (adoption / control-metadata updates). */
export interface ApplyOwnershipManifestPlan {
  targetDir: string;
  nextOwnership: OwnershipManifest;
  /** Must include OWNERSHIP_MANIFEST_PATH hash (or null when absent). */
  preconditions: Record<string, string | null>;
  targetExisted: boolean;
}

export interface ApplyOwnershipManifestHooks {
  /** Invoked after backup, before commit — tests use this to force rollback. */
  beforeCommit?: () => Promise<void>;
}

export interface InstallProjectDependenciesOptions {
  enabled: boolean;
  allowLifecycleScripts?: boolean;
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
  run?: (command: string, args: string[], cwd: string) => Promise<void>;
}

async function verifyPreconditions(plan: ProjectGenerationPlan): Promise<void> {
  for (const [path, expected] of Object.entries(plan.preconditions)) {
    const current = await readPathIfPresent(
      resolveTargetPath(plan.targetDir, path),
    );
    const actual = current === null ? null : hashContent(current);
    if (actual !== expected) {
      throw new Error(
        `Target changed after planning: ${path}. Create a new plan before applying.`,
      );
    }
  }
}

async function restoreFromBackup(
  plan: ProjectGenerationPlan,
  backupRoot: string,
  affectedPaths: string[],
): Promise<void> {
  for (const path of [...affectedPaths].sort(
    (left, right) => right.length - left.length,
  )) {
    const target = resolveTargetPath(plan.targetDir, path);
    const backup = resolveTargetPath(backupRoot, path);
    await rm(target, { recursive: true, force: true });
    if (await existsPath(backup)) {
      await mkdir(dirname(target), { recursive: true });
      await copyFile(backup, target);
    }
  }
  if (!plan.targetExisted)
    await rm(plan.targetDir, { recursive: true, force: true });
}

async function commitStagedWrites(options: {
  targetDir: string;
  targetExisted: boolean;
  writes: Record<string, string>;
  deletions: string[];
  beforeCommit?: () => Promise<void>;
}): Promise<void> {
  const parent = dirname(options.targetDir);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(
    join(parent, `.${basename(options.targetDir)}.builder-stage-`),
  );
  const stagedWrites = join(stage, "writes");
  const backupRoot = join(stage, "backup");
  const affectedPaths = [
    ...new Set([...Object.keys(options.writes), ...options.deletions]),
  ];
  const rollbackPlan: ProjectGenerationPlan = {
    mode: "update",
    targetDir: options.targetDir,
    additions: [],
    modifications: [],
    conflicts: [],
    deletions: options.deletions,
    ledgerRepairs: [],
    dependencyRequirementsChanged: false,
    followUps: [],
    writes: options.writes,
    nextOwnership: {
      version: 1,
      files: {},
      package: { dependencies: {}, devDependencies: {}, scripts: {} },
    },
    preconditions: {},
    targetExisted: options.targetExisted,
    baselineBlobs: {},
  };

  try {
    for (const [path, content] of Object.entries(options.writes)) {
      const staged = resolveTargetPath(stagedWrites, path);
      await mkdir(dirname(staged), { recursive: true });
      await writeFile(staged, content, "utf8");
    }
    for (const path of affectedPaths) {
      const current = resolveTargetPath(options.targetDir, path);
      if (await existsPath(current)) {
        const stat = await lstat(current);
        if (!stat.isFile())
          throw new Error(
            `Expected a file at ${path}, found a non-file entry.`,
          );
        const backup = resolveTargetPath(backupRoot, path);
        await mkdir(dirname(backup), { recursive: true });
        await copyFile(current, backup);
      }
    }
    if (options.beforeCommit) await options.beforeCommit();

    await mkdir(options.targetDir, { recursive: true });
    for (const [path] of Object.entries(options.writes)) {
      const target = resolveTargetPath(options.targetDir, path);
      const staged = resolveTargetPath(stagedWrites, path);
      await mkdir(dirname(target), { recursive: true });
      await rm(target, { force: true });
      await rename(staged, target);
    }
    for (const path of options.deletions) {
      await rm(resolveTargetPath(options.targetDir, path), { force: true });
    }
  } catch (error) {
    try {
      await restoreFromBackup(rollbackPlan, backupRoot, affectedPaths);
    } catch (rollbackError) {
      const generationMessage =
        error instanceof Error ? error.message : String(error);
      const rollbackMessage =
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);
      throw new Error(
        `Project generation failed (${generationMessage}) and rollback also failed (${rollbackMessage}).`,
      );
    }
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export async function applyProjectGeneration(
  plan: ProjectGenerationPlan,
): Promise<void> {
  if (plan.conflicts.length > 0) {
    const detail = plan.conflicts
      .map((entry) =>
        entry.diagnostics ? entry.message : `${entry.path}: ${entry.message}`,
      )
      .join("\n\n");
    throw new Error(
      `Project generation plan has ${String(plan.conflicts.length)} conflict(s); resolve them before applying.\n\n${detail}`,
    );
  }
  await verifyPreconditions(plan);
  const baselineWrites = Object.fromEntries(
    Object.entries(plan.baselineBlobs).map(([digest, content]) => [
      baselineBlobPath(digest),
      content,
    ]),
  );
  await commitStagedWrites({
    targetDir: plan.targetDir,
    targetExisted: plan.targetExisted,
    writes: {
      ...plan.writes,
      ...baselineWrites,
      [OWNERSHIP_MANIFEST_PATH]: formatOwnershipManifest(plan.nextOwnership),
    },
    deletions: plan.deletions,
  });
}

/**
 * Transactionally write only `.builder/ownership.json`.
 * Never rewrites generated application files, Manifest source, or package.json.
 */
export async function applyOwnershipManifest(
  plan: ApplyOwnershipManifestPlan,
  hooks?: ApplyOwnershipManifestHooks,
): Promise<void> {
  await verifyPreconditions({
    mode: "update",
    targetDir: plan.targetDir,
    additions: [],
    modifications: [],
    conflicts: [],
    deletions: [],
    ledgerRepairs: [],
    dependencyRequirementsChanged: false,
    followUps: [],
    writes: {},
    nextOwnership: plan.nextOwnership,
    preconditions: plan.preconditions,
    targetExisted: plan.targetExisted,
    baselineBlobs: {},
  });
  await commitStagedWrites({
    targetDir: plan.targetDir,
    targetExisted: plan.targetExisted,
    writes: {
      [OWNERSHIP_MANIFEST_PATH]: formatOwnershipManifest(plan.nextOwnership),
    },
    deletions: [],
    ...(hooks?.beforeCommit ? { beforeCommit: hooks.beforeCommit } : {}),
  });
}

function runInstall(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            `${command} ${args.join(" ")} failed (${signal ?? `exit ${String(code)}`}).`,
          ),
        );
    });
  });
}

export async function installProjectDependencies(
  plan: ProjectGenerationPlan,
  options: InstallProjectDependenciesOptions,
): Promise<boolean> {
  if (!options.enabled || !plan.dependencyRequirementsChanged) return false;
  if (plan.conflicts.length > 0) {
    throw new Error(
      "Cannot install dependencies for a project generation plan with conflicts.",
    );
  }
  const command = options.packageManager ?? "npm";
  const args = ["install"];
  if (!options.allowLifecycleScripts) args.push("--ignore-scripts");
  await (options.run ?? runInstall)(command, args, plan.targetDir);
  return true;
}
