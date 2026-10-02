/**
 * Venue vendor policy at the event (PL-VENDOR-POLICY, spec §8.4, AC-319).
 *
 * A venue's vendor list says, per vendor: preferred, approved, restricted or
 * banned, with optional dates it is in force. At an event:
 * - banned: a rental or purchase order for that event naming the vendor is
 *   refused (the venue will not let them in);
 * - restricted: allowed, the pickers say "check with the venue first";
 * - preferred / approved: allowed, the pickers say so.
 * Only rules in force on the event's date count. Retired rules never count.
 */
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

export type VenueVendorStatus =
  "preferred" | "approved" | "restricted" | "banned";

const STRENGTH: Record<VenueVendorStatus, number> = {
  banned: 3,
  restricted: 2,
  preferred: 1,
  approved: 0,
};

function inForce(
  row: Doc<"venueVendorRelationships">,
  at: number | null,
): boolean {
  if (row.deletedAt != null) return false;
  if (at == null) return true;
  if (row.effectiveFrom != null && row.effectiveFrom > at) return false;
  if (row.effectiveUntil != null && row.effectiveUntil < at) return false;
  return true;
}

/** vendorId -> the strongest rule in force for this venue on that date. */
export async function venueVendorRules(
  ctx: Pick<QueryCtx, "db">,
  tenantId: string,
  venueId: string,
  at: number | null,
): Promise<Map<string, VenueVendorStatus>> {
  const rows = await ctx.db
    .query("venueVendorRelationships")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const rules = new Map<string, VenueVendorStatus>();
  for (const row of rows) {
    if (String(row.venueId) !== venueId || !inForce(row, at)) continue;
    const status = row.status as VenueVendorStatus;
    const current = rules.get(String(row.vendorId));
    if (current == null || STRENGTH[status] > STRENGTH[current]) {
      rules.set(String(row.vendorId), status);
    }
  }
  return rules;
}

/** Refuse a banned vendor for this event's venue (runs inside the step that
 * named the vendor, so nothing is saved). */
export async function assertVendorAllowedAtEvent(
  ctx: Pick<QueryCtx, "db">,
  eventId: string | null | undefined,
  vendorId: string | null | undefined,
): Promise<void> {
  if (!eventId || !vendorId) return;
  const event = await ctx.db.get(eventId as Id<"events">);
  if (!event || event.deletedAt != null || !event.venueId) return;
  const rules = await venueVendorRules(
    ctx,
    event.tenantId,
    String(event.venueId),
    event.startsAt ?? null,
  );
  if (rules.get(vendorId) !== "banned") return;
  const vendor = await ctx.db.get(vendorId as Id<"vendors">);
  const venue = await ctx.db.get(event.venueId as Id<"venues">);
  const vendorName =
    vendor && vendor.tenantId === event.tenantId ? vendor.name : "This vendor";
  const venueName =
    venue && venue.tenantId === event.tenantId ? venue.name : "this venue";
  throw new ConvexError(
    `${vendorName} is not allowed at ${venueName}. Pick another vendor, or change the venue's vendor list if the venue has changed its mind.`,
  );
}

/** The venue's vendor rules for one event, for the vendor pickers. */
export const forEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const event = await ctx.db.get(eventId);
    if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null)
      return [];
    if (!event.venueId) return [];
    const rules = await venueVendorRules(
      ctx,
      auth.tenantId,
      String(event.venueId),
      event.startsAt ?? null,
    );
    return [...rules].map(([vendorId, status]) => ({ vendorId, status }));
  },
});
