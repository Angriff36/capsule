// The tax rates for a bill: the workspace's rates, narrowed to the event's
// venue's own list when the venue has one (src/features/finance/invoiceTax.ts
// ratesForVenue, the same rule the invoice form uses).

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { ratesForVenue } from "../../src/features/finance/invoiceTax";

export async function taxRatesFor(
  ctx: Pick<QueryCtx, "db">,
  tenantId: string,
  eventId: Id<"events"> | string | null | undefined,
): Promise<Doc<"taxRates">[]> {
  const rates = await ctx.db
    .query("taxRates")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const id = eventId ? ctx.db.normalizeId("events", String(eventId)) : null;
  const event = id ? await ctx.db.get(id) : null;
  const venue =
    event?.tenantId === tenantId && event.venueId
      ? await ctx.db.get(event.venueId)
      : null;
  return ratesForVenue(rates, venue?.tenantId === tenantId ? venue : null);
}
