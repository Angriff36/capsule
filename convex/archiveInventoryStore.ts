/**
 * AUTHOR SEAM — storage helpers for archive inventory (R2-3).
 *
 * Deliberately NOT "use node": the inventory action needs the Node runtime
 * for the zip reader's zlib inflate, but Convex only allows actions in the
 * Node runtime — these plain mutation/query helpers live here so the action
 * file can stay Node-only.
 */
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

// ~~allocateArtifactDraft / stampArtifactCreated~~ (removed 2026-09-29): the
// inventory action used to raw-insert a blank draft, register it in creation
// mode and raw-stamp its timestamps in three transactions. It now creates
// each row with the generated ImportArtifact_createViaRegister, which
// creates, stamps and emits ImportArtifactRegistered in one transaction, so
// no new crash-window drafts can exist. Legacy drafts are completed by the
// instance form of ImportArtifact_register (see inventoryArchive).

/**
 * Existing live artifact rows (id, name, checksum, registered) for a run —
 * the re-run skip/repair set. A row that is not registered (no registeredAt
 * and no createdAt) is a legacy draft the old three-step inventory died
 * before finishing; the retry completes that row instead of skipping the
 * name forever. Rows registered before registeredAt existed carry createdAt
 * (2026-09-29). checksum lets the caller prove the rows belong to the
 * archive it is holding before treating them as same-run state.
 */
export const listArtifactRows = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("importArtifacts")
      .withIndex("by_importRunId", (q) => q.eq("importRunId", args.importRunId))
      .collect();
    return rows
      .filter((row) => row.deletedAt == null)
      .map((row) => ({
        id: row._id,
        name: row.name,
        checksum: row.checksum ?? null,
        registered: row.registeredAt != null || row.createdAt != null,
      }));
  },
});

/** Live artifact rows for a run — the classification working set. */
export const listArtifacts = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("importArtifacts")
      .withIndex("by_importRunId", (q) => q.eq("importRunId", args.importRunId))
      .collect();
    return rows.filter((row) => row.deletedAt == null);
  },
});

/**
 * The most recent prior run in this tenant that inventoried an archive
 * (R2-9 / PR01-04 — the identical-bytes short-circuit and the revision-delta
 * baseline). Excludes the given run, deleted runs, and REVERTED runs: a
 * revert supersedes the run's links and rolls its records back, so bytes
 * identical to a reverted import must re-inventory instead of no-op —
 * re-materializing after a revert is not a duplicate.
 *
 * Tie-break when createdAt collides (same millisecond): greater _id string —
 * arbitrary but deterministic; the delta is an advisory operator listing,
 * never a gate. `archiveChecksum` narrows the match to a specific archive.
 */
export const findPriorArchivedRun = internalQuery({
  args: {
    tenantId: v.string(),
    excludeImportRunId: v.id("importRuns"),
    archiveChecksum: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ importRunId: string; archiveChecksum: string } | null> => {
    const runs = await ctx.db
      .query("importRuns")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    const candidates = runs
      .filter(
        (run) =>
          run._id !== args.excludeImportRunId &&
          run.deletedAt == null &&
          run.status !== "reverted" &&
          run.archiveChecksum != null &&
          (args.archiveChecksum === undefined ||
            run.archiveChecksum === args.archiveChecksum),
      )
      .sort(
        (a, b) =>
          (b.createdAt ?? 0) - (a.createdAt ?? 0) ||
          (b._id > a._id ? 1 : b._id < a._id ? -1 : 0),
      );
    const winner = candidates[0];
    return winner
      ? {
          importRunId: winner._id,
          archiveChecksum: winner.archiveChecksum as string,
        }
      : null;
  },
});

/** Live name → checksum pairs for a run's artifacts — the delta input. */
export const listArtifactChecksums = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ name: string; checksum: string | null }>> => {
    const rows = await ctx.db
      .query("importArtifacts")
      .withIndex("by_importRunId", (q) => q.eq("importRunId", args.importRunId))
      .collect();
    return rows
      .filter((row) => row.deletedAt == null)
      .map((row) => ({ name: row.name, checksum: row.checksum ?? null }));
  },
});
