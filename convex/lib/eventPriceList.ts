// Authored seam: an event's price list (2026-10-12).
//
// Caterers price an event line by line: each menu per guest or per dish, a
// dish priced differently for this one event, packages, rentals, staff and
// fees (the way Total Party Planner prices an event). Capsule keeps those lines
// on the proposal its "build from event" makes, so the event's price list IS
// that proposal: the draft the builds keep, or the proposal the client
// accepted. This seam finds it for the event's Money tab, and while the event
// is still being planned it makes the event's quoted price follow the list's
// total, so the event, the proposal and a draft invoice that follows the event
// show one number instead of three.

import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { getAuthContext } from "./authContext";
import { findGeneratedDraft } from "./proposalGenerateSources";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

/** Stages where the event's price can still change. */
const PRICEABLE = new Set(["quote", "planning", "pending_approval", "approved"]);

const cents = (value: unknown) => Math.round(Number(value ?? 0) * 100);

/** The proposal that holds this event's price lines, if there is one. */
async function priceListFor(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">,
): Promise<Doc<"proposals"> | null> {
  const draft = await findGeneratedDraft(ctx, event);
  if (draft) return draft;
  const proposals = (
    await ctx.db
      .query("proposals")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect()
  ).filter(
    (row) =>
      row.tenantId === event.tenantId &&
      row.deletedAt == null &&
      row.status === "accepted",
  );
  proposals.sort((a, b) => b._creationTime - a._creationTime);
  return proposals[0] ?? null;
}

export const forEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    const event = await ctx.db.get(eventId);
    if (!event || !auth.tenantId || event.tenantId !== auth.tenantId) return null;
    const list = await priceListFor(ctx, event);
    if (!list) return null;
    return {
      proposalId: list._id,
      status: String(list.status),
      subtotal: Number(list.subtotal ?? 0),
      taxAmount: Number(list.taxAmount ?? 0),
      discountAmount: Number(list.discountAmount ?? 0),
      total: Number(list.total ?? 0),
      // The event's price follows the list only while both can still change.
      followsEvent: list.status === "draft" && PRICEABLE.has(String(event.stage)),
    };
  },
});

/**
 * After the list's totals are worked out again: the event's quoted price
 * becomes the list's total, while the event is still being planned. Only the
 * event's own price list counts, never a second proposal someone drafted by
 * hand for the same event.
 */
export async function followEventPriceList(
  ctx: MutationCtx,
  proposalId: Id<"proposals">,
): Promise<void> {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal?.eventId || proposal.status !== "draft") return;
  const event = await ctx.db.get(proposal.eventId);
  if (
    !event ||
    event.deletedAt != null ||
    event.tenantId !== proposal.tenantId ||
    !PRICEABLE.has(String(event.stage))
  )
    return;
  const list = await findGeneratedDraft(ctx, event);
  if (!list || list._id !== proposal._id || list.generationJson == null) return;
  const total = Number(proposal.total ?? 0);
  if (!(total > 0) || cents(event.quotedPrice) === cents(total)) return;
  const system = TenantSystemCommandRunner.forTenant(ctx, event.tenantId).context;
  await system.runMutation(api.mutations.Event_changePricing, {
    docId: event._id,
    budgetAmount: Number(event.budgetAmount ?? 0),
    quotedPrice: total,
    idempotencyKey: `event-price-list:${proposalId}:${event.version ?? 0}:${cents(total)}`,
  });
}
