/**
 * Live Capsule Manifest project generation.
 *
 * Initial: copy editable Manifest source/config into the target, compile from
 * those copies, assemble Builder-owned generated output.
 * Update: compile from the target's own Manifest files — no external source dir.
 */
import {
  applyProjectGeneration,
  planProjectGeneration,
  type GeneratedFileMap,
  type ProjectGenerationPlan,
} from "../projectGeneration";
import { ManifestBuildConfigLoader } from "./manifestBuildConfig";
import {
  ManifestSourceTree,
  type ManifestSourceTreeSnapshot,
} from "./manifestSourceTree";
import {
  assembleConvexApplicationPreset,
  type ConvexApplicationPresetResult,
} from "./convexApplicationPreset";
import { compileProject } from "./project";
import { applyOrgCapabilityCheckRoleToGeneratedFiles } from "./orgCapabilityCheckRoleTransform";
import { SharedConfigPolicy } from "./sharedConfigPolicy";
import type { IR } from "./types";

export interface LiveManifestProjectPlanRequest {
  mode: "initial" | "update";
  targetDir: string;
  /** Required for initial mode — authoritative Manifest source to copy in. */
  manifestSourceDir?: string;
  projectName?: string;
  destructiveOverride?: boolean;
}

export interface LiveManifestProjectPlanResult {
  plan: ProjectGenerationPlan;
  assembly: ConvexApplicationPresetResult;
  /** Assembly output after shared-config policy (what update/initial will own). */
  generatedFiles: GeneratedFileMap;
  relinquishOwnership: string[];
  editablePaths: string[];
  configPath: string | null;
  compiledFrom: string;
}

export class LiveManifestProject {
  private readonly configLoader = new ManifestBuildConfigLoader();
  private readonly sharedConfig = new SharedConfigPolicy();

  async plan(
    request: LiveManifestProjectPlanRequest,
  ): Promise<LiveManifestProjectPlanResult> {
    const tree = await this.loadEditableTree(request);
    if (Object.keys(tree.sources).length === 0) {
      throw new Error(`No .manifest sources found under ${tree.rootDir}`);
    }
    if (!tree.configPath || tree.configContent === null) {
      throw new Error(
        `Missing manifest.config.yaml/yml (or unsupported config) under ${tree.rootDir}`,
      );
    }

    const compileResult = await compileProject(tree.sources);
    if (!compileResult.ir || compileResult.errorCount > 0) {
      const first = compileResult.diagnostics.find(
        (d) => d.severity === "error",
      );
      throw new Error(
        `Manifest compile failed from ${tree.rootDir}` +
          (first
            ? `: ${first.message}`
            : ` (${compileResult.errorCount} errors)`),
      );
    }

    const build = this.configLoader.loadFromContent(
      tree.configPath,
      tree.configContent,
    );
    const convexOptions = this.configLoader.projectionOptions(build, "convex");
    const assembly = assembleConvexApplicationPreset(
      compileResult.ir as IR,
      request.projectName ?? "capsule",
      { convexOptions },
    );
    if (!assembly.complete || assembly.errors.length > 0) {
      throw new Error(
        `Convex assembly incomplete: ${assembly.errors[0] ?? assembly.blockers[0] ?? "unknown"}`,
      );
    }

    const assembledFiles = this.toGeneratedFileMap(assembly, tree);
    // Capsule: fold org-capability checkRole into candidates before ownership
    // planning so mutations/queries never need baselined:true for that patch.
    applyOrgCapabilityCheckRoleToGeneratedFiles(
      assembledFiles as Map<string, { content: string }>,
    );
    const prepared = await this.sharedConfig.prepare({
      mode: request.mode,
      targetDir: request.targetDir,
      files: assembledFiles,
    });
    const editableManifestFiles = this.toEditableFileMap(tree);
    const plan = await planProjectGeneration({
      mode: request.mode,
      targetDir: request.targetDir,
      files: prepared.files,
      editableManifestFiles,
      editableManifestConfigPath: tree.configPath,
      relinquishOwnership: prepared.relinquishOwnership,
      ...(request.mode === "initial" && request.destructiveOverride
        ? { destructiveOverride: true }
        : {}),
    });

    return {
      plan,
      assembly,
      generatedFiles: prepared.files,
      relinquishOwnership: prepared.relinquishOwnership,
      editablePaths: tree.editablePaths,
      configPath: tree.configPath,
      compiledFrom: tree.rootDir,
    };
  }

  async apply(result: LiveManifestProjectPlanResult): Promise<void> {
    await applyProjectGeneration(result.plan);
  }

  private async loadEditableTree(
    request: LiveManifestProjectPlanRequest,
  ): Promise<ManifestSourceTreeSnapshot> {
    if (request.mode === "initial") {
      if (!request.manifestSourceDir) {
        throw new Error(
          "Initial mode requires manifestSourceDir (authoritative Manifest source).",
        );
      }
      return new ManifestSourceTree(request.manifestSourceDir).load();
    }
    return new ManifestSourceTree(request.targetDir).load();
  }

  private toEditableFileMap(
    tree: ManifestSourceTreeSnapshot,
  ): GeneratedFileMap {
    return new Map(
      [...tree.editableFiles.entries()].map(([path, content]) => [
        path,
        { content },
      ]),
    );
  }

  private toGeneratedFileMap(
    assembly: ConvexApplicationPresetResult,
    tree: ManifestSourceTreeSnapshot,
  ): GeneratedFileMap {
    const editable = new Set(tree.editablePaths);
    const files = new Map<string, { content: string }>();
    for (const file of assembly.files) {
      if (editable.has(file.path)) {
        throw new Error(
          `Assembly attempted to claim editable Manifest path as generated output: ${file.path}`,
        );
      }
      files.set(file.path, { content: file.content });
    }
    return files;
  }
}
