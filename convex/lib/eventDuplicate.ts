// Duplicate an Event into a fresh planning Event — authored seam
// (AC-239 remaining slice; AC-099 keeps completed actuals out of the copy).
//
// Pure orchestration of generated governed commands in ONE Convex
// transaction (an uncaught throw rolls everything back — same pattern as
// lib/proposalEventCreation):
//   1. Event_createViaPlanEngagement — creates the copy (salesAccess /
//      eventAccess policies, planEngagement guards).
//   2. EventDish_createViaAddToEvent — re-adds each live menu line as a NEW
//      planning line on the copy.
//
// Deliberately NOT copied: invoices, payments, signatures, reservations,
// prep tasks, production, deliveries, archive flags, stage or any lifecycle
// timestamp, soft-deleted / never-added / removed menu lines. The source
// Event is only ever read here. No operationKey / receipt on purpose: two
// clicks are two real duplicate events.
//
// The pre-check only fails fast with an operator-readable error; the
// generated commands are the authority and re-enforce tenant and guards.
import { mutation } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import { getAuthContext } from "./authContext";
import { EventDuplicatePlanning } from "./eventDuplicatePlanning";

export const duplicateEvent = mutation({
  args: {
    sourceEventId: v.id("events"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ docId: string; dishCount: number }> => {
    // A foreign or soft-deleted source id must look exactly like a missing
    // one (non-disclosing tenant check, same shape as proposalEventCreation).
    const source = await ctx.db.get(args.sourceEventId);
    const auth = await getAuthContext(ctx);
    if (
      !source ||
      !auth.tenantId ||
      auth.tenantId !== source.tenantId ||
      source.deletedAt != null
    ) {
      throw new Error("Event not found");
    }

    const eventArgs = EventDuplicatePlanning.planArgs(source);
    const created = await ctx.runMutation(
      api.mutations.Event_createViaPlanEngagement,
      eventArgs,
    );

    // Live menu lines only: soft-deleted, never-added, and removed lines are
    // not planning facts worth copying.
    const lines = await ctx.db
      .query("eventDishes")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.sourceEventId))
      .collect();
    const liveLines = lines.filter(
      (line) =>
        line.deletedAt == null &&
        line.addedAt != null &&
        line.removedAt == null,
    );
    for (const line of liveLines) {
      await ctx.runMutation(api.mutations.EventDish_createViaAddToEvent, {
        eventId: created.docId,
        dishId: line.dishId,
        quantityServings: line.quantityServings,
        dishName: line.dishName ?? undefined,
        headcountOverride: line.headcountOverride ?? undefined,
        course: line.course ?? undefined,
        serviceStyle: line.serviceStyle ?? undefined,
        specialInstructions: line.specialInstructions ?? undefined,
      });
    }

    return { docId: String(created.docId), dishCount: liveLines.length };
  },
});
