/**
 * AUTHOR SEAM — storage helpers for archive inventory (R2-3).
 *
 * Deliberately NOT "use node": the inventory action needs the Node runtime
 * for the zip reader's zlib inflate, but Convex only allows actions in the
 * Node runtime — these plain mutation/query helpers live here so the action
 * file can stay Node-only.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Allocate one blank ImportArtifact draft for the register command. The
 * draft carries the workbook NAME from allocation on: a crash between this
 * insert and the governed register leaves a findable, completable row
 * instead of an anonymous blank — the retry repairs it by re-running
 * register in creation mode on the same docId (see inventoryArchive).
 */
export const allocateArtifactDraft = internalMutation({
  args: {
    tenantId: v.string(),
    importRunId: v.id("importRuns"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("importArtifacts", {
      tenantId: args.tenantId,
      importRunId: args.importRunId,
      name: args.name,
      byteSize: 0,
      entryCount: 0,
      provenance: "{}",
      disposition: "pending",
      parseStatus: "pending",
      totalRowCount: 0,
      rowOutcomeCounts: "{}",
      version: 0,
    });
  },
});

/** Stamp createdAt/updatedAt on a registered artifact.
 *
 * The docId-contract register command guards `createdAt == null` (creation
 * mode) and does not itself stamp the timestamps-mixin fields, so a
 * registered artifact would stay timestamp-less and every command guarding
 * `createdAt != null` (recordParse, classify) would refuse it. This is the
 * same authored-stamp idiom startImport uses for import runs.
 */
export const stampArtifactCreated = internalMutation({
  args: { artifactId: v.id("importArtifacts") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.artifactId);
    if (!doc || doc.createdAt != null) return;
    const now = Date.now();
    await ctx.db.patch(args.artifactId, {
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Existing live artifact rows (id, name, createdAt) for a run — the re-run
 * skip/repair set. createdAt == null marks a draft the inventory action died
 * before finishing; the retry completes that row instead of skipping the
 * name forever.
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
        createdAt: row.createdAt ?? null,
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
