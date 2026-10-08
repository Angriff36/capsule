// Stock lines for the stock screens, with only the holds a screen uses. The
// generated listInventoryItem attaches every hold ever made on each line
// (released and consumed ones too), and on the live server that read grew
// with every event. A screen that shows no holds now reads none; one that
// shows held and free stock gets the totals, or the active holds.
//
// Same read rule and computed fields as listInventoryItem; a role that may
// not read stock gets an empty list, as there.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

type Hold = Doc<"inventoryReservations">;

export type StockLine = Doc<"inventoryItems"> & {
  isBelowPar: boolean;
  isBelowReorder: boolean;
  inventoryValue: number;
  /** "totals" and "active" only: the sum of the line's active holds. */
  totalReserved?: number;
  availableQuantity?: number;
  /** "active" only: the line's active holds. */
  reservations?: Hold[];
  /**
   * "active" only: per supplier lot, the quantity already held or used
   * (active and consumed holds), for the lot allocation check.
   */
  lotAllocations?: { inventoryLotId: string; quantity: number }[];
};

export const stockLines = query({
  args: {
    holds: v.union(v.literal("none"), v.literal("totals"), v.literal("active")),
  },
  handler: async (ctx, { holds }): Promise<StockLine[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["inventoryAccess", "manageAccess"]))
      return [];
    const tenantId = auth.tenantId;
    const items = (
      await ctx.db
        .query("inventoryItems")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    ).filter((row) => row.deletedAt == null);
    return await Promise.all(
      items.map(async (item) => {
        const line: StockLine = {
          ...item,
          isBelowPar: item.parLevel > 0 && item.quantityOnHand < item.parLevel,
          isBelowReorder:
            item.reorderThreshold > 0 &&
            item.quantityOnHand < item.reorderThreshold,
          inventoryValue: item.quantityOnHand * item.unitCost,
        };
        if (holds === "none") return line;
        // No index on (item, status) yet: the line's holds are read, but
        // only the active ones are sent.
        const all = await ctx.db
          .query("inventoryReservations")
          .withIndex("by_inventoryItemId", (q) =>
            q.eq("inventoryItemId", item._id),
          )
          .collect();
        const active = all.filter((hold) => hold.status === "active");
        line.totalReserved = active.reduce(
          (sum, hold) =>
            sum + (typeof hold.quantity === "number" ? hold.quantity : 0),
          0,
        );
        line.availableQuantity = item.quantityOnHand - line.totalReserved;
        if (holds === "totals") return line;
        line.reservations = active;
        const byLot = new Map<string, number>();
        for (const hold of all) {
          if (hold.deletedAt != null || hold.inventoryLotId == null) continue;
          if (hold.status !== "active" && hold.status !== "consumed") continue;
          byLot.set(
            hold.inventoryLotId,
            (byLot.get(hold.inventoryLotId) ?? 0) + Number(hold.quantity),
          );
        }
        line.lotAllocations = [...byLot].map(([inventoryLotId, quantity]) => ({
          inventoryLotId,
          quantity,
        }));
        return line;
      }),
    );
  },
});
