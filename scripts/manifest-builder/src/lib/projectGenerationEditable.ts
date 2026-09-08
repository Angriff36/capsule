/**
 * Editable Manifest source/config ownership — Capsule-owned, never generated.
 */
import type {
  EditableManifestOwnership,
  GeneratedFileMap,
  OwnershipManifest,
  PlanProjectGenerationOptions,
  ProjectGenerationConflict,
  ProjectGenerationPlan,
} from "./projectGenerationTypes";

export type EditablePathNormalizer = (path: string) => string;

export class EditableManifestPlanner {
  constructor(
    private readonly normalizePath: EditablePathNormalizer,
    private readonly isProtectedPath: (path: string) => boolean,
    private readonly isLockfile: (path: string) => boolean,
    private readonly readIfPresent: (
      absolutePath: string,
    ) => Promise<string | null>,
    private readonly targetPath: (targetDir: string, path: string) => string,
    private readonly sha256: (content: string) => string,
    private readonly conflict: (
      path: string,
      reason: "editable-manifest-path" | "protected-path",
      message: string,
    ) => ProjectGenerationConflict,
  ) {}

  pathSet(
    ownership: OwnershipManifest | undefined,
    options: PlanProjectGenerationOptions,
  ): Set<string> {
    const paths = new Set<string>();
    for (const path of ownership?.editableManifest?.paths ?? []) {
      paths.add(this.normalizePath(path));
    }
    if (options.editableManifestFiles) {
      for (const path of options.editableManifestFiles.keys()) {
        paths.add(this.normalizePath(path));
      }
    }
    return paths;
  }

  rejectGeneratedCollisions(
    desired: Map<string, string>,
    editablePaths: Set<string>,
    conflicts: ProjectGenerationConflict[],
  ): void {
    for (const path of desired.keys()) {
      if (!editablePaths.has(path)) continue;
      conflicts.push(
        this.conflict(
          path,
          "editable-manifest-path",
          "Editable Manifest source/config cannot be treated as replaceable generated output.",
        ),
      );
      desired.delete(path);
    }
  }

  async attach(
    plan: ProjectGenerationPlan,
    options: PlanProjectGenerationOptions,
    previous: OwnershipManifest | undefined,
  ): Promise<void> {
    const record = this.ownershipRecord(options, previous);
    if (record) plan.nextOwnership.editableManifest = record;

    if (options.mode !== "initial" || !options.editableManifestFiles) return;
    await this.stageInitialEditableWrites(plan, options.editableManifestFiles);
  }

  private ownershipRecord(
    options: PlanProjectGenerationOptions,
    previous: OwnershipManifest | undefined,
  ): EditableManifestOwnership | undefined {
    if (options.editableManifestFiles) {
      const paths = [...options.editableManifestFiles.keys()]
        .map(this.normalizePath)
        .sort();
      const configPath =
        options.editableManifestConfigPath === undefined
          ? (previous?.editableManifest?.configPath ?? null)
          : options.editableManifestConfigPath;
      return { paths, configPath };
    }
    if (previous?.editableManifest) {
      return {
        paths: [...previous.editableManifest.paths].sort(),
        configPath: previous.editableManifest.configPath,
      };
    }
    return undefined;
  }

  private async stageInitialEditableWrites(
    plan: ProjectGenerationPlan,
    editableFiles: GeneratedFileMap,
  ): Promise<void> {
    for (const [rawPath, file] of editableFiles) {
      const path = this.normalizePath(rawPath);
      if (plan.nextOwnership.files[path]) {
        plan.conflicts.push(
          this.conflict(
            path,
            "editable-manifest-path",
            "Editable Manifest source/config must not be claimed as Builder-owned generated output.",
          ),
        );
        continue;
      }
      if (this.isProtectedPath(path) || this.isLockfile(path)) {
        plan.conflicts.push(
          this.conflict(
            path,
            "protected-path",
            `${path} is protected and cannot be editable Manifest input.`,
          ),
        );
        continue;
      }
      const current = await this.readIfPresent(
        this.targetPath(plan.targetDir, path),
      );
      plan.preconditions[path] = current === null ? null : this.sha256(current);
      plan.writes[path] = file.content;
      if (current === null) {
        if (!plan.additions.includes(path)) plan.additions.push(path);
      } else if (
        current !== file.content &&
        !plan.modifications.includes(path)
      ) {
        plan.modifications.push(path);
      }
    }
  }
}
