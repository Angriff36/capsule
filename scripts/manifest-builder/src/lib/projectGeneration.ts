import { readdir } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { EditableManifestPlanner } from "./projectGenerationEditable";
import { PackageRequirementMerger } from "./packageRequirementMerge";
import { ProjectGenerationBaselineStore } from "./projectGenerationBaselineStore";
import { planOwnedGeneratedFile } from "./projectGenerationOwnedUpdate";
import {
  OWNERSHIP_MANIFEST_PATH,
  existsPath,
  hashContent,
  normalizeRelativePath,
  readPathIfPresent,
  resolveTargetPath,
} from "./projectGenerationPaths";
import { recordBaselineBlob } from "./projectGenerationThreeWay";
import type {
  GeneratedFileMap,
  OwnershipManifest,
  PackageOwnership,
  PlanProjectGenerationOptions,
  ProjectGenerationConflict,
  ProjectGenerationConflictReason,
  ProjectGenerationMode,
  ProjectGenerationPlan,
  ThreeWayConflictDiagnostics,
} from "./projectGenerationTypes";

export { OWNERSHIP_MANIFEST_PATH } from "./projectGenerationPaths";
export { BASELINE_STORE_DIR } from "./projectGenerationBaselineStore";
export type {
  EditableManifestOwnership,
  GeneratedFileMap,
  OwnedFileThreeWayClassification,
  OwnershipManifest,
  PackageOwnership,
  PlanProjectGenerationOptions,
  ProjectGenerationConflict,
  ProjectGenerationConflictReason,
  ProjectGenerationFollowUp,
  ProjectGenerationMode,
  ProjectGenerationPlan,
  ThreeWayConflictDiagnostics,
} from "./projectGenerationTypes";

export type {
  ApplyOwnershipManifestHooks,
  ApplyOwnershipManifestPlan,
  InstallProjectDependenciesOptions,
} from "./projectGenerationApply";
export {
  applyOwnershipManifest,
  applyProjectGeneration,
  installProjectDependencies,
} from "./projectGenerationApply";

const EMPTY_PACKAGE_OWNERSHIP: PackageOwnership = {
  dependencies: {},
  devDependencies: {},
  scripts: {},
};

const LOCKFILES = new Set([
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

function sha256(content: string): string {
  return hashContent(content);
}

function targetPath(targetDir: string, path: string): string {
  return resolveTargetPath(targetDir, path);
}

function isProtectedPath(path: string): boolean {
  const parts = path.toLowerCase().split("/");
  const name = parts[parts.length - 1] ?? "";
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    parts.includes(".convex") ||
    parts.includes(".vercel") ||
    parts.includes(".netlify") ||
    parts.includes(".firebase")
  );
}

function isLockfile(path: string): boolean {
  return LOCKFILES.has(path.toLowerCase());
}

async function exists(path: string): Promise<boolean> {
  return existsPath(path);
}

async function readIfPresent(path: string): Promise<string | null> {
  return readPathIfPresent(path);
}

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      files.push(...(await listFiles(join(root, entry.name), path)));
    else files.push(path);
  }
  return files.sort();
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
}

function parsePackage(content: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

function packageOwnership(content: string): PackageOwnership {
  const value = parsePackage(content, "Generated package.json");
  return {
    dependencies: stringRecord(value.dependencies),
    devDependencies: stringRecord(value.devDependencies),
    scripts: stringRecord(value.scripts),
  };
}

function validOwnership(value: unknown): value is OwnershipManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<OwnershipManifest>;
  if (candidate.version !== 1 || !candidate.files || !candidate.package)
    return false;
  if (candidate.editableManifest === undefined) return true;
  const editable = candidate.editableManifest;
  return (
    Boolean(editable) &&
    typeof editable === "object" &&
    Array.isArray(editable.paths) &&
    editable.paths.every((path) => typeof path === "string") &&
    (editable.configPath === null || typeof editable.configPath === "string")
  );
}

function createEditablePlanner(): EditableManifestPlanner {
  return new EditableManifestPlanner(
    normalizeRelativePath,
    isProtectedPath,
    isLockfile,
    readIfPresent,
    targetPath,
    sha256,
    (path, reason, message) => conflict(path, reason, message),
  );
}

function sortedRecord<T>(
  entries: Iterable<readonly [string, T]>,
): Record<string, T> {
  return Object.fromEntries(
    [...entries].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function conflict(
  path: string,
  reason: ProjectGenerationConflictReason,
  message: string,
  diagnostics?: ThreeWayConflictDiagnostics,
): ProjectGenerationConflict {
  return diagnostics
    ? { path, reason, message, diagnostics }
    : { path, reason, message };
}

function rememberBaseline(plan: ProjectGenerationPlan, content: string): void {
  const blobs = new Map(Object.entries(plan.baselineBlobs));
  recordBaselineBlob(blobs, content);
  plan.baselineBlobs = Object.fromEntries(blobs);
}

const packageMerger = new PackageRequirementMerger();

function mergePackageJson(
  currentContent: string,
  desiredContent: string,
  previous: PackageOwnership,
  conflicts: ProjectGenerationConflict[],
): { content: string; ownership: PackageOwnership } {
  const current = parsePackage(currentContent, "Existing package.json");
  const desired = parsePackage(desiredContent, "Generated package.json");
  const desiredOwnership = packageOwnership(desiredContent);
  const dependencies = packageMerger.mergeSection(
    "package.json",
    "dependencies",
    stringRecord(current.dependencies),
    previous.dependencies,
    desiredOwnership.dependencies,
    conflicts,
  );
  const devDependencies = packageMerger.mergeSection(
    "package.json",
    "devDependencies",
    stringRecord(current.devDependencies),
    previous.devDependencies,
    desiredOwnership.devDependencies,
    conflicts,
  );
  const scripts = packageMerger.mergeSection(
    "package.json",
    "scripts",
    stringRecord(current.scripts),
    previous.scripts,
    desiredOwnership.scripts,
    conflicts,
  );
  // Preset status is Builder-authored (PRESET.md twin). Merge it even when the
  // app owns the rest of package.json so version/complete cannot drift.
  const merged: Record<string, unknown> = {
    ...current,
    dependencies,
    devDependencies,
    scripts,
  };
  if (desired.manifestPreset !== undefined) {
    merged.manifestPreset = desired.manifestPreset;
  } else {
    delete merged.manifestPreset;
  }
  return {
    content: `${JSON.stringify(merged, null, 2)}\n`,
    ownership: packageMerger.ownershipFromDesired(desiredOwnership),
  };
}

function requirementsChanged(
  previous: PackageOwnership,
  next: PackageOwnership,
): boolean {
  return (
    JSON.stringify(previous.dependencies) !==
      JSON.stringify(next.dependencies) ||
    JSON.stringify(previous.devDependencies) !==
      JSON.stringify(next.devDependencies)
  );
}

function emptyPlan(
  mode: ProjectGenerationMode,
  targetDir: string,
  targetExisted: boolean,
): ProjectGenerationPlan {
  return {
    mode,
    targetDir: resolve(targetDir),
    additions: [],
    modifications: [],
    conflicts: [],
    deletions: [],
    ledgerRepairs: [],
    dependencyRequirementsChanged: false,
    followUps: [],
    writes: {},
    nextOwnership: {
      version: 1,
      files: {},
      package: { ...EMPTY_PACKAGE_OWNERSHIP },
    },
    preconditions: {},
    targetExisted,
    baselineBlobs: {},
  };
}

function desiredFiles(
  files: GeneratedFileMap,
  conflicts: ProjectGenerationConflict[],
): Map<string, string> {
  const desired = new Map<string, string>();
  for (const [rawPath, file] of files) {
    const path = normalizeRelativePath(rawPath);
    if (path === OWNERSHIP_MANIFEST_PATH || isProtectedPath(path)) {
      conflicts.push(
        conflict(
          path,
          "protected-path",
          `${path} is application or deployment state and Builder will not write it.`,
        ),
      );
      continue;
    }
    if (isLockfile(path)) {
      conflicts.push(
        conflict(
          path,
          "lockfile-protected",
          `${path} can change only during an explicitly enabled dependency resolution.`,
        ),
      );
      continue;
    }
    desired.set(path, file.content);
  }
  return desired;
}

async function planInitial(
  options: PlanProjectGenerationOptions,
): Promise<ProjectGenerationPlan> {
  const targetExisted = await exists(options.targetDir);
  const plan = emptyPlan("initial", options.targetDir, targetExisted);
  const editable = createEditablePlanner();
  const editablePaths = editable.pathSet(undefined, options);
  const desired = desiredFiles(options.files, plan.conflicts);
  editable.rejectGeneratedCollisions(desired, editablePaths, plan.conflicts);
  const existingFiles = await listFiles(plan.targetDir);
  if (existingFiles.length > 0 && !options.destructiveOverride) {
    for (const path of existingFiles) {
      plan.conflicts.push(
        conflict(
          path,
          "initialized-target",
          "Initial mode will not overwrite an initialized target without destructiveOverride.",
        ),
      );
    }
  }

  let ownedPackage = { ...EMPTY_PACKAGE_OWNERSHIP };
  for (const [path, content] of desired) {
    const current = await readIfPresent(targetPath(plan.targetDir, path));
    plan.preconditions[path] = current === null ? null : sha256(current);
    plan.writes[path] = content;
    if (current === null) plan.additions.push(path);
    else if (current !== content) plan.modifications.push(path);
    plan.nextOwnership.files[path] = { sha256: sha256(content) };
    rememberBaseline(plan, content);
    if (path === "package.json") ownedPackage = packageOwnership(content);
  }
  plan.nextOwnership.package = ownedPackage;
  await editable.attach(plan, options, undefined);
  plan.dependencyRequirementsChanged = requirementsChanged(
    EMPTY_PACKAGE_OWNERSHIP,
    ownedPackage,
  );
  plan.preconditions[OWNERSHIP_MANIFEST_PATH] = null;
  if (plan.dependencyRequirementsChanged) {
    plan.followUps.push({
      kind: "install",
      message:
        "Dependency requirements changed. Install only when explicitly enabled.",
    });
  }
  if ([...desired.keys()].some((path) => path.startsWith("convex/"))) {
    plan.followUps.push({
      kind: "convex-deploy",
      message:
        "Convex source changed. Review and deploy separately; Builder did not deploy it.",
    });
  }
  return sortPlan(plan);
}

async function readOwnership(
  targetDir: string,
): Promise<OwnershipManifest | ProjectGenerationConflict> {
  const path = targetPath(targetDir, OWNERSHIP_MANIFEST_PATH);
  const content = await readIfPresent(path);
  if (content === null) {
    return conflict(
      OWNERSHIP_MANIFEST_PATH,
      "ownership-manifest-missing",
      "Update mode requires the ownership manifest created by initial mode.",
    );
  }
  try {
    const value: unknown = JSON.parse(content);
    if (!validOwnership(value))
      throw new Error("unsupported ownership manifest shape or version");
    return value;
  } catch (error) {
    return conflict(
      OWNERSHIP_MANIFEST_PATH,
      "ownership-manifest-invalid",
      `Cannot read ownership manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function planUpdate(
  options: PlanProjectGenerationOptions,
): Promise<ProjectGenerationPlan> {
  const targetExisted = await exists(options.targetDir);
  const plan = emptyPlan("update", options.targetDir, targetExisted);
  const ownership = await readOwnership(plan.targetDir);
  if ("reason" in ownership) {
    plan.conflicts.push(ownership);
    return plan;
  }
  const ownershipContent = await readIfPresent(
    targetPath(plan.targetDir, OWNERSHIP_MANIFEST_PATH),
  );
  if (ownershipContent === null) {
    plan.conflicts.push(
      conflict(
        OWNERSHIP_MANIFEST_PATH,
        "ownership-manifest-missing",
        "Update mode requires the ownership manifest created by initial mode.",
      ),
    );
    return plan;
  }
  plan.preconditions[OWNERSHIP_MANIFEST_PATH] = sha256(ownershipContent);
  const editable = createEditablePlanner();
  const editablePaths = editable.pathSet(ownership, options);
  const desired = desiredFiles(options.files, plan.conflicts);
  editable.rejectGeneratedCollisions(desired, editablePaths, plan.conflicts);
  const baselineStore = new ProjectGenerationBaselineStore(plan.targetDir);
  let nextPackageOwnership = { ...EMPTY_PACKAGE_OWNERSHIP };

  for (const [path, desiredContent] of desired) {
    const currentContent = await readIfPresent(
      targetPath(plan.targetDir, path),
    );
    plan.preconditions[path] =
      currentContent === null ? null : sha256(currentContent);

    if (path === "package.json") {
      if (currentContent === null) {
        if (ownership.files[path]) {
          plan.conflicts.push(
            conflict(
              path,
              "owned-file-missing",
              "Builder-owned package.json was removed after the previous generation.",
            ),
          );
          continue;
        }
        plan.additions.push(path);
        plan.writes[path] = desiredContent;
        nextPackageOwnership = packageOwnership(desiredContent);
        plan.nextOwnership.files[path] = { sha256: sha256(desiredContent) };
        rememberBaseline(plan, desiredContent);
        continue;
      }
      if (!ownership.files[path]) {
        plan.conflicts.push(
          conflict(
            path,
            "app-owned-path",
            "Generated package requirements collide with an application-owned package.json.",
          ),
        );
        continue;
      }
      const merged = mergePackageJson(
        currentContent,
        desiredContent,
        ownership.package,
        plan.conflicts,
      );
      nextPackageOwnership = merged.ownership;
      plan.writes[path] = merged.content;
      plan.nextOwnership.files[path] = { sha256: sha256(merged.content) };
      rememberBaseline(plan, merged.content);
      if (merged.content !== currentContent) plan.modifications.push(path);
      continue;
    }

    const previous = ownership.files[path];
    if (!previous) {
      if (currentContent !== null) {
        plan.conflicts.push(
          conflict(
            path,
            "app-owned-path",
            "Builder will not claim or overwrite an application-owned path.",
          ),
        );
        continue;
      }
      plan.additions.push(path);
      plan.writes[path] = desiredContent;
      plan.nextOwnership.files[path] = { sha256: sha256(desiredContent) };
      rememberBaseline(plan, desiredContent);
      continue;
    }
    if (currentContent === null) {
      plan.conflicts.push(
        conflict(
          path,
          "owned-file-missing",
          "Builder-owned file was removed after the previous generation.",
        ),
      );
      continue;
    }
    await planOwnedGeneratedFile({
      path,
      previous,
      currentContent,
      desiredContent,
      plan,
      baselineStore,
      pushConflict: (conflictPath, message, diagnostics) =>
        conflict(conflictPath, "owned-file-modified", message, diagnostics),
    });
  }

  const relinquishOwnership = new Set(options.relinquishOwnership ?? []);
  for (const [path, previous] of Object.entries(ownership.files)) {
    if (desired.has(path) || path === "package.json") continue;
    if (editablePaths.has(path)) continue;
    if (relinquishOwnership.has(path)) continue;
    if (isProtectedPath(path) || isLockfile(path)) continue;
    const currentContent = await readIfPresent(
      targetPath(plan.targetDir, path),
    );
    plan.preconditions[path] =
      currentContent === null ? null : sha256(currentContent);
    if (currentContent === null) continue;
    if (sha256(currentContent) !== previous.sha256) {
      plan.conflicts.push(
        conflict(
          path,
          "owned-file-modified",
          "Stale Builder-owned file was modified and will not be deleted.",
        ),
      );
    } else {
      plan.deletions.push(path);
    }
  }

  plan.nextOwnership.package = nextPackageOwnership;
  await editable.attach(plan, options, ownership);
  plan.dependencyRequirementsChanged = requirementsChanged(
    ownership.package,
    nextPackageOwnership,
  );
  if (plan.dependencyRequirementsChanged) {
    plan.followUps.push({
      kind: "install",
      message:
        "Dependency requirements changed. Resolve the lockfile and install only when explicitly enabled.",
    });
  }
  if (
    [...plan.additions, ...plan.modifications, ...plan.deletions].some((path) =>
      path.startsWith("convex/"),
    )
  ) {
    plan.followUps.push({
      kind: "convex-deploy",
      message:
        "Convex source changed. Review and deploy separately; Builder did not deploy it.",
    });
  }
  return sortPlan(plan);
}

function sortPlan(plan: ProjectGenerationPlan): ProjectGenerationPlan {
  plan.additions.sort();
  plan.modifications.sort();
  plan.deletions.sort();
  plan.ledgerRepairs.sort();
  plan.conflicts.sort((left, right) => left.path.localeCompare(right.path));
  plan.writes = sortedRecord(Object.entries(plan.writes));
  plan.baselineBlobs = sortedRecord(Object.entries(plan.baselineBlobs));
  plan.nextOwnership.files = sortedRecord(
    Object.entries(plan.nextOwnership.files),
  );
  plan.nextOwnership.package = {
    dependencies: sortedRecord(
      Object.entries(plan.nextOwnership.package.dependencies),
    ),
    devDependencies: sortedRecord(
      Object.entries(plan.nextOwnership.package.devDependencies),
    ),
    scripts: sortedRecord(Object.entries(plan.nextOwnership.package.scripts)),
  };
  return plan;
}

export async function planProjectGeneration(
  options: PlanProjectGenerationOptions,
): Promise<ProjectGenerationPlan> {
  const target = resolve(options.targetDir);
  if (target === parse(target).root)
    throw new Error("Project generation target cannot be a filesystem root.");
  return options.mode === "initial"
    ? planInitial(options)
    : planUpdate(options);
}
