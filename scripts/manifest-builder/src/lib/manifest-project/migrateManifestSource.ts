/**
 * Explicit migration: import editable Manifest source/config into an existing
 * Capsule app without regenerating projections or overwriting application work.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  OWNERSHIP_MANIFEST_PATH,
  type OwnershipManifest,
} from "../projectGeneration";
import { ManifestSourceTree } from "./manifestSourceTree";

export interface MigrateManifestSourceRequest {
  fromDir: string;
  targetDir: string;
  /** When false (default), only report the plan. */
  apply?: boolean;
}

export interface MigrateManifestSourceConflict {
  path: string;
  reason: "content-differs" | "missing-source";
  message: string;
}

export interface MigrateManifestSourcePlan {
  fromDir: string;
  targetDir: string;
  additions: string[];
  unchanged: string[];
  conflicts: MigrateManifestSourceConflict[];
  configPath: string | null;
  ownershipUpdate: OwnershipManifest;
}

export class ManifestSourceMigrator {
  async plan(
    request: MigrateManifestSourceRequest,
  ): Promise<MigrateManifestSourcePlan> {
    const fromDir = resolve(request.fromDir);
    const targetDir = resolve(request.targetDir);
    const tree = await new ManifestSourceTree(fromDir).load();
    if (tree.editablePaths.length === 0) {
      throw new Error(`No editable Manifest files found under ${fromDir}`);
    }

    const additions: string[] = [];
    const unchanged: string[] = [];
    const conflicts: MigrateManifestSourceConflict[] = [];

    for (const [path, content] of tree.editableFiles) {
      const absolute = join(targetDir, ...path.split("/"));
      const existing = await this.readIfPresent(absolute);
      if (existing === null) {
        additions.push(path);
      } else if (existing === content) {
        unchanged.push(path);
      } else {
        conflicts.push({
          path,
          reason: "content-differs",
          message:
            "Target already has different content; migration will not overwrite it.",
        });
      }
    }

    const previous = await this.readOwnership(targetDir);
    const ownershipUpdate: OwnershipManifest = {
      version: 1,
      files: previous?.files ?? {},
      package: previous?.package ?? {
        dependencies: {},
        devDependencies: {},
        scripts: {},
      },
      editableManifest: {
        paths: [...tree.editablePaths].sort(),
        configPath: tree.configPath,
      },
    };

    return {
      fromDir,
      targetDir,
      additions: additions.sort(),
      unchanged: unchanged.sort(),
      conflicts,
      configPath: tree.configPath,
      ownershipUpdate,
    };
  }

  async apply(plan: MigrateManifestSourcePlan): Promise<void> {
    if (plan.conflicts.length > 0) {
      throw new Error(
        "Cannot apply Manifest source migration while conflicts remain.",
      );
    }
    const tree = await new ManifestSourceTree(plan.fromDir).load();
    for (const path of plan.additions) {
      const content = tree.editableFiles.get(path);
      if (content === undefined) {
        throw new Error(`Missing source content for ${path}`);
      }
      const absolute = join(plan.targetDir, ...path.split("/"));
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
    }
    const ownershipAbsolute = join(
      plan.targetDir,
      ...OWNERSHIP_MANIFEST_PATH.split("/"),
    );
    await mkdir(dirname(ownershipAbsolute), { recursive: true });
    await writeFile(
      ownershipAbsolute,
      `${JSON.stringify(plan.ownershipUpdate, null, 2)}\n`,
      "utf8",
    );
  }

  private async readIfPresent(path: string): Promise<string | null> {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async readOwnership(
    targetDir: string,
  ): Promise<OwnershipManifest | null> {
    const absolute = join(targetDir, ...OWNERSHIP_MANIFEST_PATH.split("/"));
    try {
      await access(absolute);
    } catch {
      return null;
    }
    const raw = await readFile(absolute, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    return parsed as OwnershipManifest;
  }
}
