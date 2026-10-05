/**
 * Apply-time garbage collection for `.builder/baselines`.
 *
 * The ownership ledger references a blob only through `files[path].sha256`,
 * so after an apply every blob not named by the next ledger (or written by
 * this apply) is unreachable. Pruning runs ONLY inside apply — planning and
 * dry-run/--json never touch the store, and prune paths are deliberately kept
 * out of `plan.deletions` so downstream "pending change" counters stay honest.
 */
import {
  ProjectGenerationBaselineStore,
  baselineBlobPath,
} from "./projectGenerationBaselineStore";
import type { ProjectGenerationPlan } from "./projectGenerationTypes";

export function referencedBaselineDigests(
  plan: ProjectGenerationPlan,
): Set<string> {
  const keep = new Set<string>();
  for (const owned of Object.values(plan.nextOwnership.files))
    keep.add(owned.sha256);
  for (const digest of Object.keys(plan.baselineBlobs)) keep.add(digest);
  return keep;
}

export class ProjectGenerationBaselinePruner {
  constructor(private readonly store: ProjectGenerationBaselineStore) {}

  /** Digests on disk that the next ownership state will not reference. */
  async unreferencedDigests(plan: ProjectGenerationPlan): Promise<string[]> {
    const keep = referencedBaselineDigests(plan);
    const stored = await this.store.listDigests();
    return stored.filter((digest) => !keep.has(digest));
  }

  /** Relative blob paths to delete inside the apply transaction. */
  async prunePaths(
    plan: ProjectGenerationPlan,
  ): Promise<{ digests: string[]; paths: string[] }> {
    const digests = await this.unreferencedDigests(plan);
    return {
      digests,
      paths: digests.map((digest) => baselineBlobPath(digest)),
    };
  }
}
