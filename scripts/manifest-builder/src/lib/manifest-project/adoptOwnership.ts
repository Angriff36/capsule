/**
 * One-time ownership adoption for existing Builder-assembled applications.
 *
 * Stages expected generated output from the target's own Manifest source/config,
 * classifies proven generated paths, and writes only `.builder/ownership.json`.
 * Never rewrites application files, Manifest source, packages, or deploy state.
 */
import { join, resolve } from "node:path";
import {
  OWNERSHIP_MANIFEST_PATH,
  applyOwnershipManifest,
  type OwnershipManifest,
  type PackageOwnership,
} from "../projectGeneration";
import {
  existsPath,
  hashContent,
  normalizeRelativePath,
  readPathIfPresent,
  resolveTargetPath,
} from "../projectGenerationPaths";
import { canReceiveBaselinedFlag } from "../projectGenerationOwnershipPolicy";
import {
  CONVEX_APPLICATION_PRESET_ID,
  CONVEX_APPLICATION_PRESET_VERSION,
} from "./convexApplicationPreset";
import { LiveManifestProject } from "./liveManifestProject";

const LOCKFILES = new Set([
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

export type OwnershipAdoptionKind = "identical" | "baselined" | "digest-only";

export interface OwnershipAdoptionEntry {
  path: string;
  kind: OwnershipAdoptionKind;
  sha256: string;
}

export interface OwnershipAdoptionPlan {
  targetDir: string;
  projectName: string;
  compiledFrom: string;
  trust: {
    assemblyReport: boolean;
    presetMarkdown: boolean;
    packageManifestPreset: boolean;
    editableManifest: boolean;
  };
  adopted: OwnershipAdoptionEntry[];
  /**
   * Proven generated paths whose disk bytes differed from stock but are not
   * baselineable author seams. Claimed at disk digest without `baselined:true`
   * so the next regen can overwrite them. Never frozen as author seams.
   */
  baselineRejected: string[];
  /** On-disk paths considered but not proven generated — left app-owned. */
  unprovenExisting: string[];
  missingExpected: string[];
  skipped: string[];
  nextOwnership: OwnershipManifest;
  preconditions: Record<string, string | null>;
  targetExisted: boolean;
}

export interface AdoptOwnershipRequest {
  targetDir: string;
  projectName?: string;
  /** Optional path to ASSEMBLY_REPORT.json (defaults to target/ASSEMBLY_REPORT.json). */
  reportPath?: string;
}

interface TrustSignals {
  assemblyReport: boolean;
  presetMarkdown: boolean;
  packageManifestPreset: boolean;
  editableManifest: boolean;
  /** Trusted ASSEMBLY_REPORT paths — used to report stale receipt-only files. */
  receiptPaths: Set<string> | null;
}

export class OwnershipAdopter {
  private readonly live = new LiveManifestProject();

  async plan(request: AdoptOwnershipRequest): Promise<OwnershipAdoptionPlan> {
    const targetDir = resolve(request.targetDir);
    const projectName = request.projectName ?? "capsule";
    const live = await this.live.plan({
      mode: "update",
      targetDir,
      projectName,
    });
    const trust = await this.loadTrust(targetDir, request.reportPath);
    if (!this.hasTrust(trust)) {
      throw new Error(
        "Ownership adoption requires a trusted Builder receipt " +
          "(ASSEMBLY_REPORT.json, PRESET.md, package.json manifestPreset) " +
          "or an existing ownership.editableManifest record.",
      );
    }

    const ownershipContent = await readPathIfPresent(
      resolveTargetPath(targetDir, OWNERSHIP_MANIFEST_PATH),
    );
    const previous =
      ownershipContent === null ? null : this.parseOwnership(ownershipContent);
    const editablePaths = new Set(
      previous?.editableManifest?.paths ?? live.editablePaths,
    );
    const relinquish = new Set(live.relinquishOwnership);
    const adopted: OwnershipAdoptionEntry[] = [];
    const baselineRejected: string[] = [];
    const missingExpected: string[] = [];
    const skipped: string[] = [];
    const unprovenExisting: string[] = [];
    // Rebuild generated digests from proven on-disk paths only — do not keep
    // stale ownership entries for missing or unproven files.
    const nextFiles: OwnershipManifest["files"] = {};
    let nextPackage: PackageOwnership = {
      dependencies: {},
      devDependencies: {},
      scripts: {},
    };
    const preconditions: Record<string, string | null> = {
      [OWNERSHIP_MANIFEST_PATH]:
        ownershipContent === null ? null : hashContent(ownershipContent),
    };

    for (const [path, file] of live.generatedFiles) {
      if (editablePaths.has(path) || relinquish.has(path)) {
        skipped.push(path);
        continue;
      }
      if (this.isProtectedPath(path) || LOCKFILES.has(path.toLowerCase())) {
        skipped.push(path);
        continue;
      }
      const currentContent = await readPathIfPresent(
        resolveTargetPath(targetDir, path),
      );
      preconditions[path] =
        currentContent === null ? null : hashContent(currentContent);
      if (currentContent === null) {
        missingExpected.push(path);
        continue;
      }

      const currentHash = hashContent(currentContent);
      if (currentContent === file.content) {
        adopted.push({ path, kind: "identical", sha256: currentHash });
        nextFiles[path] = { sha256: currentHash };
      } else if (canReceiveBaselinedFlag(path)) {
        adopted.push({ path, kind: "baselined", sha256: currentHash });
        nextFiles[path] = { sha256: currentHash, baselined: true };
      } else {
        // Stock / non-seam path differs from candidate — refuse baselined:true.
        // Still claim the digest so ownership bootstraps; next regen overwrites.
        baselineRejected.push(path);
        adopted.push({ path, kind: "digest-only", sha256: currentHash });
        nextFiles[path] = { sha256: currentHash };
      }
      if (path === "package.json") {
        nextPackage = this.packageOwnershipBaseline(
          currentContent,
          file.content,
        );
      }
    }

    if (trust.receiptPaths) {
      for (const path of [...trust.receiptPaths].sort()) {
        if (editablePaths.has(path) || nextFiles[path] || relinquish.has(path))
          continue;
        if (this.isProtectedPath(path) || LOCKFILES.has(path.toLowerCase()))
          continue;
        if (live.generatedFiles.has(path)) continue;
        const current = await readPathIfPresent(
          resolveTargetPath(targetDir, path),
        );
        if (current !== null) unprovenExisting.push(path);
      }
    }

    return {
      targetDir,
      projectName,
      compiledFrom: live.compiledFrom,
      trust: {
        assemblyReport: trust.assemblyReport,
        presetMarkdown: trust.presetMarkdown,
        packageManifestPreset: trust.packageManifestPreset,
        editableManifest: trust.editableManifest,
      },
      adopted: adopted.sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
      baselineRejected: [...new Set(baselineRejected)].sort(),
      unprovenExisting: [...new Set(unprovenExisting)].sort(),
      missingExpected: missingExpected.sort(),
      skipped: [...new Set(skipped)].sort(),
      nextOwnership: {
        version: 1,
        files: this.sortRecord(nextFiles),
        package: {
          dependencies: this.sortRecord(nextPackage.dependencies),
          devDependencies: this.sortRecord(nextPackage.devDependencies),
          scripts: this.sortRecord(nextPackage.scripts),
        },
        editableManifest: previous?.editableManifest ?? {
          paths: [...live.editablePaths].sort(),
          configPath: live.configPath,
        },
      },
      preconditions,
      targetExisted: await existsPath(targetDir),
    };
  }

  async apply(plan: OwnershipAdoptionPlan): Promise<void> {
    await applyOwnershipManifest({
      targetDir: plan.targetDir,
      nextOwnership: plan.nextOwnership,
      preconditions: plan.preconditions,
      targetExisted: plan.targetExisted,
    });
  }

  /** Test hook: apply with forced failure after backup for rollback proof. */
  async applyWithHook(
    plan: OwnershipAdoptionPlan,
    beforeCommit: () => Promise<void>,
  ): Promise<void> {
    await applyOwnershipManifest(
      {
        targetDir: plan.targetDir,
        nextOwnership: plan.nextOwnership,
        preconditions: plan.preconditions,
        targetExisted: plan.targetExisted,
      },
      { beforeCommit },
    );
  }

  private hasTrust(trust: TrustSignals): boolean {
    return (
      trust.assemblyReport ||
      trust.presetMarkdown ||
      trust.packageManifestPreset ||
      trust.editableManifest
    );
  }

  private async loadTrust(
    targetDir: string,
    reportPath?: string,
  ): Promise<TrustSignals> {
    const reportAbsolute = reportPath
      ? resolve(reportPath)
      : join(targetDir, "ASSEMBLY_REPORT.json");
    let assemblyReport = false;
    let receiptPaths: Set<string> | null = null;
    const reportRaw = await readPathIfPresent(reportAbsolute);
    if (reportRaw !== null) {
      const parsed = this.parseAssemblyReport(reportRaw);
      if (parsed) {
        assemblyReport = true;
        receiptPaths = parsed;
      }
    }

    const presetRaw = await readPathIfPresent(join(targetDir, "PRESET.md"));
    const presetMarkdown = Boolean(
      presetRaw &&
      presetRaw.includes(CONVEX_APPLICATION_PRESET_ID) &&
      presetRaw.includes(`v${CONVEX_APPLICATION_PRESET_VERSION}`),
    );

    let packageManifestPreset = false;
    const packageRaw = await readPathIfPresent(join(targetDir, "package.json"));
    if (packageRaw !== null) {
      try {
        const pkg = JSON.parse(packageRaw) as {
          manifestPreset?: {
            id?: string;
            version?: string;
            complete?: boolean;
          };
        };
        packageManifestPreset =
          pkg.manifestPreset?.id === CONVEX_APPLICATION_PRESET_ID &&
          pkg.manifestPreset.version === CONVEX_APPLICATION_PRESET_VERSION &&
          pkg.manifestPreset.complete === true;
      } catch {
        packageManifestPreset = false;
      }
    }

    const ownershipRaw = await readPathIfPresent(
      resolveTargetPath(targetDir, OWNERSHIP_MANIFEST_PATH),
    );
    let editableManifest = false;
    if (ownershipRaw !== null) {
      const ownership = this.parseOwnership(ownershipRaw);
      editableManifest = Boolean(ownership?.editableManifest?.paths?.length);
    }

    return {
      assemblyReport,
      presetMarkdown,
      packageManifestPreset,
      editableManifest,
      receiptPaths,
    };
  }

  private parseAssemblyReport(raw: string): Set<string> | null {
    try {
      const value = JSON.parse(raw) as {
        complete?: boolean;
        verifyOk?: boolean;
        files?: unknown;
      };
      if (
        value.complete !== true ||
        value.verifyOk !== true ||
        !Array.isArray(value.files)
      ) {
        return null;
      }
      const paths = new Set<string>();
      for (const entry of value.files) {
        if (typeof entry === "string") paths.add(normalizeRelativePath(entry));
      }
      return paths.size > 0 ? paths : null;
    } catch {
      return null;
    }
  }

  private parseOwnership(raw: string): OwnershipManifest | null {
    try {
      const value = JSON.parse(raw) as OwnershipManifest;
      if (value.version !== 1 || !value.files || !value.package) return null;
      return value;
    } catch {
      return null;
    }
  }

  private packageOwnershipBaseline(
    currentContent: string,
    desiredContent: string,
  ): PackageOwnership {
    const current = JSON.parse(currentContent) as Record<string, unknown>;
    const desired = JSON.parse(desiredContent) as Record<string, unknown>;
    // Claim only entries that already match Builder requirements. Divergent
    // Capsule pins/scripts stay unclaimed so update reports package-entry-modified
    // instead of silently overwriting them.
    const pick = (
      section: "dependencies" | "devDependencies" | "scripts",
    ): Record<string, string> => {
      const desiredSection = this.stringRecord(desired[section]);
      const currentSection = this.stringRecord(current[section]);
      const result: Record<string, string> = {};
      for (const [name, desiredValue] of Object.entries(desiredSection)) {
        if (currentSection[name] === desiredValue) result[name] = desiredValue;
      }
      return result;
    };
    return {
      dependencies: pick("dependencies"),
      devDependencies: pick("devDependencies"),
      scripts: pick("scripts"),
    };
  }

  private stringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "string") result[key] = entry;
    }
    return result;
  }

  private sortRecord<T>(record: Record<string, T>): Record<string, T> {
    return Object.fromEntries(
      Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  private isProtectedPath(path: string): boolean {
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
}
