import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** The first number a workspace with no numbered events gets is FLOOR + 1. */
const FLOOR = 1000;
const NUMBER_SHAPE = /^\d{4,6}$/;

/**
 * Event numbers: the 4-digit number the shop calls an event by.
 *
 * Runs inside the writing transaction (`handleManifestEvent`):
 * - EventPlanned: a new event with no number gets the next one.
 * - EventNumberSet with no number: the same (the tracker's "Number it").
 * - EventNumberSet with a number: refused unless it is 4 to 6 digits and no
 *   other live event of the tenant holds it; a higher number moves the
 *   sequence up, so new events continue above a typed TPP number.
 *
 * Why a seam: a command cannot read its sibling rows or a sequence row, and a
 * reaction-param count would collect every event on every plan. Same design
 * as invoiceNumbering.ts. Lookups are indexed point reads.
 *
 * This module never writes an Event row (check:event-manifest). A typed number
 * is already on `Event.eventNumber`, written by the governed command that
 * emitted the event; a refused one throws and rolls that command back. A
 * number the seam gives goes into its own `eventNumberAssignments` row, so
 * planEngagement keeps the one version bump its callers expect.
 */
export async function ensureEventNumber(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  const event = await ctx.db.get(eventId);
  if (!event || event.deletedAt != null) return;
  const typed = event.eventNumber?.trim() ?? "";

  if (typed === "") {
    const given = await ctx.db
      .query("eventNumberAssignments")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .first();
    if (given) return;
    const row = await sequenceRow(ctx, event.tenantId);
    let next = Math.max(row.lastNumber, FLOOR) + 1;
    while (await isHeld(ctx, event.tenantId, String(next), eventId)) next += 1;
    const now = Date.now();
    await ctx.db.patch(row._id, { lastNumber: next, updatedAt: now });
    await ctx.db.insert("eventNumberAssignments", {
      tenantId: event.tenantId,
      eventId,
      eventNumber: String(next),
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  if (!NUMBER_SHAPE.test(typed)) {
    throw new Error("An event number is 4 digits, for example 6839.");
  }
  if (await isHeld(ctx, event.tenantId, typed, eventId)) {
    throw new Error(
      `Event number ${typed} is already used by another event. Choose a different number.`,
    );
  }
  const row = await sequenceRow(ctx, event.tenantId);
  const value = Number(typed);
  if (value > row.lastNumber) {
    await ctx.db.patch(row._id, { lastNumber: value, updatedAt: Date.now() });
  }
}

/** Whether another LIVE event of the tenant holds this number, typed or given. */
async function isHeld(
  ctx: MutationCtx,
  tenantId: string,
  eventNumber: string,
  exceptEventId: Id<"events">,
): Promise<boolean> {
  const typedRows = await ctx.db
    .query("events")
    .withIndex("by_eventNumber", (q) => q.eq("eventNumber", eventNumber))
    .collect();
  if (
    typedRows.some(
      (row) =>
        row.tenantId === tenantId &&
        row._id !== exceptEventId &&
        row.deletedAt == null,
    )
  )
    return true;

  const givenRows = await ctx.db
    .query("eventNumberAssignments")
    .withIndex("by_eventNumber", (q) => q.eq("eventNumber", eventNumber))
    .collect();
  for (const given of givenRows) {
    if (given.tenantId !== tenantId || given.eventId === exceptEventId)
      continue;
    const holder = await ctx.db.get(given.eventId as Id<"events">);
    // A typed number on the holder replaces the given one, which is then free.
    if (
      holder &&
      holder.deletedAt == null &&
      (holder.eventNumber?.trim() ?? "") === ""
    )
      return true;
  }
  return false;
}

async function sequenceRow(ctx: MutationCtx, tenantId: string) {
  const existing = await ctx.db
    .query("eventNumberSequences")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .first();
  if (existing) return existing;
  // First use in this workspace: start above the highest number already typed
  // (a shop that came from TPP has events numbered 68xx), so the next event
  // continues the shop's own run. One scan, once; later mints read the row.
  const events = await ctx.db
    .query("events")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  let lastNumber = FLOOR;
  for (const event of events) {
    const typed = event.eventNumber?.trim() ?? "";
    if (event.deletedAt == null && NUMBER_SHAPE.test(typed))
      lastNumber = Math.max(lastNumber, Number(typed));
  }
  const now = Date.now();
  const id = await ctx.db.insert("eventNumberSequences", {
    tenantId,
    lastNumber,
    createdAt: now,
    updatedAt: now,
  });
  return { _id: id, lastNumber };
}
