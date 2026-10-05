/**
 * AUTHOR SEAM - PL-REPLACEMENT-PROOF (Goodshuffle dossier, BE-13 rentals):
 * what the client agreed to pay for rental items, per event, read from the
 * accepted proposal lines that name an equipment item. The rental report
 * uses it in place of "held quantity x list price" for those events.
 *
 * Read only. Gated on salesAccess, the same as the proposal line read policy
 * (src/sales/proposal-line-item.manifest); other readers get an empty list
 * and the report keeps its list-price estimate.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

export const acceptedRentalSales = query({
  args: { periodStart: v.number(), periodEnd: v.number() },
  handler: async (ctx, { periodStart, periodEnd }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["salesAccess"])) return [];
    const tenantId = auth.tenantId;
    const events = await ctx.db
      .query("events")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();
    const rows: Array<{ eventId: string; amount: number; lines: number }> = [];
    for (const event of events) {
      if (
        event.deletedAt != null ||
        event.startsAt == null ||
        event.startsAt < periodStart ||
        event.startsAt >= periodEnd
      )
        continue;
      const proposals = await ctx.db
        .query("proposals")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .collect();
      let amount = 0;
      let lines = 0;
      for (const proposal of proposals) {
        if (
          proposal.tenantId !== tenantId ||
          proposal.deletedAt != null ||
          proposal.status !== "accepted"
        )
          continue;
        const items = await ctx.db
          .query("proposalLineItems")
          .withIndex("by_proposalId", (q) => q.eq("proposalId", proposal._id))
          .collect();
        for (const line of items) {
          if (
            line.tenantId !== tenantId ||
            line.deletedAt != null ||
            line.removedAt != null ||
            !line.equipmentId
          )
            continue;
          amount += Number(line.amount);
          lines += 1;
        }
      }
      if (lines > 0) rows.push({ eventId: event._id, amount, lines });
    }
    return rows;
  },
});
