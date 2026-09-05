/**
 * Pure archive-revision delta (R2-9 / spec PR01-04).
 *
 * "A changed source revision produces an explicit delta against the prior
 * import, not a second copy." The delta is workbook-level — the archive
 * inventory owns workbook identity (name + content checksum), while record
 * level no-duplicate behavior lives in the ExternalRecordLink layer
 * (convex/importCommit.ts findLink, tenant-scoped, cross-run). This module
 * only names what changed between two inventories so the caller can hand
 * the operator an explicit listing instead of re-importing blindly.
 *
 * Derivable on demand from ImportArtifact checksums (single source of
 * truth): nothing is persisted twice.
 */

export interface ArchiveWorkbookDelta {
  /** The prior import this delta was computed against. */
  priorImportRunId: string;
  /** Same name, same content checksum — already inventoried and imported. */
  unchanged: string[];
  /** Same name, different checksum — a revised workbook. */
  changed: Array<{
    name: string;
    priorChecksum: string;
    checksum: string;
  }>;
  /** Names this archive introduces (no prior artifact). */
  added: string[];
  /** Prior names this archive no longer contains. */
  removed: string[];
}

/**
 * Compare the current inventory (name → content checksum) against a prior
 * import's. Buckets are sorted by name so the listing is deterministic.
 * A prior artifact with a null/unknown checksum never counts as unchanged —
 * it lands in `changed` so the operator looks at it rather than trusting a
 * comparison that could not be made.
 */
export function computeArchiveDelta(
  priorImportRunId: string,
  prior: ReadonlyMap<string, string | null | undefined>,
  current: ReadonlyMap<string, string>,
): ArchiveWorkbookDelta {
  const unchanged: string[] = [];
  const changed: ArchiveWorkbookDelta["changed"] = [];
  const added: string[] = [];

  for (const [name, checksum] of current) {
    if (!prior.has(name)) {
      added.push(name);
    } else if (prior.get(name) === checksum) {
      unchanged.push(name);
    } else {
      changed.push({
        name,
        priorChecksum: String(prior.get(name)),
        checksum,
      });
    }
  }

  const removed = [...prior.keys()].filter((name) => !current.has(name));

  return {
    priorImportRunId,
    unchanged: unchanged.sort(),
    changed: changed.sort((a, b) => a.name.localeCompare(b.name)),
    added: added.sort(),
    removed: removed.sort(),
  };
}
