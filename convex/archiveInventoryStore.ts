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
      version: 0,
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
