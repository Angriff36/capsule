/**
 * AUTHOR SEAM — a scan that counts, and the kept record of it, in one save.
 *
 * The Scan box counts a pack line when a label is read, and every scan is
 * kept (PackScan). Saved one after the other from the page, a count could be
 * kept without its scan record. Here the count is the pack line's own
 * generated command (its rules and permissions apply unchanged) and the
 * record is PackScan.record, in one transaction: both are kept or neither.
 * A scan that counts nothing (wrong event, two lines match) is only a record,
 * saved with PackScan.record directly.
 */
import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";

const SHOWN = 50;

export const count = mutation({
  args: {
    packListItemId: v.id("packListItems"),
    /** The line's version the Scan box counted from; a stale one is refused. */
    version: v.number(),
    step: v.union(
      v.literal("pack"),
      v.literal("check"),
      v.literal("load"),
      v.literal("back"),
    ),
    /** The line's new amount for this step after the scan. */
    nextQuantity: v.number(),
    /** How many this scan added. */
    added: v.number(),
    /** Pack step: the line is now fully packed. */
    full: v.optional(v.boolean()),
    /** Load step: the truck being loaded. */
    loadAssignmentId: v.optional(v.string()),
    label: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const line = await ctx.db.get(args.packListItemId);
    if (!line || line.tenantId !== tenantId || line.deletedAt != null)
      throw new ConvexError("This pack line is not on the list any more.");
    const list = await ctx.db.get(line.packListId);
    if (!list || list.tenantId !== tenantId)
      throw new ConvexError("This pack list is not in your workspace.");
    const docId = line._id;

    if (args.step === "pack") {
      if (list.status === "draft")
        await ctx.runMutation(api.mutations.PackList_startPacking, {
          docId: list._id,
        });
      await ctx.runMutation(
        args.full
          ? api.mutations.PackListItem_markPacked
          : api.mutations.PackListItem_recordPackedCount,
        { docId, version: args.version, packedQuantity: args.nextQuantity },
      );
    } else if (args.step === "check") {
      await ctx.runMutation(api.mutations.PackListItem_recordChecked, {
        docId,
        version: args.version,
        checkedQuantity: args.nextQuantity,
      });
    } else if (args.step === "load") {
      await ctx.runMutation(api.mutations.PackListItem_recordLoaded, {
        docId,
        version: args.version,
        loadedQuantity: args.nextQuantity,
        loadAssignmentId: args.loadAssignmentId || undefined,
      });
    } else {
      // The other return amounts and the note are read here, inside the
      // same save, so a scan never overwrites what someone else counted.
      await ctx.runMutation(api.mutations.PackListItem_recordReturn, {
        docId,
        version: args.version,
        returnedQuantity: args.nextQuantity,
        usedQuantity: Number(line.usedQuantity ?? 0),
        lostQuantity: Number(line.lostQuantity ?? 0),
        damagedQuantity: Number(line.damagedQuantity ?? 0),
        finding: line.returnFinding?.trim() || undefined,
      });
    }

    await ctx.runMutation(api.mutations.PackScan_createViaRecord, {
      packListId: line.packListId,
      step: args.step,
      label: args.label,
      outcome: "ok",
      message: args.message,
      packListItemId: line._id,
      quantity: args.added,
    });
    return null;
  },
});

/** The latest scans on one pack list, newest first. */
export const listForPackList = query({
  args: { packListId: v.id("packLists") },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") return null;
    // The scans follow the pack list's own read rule.
    const list: unknown = await ctx.runQuery(api.queries.getPackList, {
      id: args.packListId,
    });
    if (list == null) return null;
    const rows = await ctx.db
      .query("packScans")
      .withIndex("by_packListId", (q) => q.eq("packListId", args.packListId))
      .order("desc")
      .take(SHOWN * 2);
    return rows
      .filter((row) => row.tenantId === auth.tenantId && row.deletedAt == null)
      .slice(0, SHOWN)
      .map((row) => ({
        _id: row._id,
        step: row.step,
        label: row.label,
        outcome: row.outcome,
        message: row.message,
        scannedAt: row.scannedAt ?? row._creationTime,
        personName: row.personName ?? "",
      }));
  },
});
