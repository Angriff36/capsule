// The tax rates for a bill: the workspace's rates, narrowed to the event's
// venue's own list when the venue has one (src/features/finance/invoiceTax.ts
// ratesForVenue, the same rule the invoice form uses).

import type { Doc, Id } from "../_generated/dataModel";
import { mutation, type QueryCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { getAuthContext, requireTenant } from "./authContext";
import { orgCapabilityDeniesAction } from "./orgCapabilityGate";
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

// Finance staff and every manager role (finance_staff has financeAccess;
// manager roles have manageAccess in src/foundation/base.manifest).
const TAX_SETTER_ROLES = new Set([
  "admin",
  "owner",
  "system",
  "manager",
  "finance_manager",
  "finance_staff",
  "event_manager",
  "sales_manager",
  "kitchen_manager",
  "inventory_manager",
  "logistics_manager",
  "workforce_manager",
]);

/**
 * Set the tax rates charged at a venue. Only this workspace's own, existing
 * rates may be named; an empty list goes back to every active rate.
 */
export const setForVenue = mutation({
  args: { venueId: v.id("venues"), taxRateIds: v.array(v.id("taxRates")) },
  handler: async (ctx, { venueId, taxRateIds }) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    // Tax is part of the Finance area: when the workspace switches Finance
    // off, only an owner or admin still sets it.
    const switchedOff =
      orgCapabilityDeniesAction("financeAccess", auth.disabledCapabilities) &&
      !["owner", "admin", "system"].includes(auth.role);
    if (!TAX_SETTER_ROLES.has(auth.role) || switchedOff)
      throw new ConvexError("Finance staff or a manager sets a venue's tax.");
    const venue = await ctx.db.get(venueId);
    if (!venue || venue.tenantId !== tenantId || venue.deletedAt != null)
      throw new ConvexError("That venue is not available any more.");
    const ids: string[] = [];
    for (const id of new Set(taxRateIds)) {
      const rate = await ctx.db.get(id);
      if (!rate || rate.tenantId !== tenantId || rate.deletedAt != null)
        throw new ConvexError("One of those tax rates is not available any more.");
      ids.push(String(id));
    }
    await ctx.db.patch(venueId, {
      taxRateIds: ids,
      version: (venue.version ?? 0) + 1,
      updatedAt: Date.now(),
    });
    return { taxRateIds: ids };
  },
});
