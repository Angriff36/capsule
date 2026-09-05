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

/** Allocate one blank ImportArtifact draft for the register command. */
export const allocateArtifactDraft = internalMutation({
  args: { tenantId: v.string(), importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.insert("importArtifacts", {
      tenantId: args.tenantId,
      importRunId: args.importRunId,
      name: "",
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

/** Existing live artifact names for a run — the re-run skip set. */
export const listArtifactNames = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("importArtifacts")
      .withIndex("by_importRunId", (q) => q.eq("importRunId", args.importRunId))
      .collect();
    return rows.filter((row) => row.deletedAt == null).map((row) => row.name);
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
