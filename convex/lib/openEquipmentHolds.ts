import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Only holds that can still take units (reserved, or out and not back) and
 * only open problems: returned, cancelled and resolved history is never read,
 * so a piece used at hundreds of events costs the same as a new one.
 */
const OPEN_HOLD = ["reserved", "checked_out"] as const;

export async function openHoldsForEquipment(
  ctx: Pick<QueryCtx, "db">,
  equipmentId: Id<"equipments">,
): Promise<Doc<"equipmentReservations">[]> {
  return (
    await Promise.all(
      OPEN_HOLD.map((status) =>
        ctx.db
          .query("equipmentReservations")
          .withIndex("by_equipmentId_and_status", (q) =>
            q.eq("equipmentId", equipmentId).eq("status", status),
          )
          .collect(),
      ),
    )
  ).flat();
}

export async function openHoldsForTenant(
  ctx: Pick<QueryCtx, "db">,
  tenantId: string,
): Promise<Doc<"equipmentReservations">[]> {
  return (
    await Promise.all(
      OPEN_HOLD.map((status) =>
        ctx.db
          .query("equipmentReservations")
          .withIndex("by_tenantId_and_status", (q) =>
            q.eq("tenantId", tenantId).eq("status", status),
          )
          .collect(),
      ),
    )
  ).flat();
}

export async function openIssuesForEquipment(
  ctx: Pick<QueryCtx, "db">,
  equipmentId: Id<"equipments">,
): Promise<Doc<"equipmentIssues">[]> {
  return await ctx.db
    .query("equipmentIssues")
    .withIndex("by_equipmentId_and_status", (q) =>
      q.eq("equipmentId", equipmentId).eq("status", "open"),
    )
    .collect();
}
