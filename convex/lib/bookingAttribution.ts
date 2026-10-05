/**
 * Revenue splits at booking and at apply (PL-ATTRIBUTION, spec §7.3 / §8.5).
 *
 * - Booking (EventApproved): the venue's commission term in force at that
 *   moment becomes the event's venue commission split - a draft that names
 *   the term, so later term edits never change it (AC-303, AC-321). Finance
 *   approves and applies it like any other split, and can change it with a
 *   reason (RevenueAttribution.changeSplit).
 * - Apply (RevenueAttributionApplied): the event's applied splits may not add
 *   up to more than the revenue they were applied against, unless a person
 *   recorded why on this split (allowOverRevenue) (AC-301).
 */
import { ConvexError } from "convex/values";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { formatMoneyExact } from "../../src/lib/format";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

/** The venue term in force at `at`: active, started, not yet ended; the
 * latest start wins when two overlap. */
export function termInForce(
  terms: readonly Doc<"venueCommissionTerms">[],
  venueId: string,
  at: number,
): Doc<"venueCommissionTerms"> | null {
  const live = terms.filter(
    (term) =>
      String(term.venueId) === venueId &&
      term.deletedAt == null &&
      term.definedAt != null &&
      term.status === "active" &&
      term.effectiveStartDate <= at &&
      (term.effectiveEndDate == null || term.effectiveEndDate >= at),
  );
  live.sort((a, b) => b.effectiveStartDate - a.effectiveStartDate);
  return live[0] ?? null;
}

export async function captureVenueTermAtBooking(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  const event = await ctx.db.get(eventId);
  if (!event || event.deletedAt != null || !event.venueId) return;
  const tenantId = event.tenantId;
  const splits = await ctx.db
    .query("revenueAttributions")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  // Approved again after a change: the first capture stays.
  if (
    splits.some(
      (row) =>
        row.deletedAt == null &&
        String(row.eventId) === String(eventId) &&
        row.attributionType === "venue_commission",
    )
  ) {
    return;
  }
  const terms = await ctx.db
    .query("venueCommissionTerms")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const term = termInForce(terms, String(event.venueId), Date.now());
  if (!term || Number(term.commissionPercent) <= 0) return;
  // Finance-only records: written as the company's system role, as part of
  // the approval the caller was allowed to make.
  const system = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
  await system.runMutation(api.mutations.RevenueAttribution_create, {
    eventId,
    attributionType: "venue_commission",
    allocationMethod: "percent",
    percentBasis: Number(term.commissionPercent),
    venueId: event.venueId,
    venueCommissionTermId: term._id,
    effectiveStartDate: term.effectiveStartDate,
    effectiveEndDate: term.effectiveEndDate ?? undefined,
    reason: "Venue commission term in force when the event was booked",
  });
}

export async function assertSplitsWithinRevenue(
  ctx: MutationCtx,
  attributionId: Id<"revenueAttributions">,
  eventRevenue: number,
): Promise<void> {
  const applied = await ctx.db.get(attributionId);
  if (!applied || applied.overRevenueReason) return;
  const splits = await ctx.db
    .query("revenueAttributions")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", applied.tenantId))
    .collect();
  const total = splits
    .filter(
      (row) =>
        row.deletedAt == null &&
        row.status === "applied" &&
        String(row.eventId) === String(applied.eventId),
    )
    .reduce((sum, row) => sum + Number(row.allocatedAmount), 0);
  if (total <= eventRevenue + 0.005) return;
  throw new ConvexError(
    `This event's splits would come to ${formatMoneyExact(total)}, more than its ${formatMoneyExact(eventRevenue)} revenue. Lower a split, or record why it may go over (Allow over revenue) and apply again.`,
  );
}
