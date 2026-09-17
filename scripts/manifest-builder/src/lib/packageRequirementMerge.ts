/**
 * Package.json section merge for project generation.
 * Dependencies use semver compatibility; scripts.dev is never Builder-claimed.
 */
import semver from "semver";
import type {
  PackageOwnership,
  ProjectGenerationConflict,
  ProjectGenerationConflictReason,
} from "./projectGenerationTypes";

/** Application frontend entry — Builder must not claim or replace this script. */
export const APP_OWNED_SCRIPT_DEV = "dev";

/** Convex-specific script owned by the Convex application preset. */
export const CONVEX_DEV_SCRIPT = "dev:convex";
export const CONVEX_DEV_SCRIPT_COMMAND = "convex dev";

export class PackageRequirementMerger {
  mergeSection(
    path: string,
    section: keyof PackageOwnership,
    current: Record<string, string>,
    previous: Record<string, string>,
    desired: Record<string, string>,
    conflicts: ProjectGenerationConflict[],
  ): Record<string, string> {
    const merged = { ...current };
    const desiredEntries =
      section === "scripts" ? this.scriptsWithoutAppOwnedDev(desired) : desired;

    for (const name of new Set([
      ...Object.keys(previous),
      ...Object.keys(desiredEntries),
    ])) {
      if (section === "scripts" && name === APP_OWNED_SCRIPT_DEV) continue;

      const oldRequirement = previous[name];
      const nextRequirement = desiredEntries[name];
      const currentRequirement = current[name];

      if (nextRequirement !== undefined) {
        if (currentRequirement === undefined) {
          merged[name] = nextRequirement;
          continue;
        }
        if (currentRequirement === nextRequirement) {
          merged[name] = nextRequirement;
          continue;
        }
        if (
          (section === "dependencies" || section === "devDependencies") &&
          this.currentSatisfiesRequired(currentRequirement, nextRequirement)
        ) {
          merged[name] = currentRequirement;
          continue;
        }
        if (currentRequirement === oldRequirement) {
          merged[name] = nextRequirement;
          continue;
        }
        conflicts.push(
          this.conflict(
            path,
            "package-entry-modified",
            `Cannot change ${section}.${name} from application value ${currentRequirement} to Builder requirement ${nextRequirement}.`,
          ),
        );
        continue;
      }

      if (
        oldRequirement !== undefined &&
        currentRequirement === oldRequirement
      ) {
        delete merged[name];
      }
    }
    return this.sortedRecord(Object.entries(merged));
  }

  /**
   * True when the application's version/range is acceptable for Builder's requirement.
   * Compatible app pins are preserved; only incompatible pins conflict.
   */
  currentSatisfiesRequired(
    currentRequirement: string,
    required: string,
  ): boolean {
    try {
      if (semver.valid(currentRequirement)) {
        return semver.satisfies(currentRequirement, required);
      }
      if (
        semver.validRange(currentRequirement) &&
        semver.validRange(required)
      ) {
        return semver.subset(currentRequirement, required);
      }
      const coerced = semver.coerce(currentRequirement);
      if (coerced && semver.validRange(required)) {
        return semver.satisfies(coerced.version, required);
      }
      return false;
    } catch {
      return false;
    }
  }

  ownershipFromDesired(desired: PackageOwnership): PackageOwnership {
    return {
      dependencies: { ...desired.dependencies },
      devDependencies: { ...desired.devDependencies },
      scripts: this.scriptsWithoutAppOwnedDev(desired.scripts),
    };
  }

  private scriptsWithoutAppOwnedDev(
    scripts: Record<string, string>,
  ): Record<string, string> {
    const result = { ...scripts };
    delete result[APP_OWNED_SCRIPT_DEV];
    return result;
  }

  private sortedRecord<T>(
    entries: Iterable<readonly [string, T]>,
  ): Record<string, T> {
    return Object.fromEntries(
      [...entries].sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  private conflict(
    path: string,
    reason: ProjectGenerationConflictReason,
    message: string,
  ): ProjectGenerationConflict {
    return { path, reason, message };
  }
}
