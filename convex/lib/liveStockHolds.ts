import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** One stock item's live holds (pending or active); released and used
 * holds are history and never read here. */
export async function liveStockHolds(
  ctx: Pick<QueryCtx, "db">,
  inventoryItemId: Id<"inventoryItems">,
): Promise<Doc<"inventoryReservations">[]> {
  return (
    await Promise.all(
      (["pending", "active"] as const).map((status) =>
        ctx.db
          .query("inventoryReservations")
          .withIndex("by_inventoryItemId_and_status", (q) =>
            q.eq("inventoryItemId", inventoryItemId).eq("status", status),
          )
          .collect(),
      ),
    )
  ).flat();
}
