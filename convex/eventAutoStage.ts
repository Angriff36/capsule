// Authored seam: events move through their stages by themselves (site
// comment #421). After any change that can meet a stage's conditions, and at
// the event's own clock times, this step runs the event's governed stage
// command as the company's system role - guards, history and follow-ups run
// exactly as when a person presses the button. Stages the company keeps by
// hand (Organization.stageMovesByHandJson, default: sales lock) never move
// here. The rules live in src/lib/eventStageMoves.ts.

import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";
import {
  nextAutoStageStep,
  parseByHand,
  staffOffAt,
  staffOnAt,
  type AutoStageCommand,
  type AutoStageFacts,
} from "../src/lib/eventStageMoves";

const COMMANDS = {
  submitForApproval: api.mutations.Event_submitForApproval,
  approve: api.mutations.Event_approve,
  lockForSales: api.mutations.Event_lockForSales,
  beginExecution: api.mutations.Event_beginExecution,
  finalizeEvent: api.mutations.Event_finalizeEvent,
  complete: api.mutations.Event_complete,
} satisfies Record<AutoStageCommand, unknown>;

const FINISHED_STAGES = new Set(["completed", "closed_out", "cancelled"]);

/** No event walks more than the whole track in one run. */
const MAX_MOVES = 6;

async function byHandStages(ctx: MutationCtx, tenantId: string) {
  const organization = (
    await ctx.db
      .query("organizations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).find((row) => row.deletedAt == null);
  return parseByHand(organization?.stageMovesByHandJson);
}

async function eventFacts(
  ctx: MutationCtx,
  event: Doc<"events">,
): Promise<AutoStageFacts> {
  const client = event.clientId ? await ctx.db.get(event.clientId) : null;
  const dishes = await ctx.db
    .query("eventDishes")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .collect();
  const assignments = await ctx.db
    .query("eventAssignments")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .collect();
  return {
    stage: String(event.stage),
    deletedAt: event.deletedAt,
    archivedAt: event.archivedAt,
    title: event.title,
    clientId: event.clientId,
    hasAssignedClient: client != null && client.deletedAt == null,
    plannedAt: event.plannedAt,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    expectedHeadcount: event.expectedHeadcount,
    hasMenuDishes: dishes.some(
      (dish) => dish.deletedAt == null && dish.removedAt == null,
    ),
    hasStaffAssigned: assignments.some(
      (row) => row.deletedAt == null && row.status !== "unassigned",
    ),
    venueId: event.venueId,
    venueName: event.venueName,
    serviceStyleId: event.serviceStyleId,
    // The style's name decides if staff are needed; the event may hold only
    // the style's id.
    serviceStyleName:
      event.serviceStyleName ??
      (event.serviceStyleId
        ? ((await ctx.db.get(event.serviceStyleId))?.name ?? null)
        : null),
    staffOnAt: staffOnAt(event),
    staffOffAt: staffOffAt(event),
  };
}

/**
 * Moves one event as far as its conditions allow. With `arm`, a clock move
 * still ahead gets a run booked at its time (a run that finds the time moved
 * books again, so a changed time is followed).
 */
export const advance = internalMutation({
  args: {
    tenantId: v.string(),
    eventId: v.id("events"),
    arm: v.optional(v.boolean()),
  },
  handler: async (ctx, { tenantId, eventId, arm }) => {
    const byHand = await byHandStages(ctx, tenantId);
    const system = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
    const moved: string[] = [];
    for (let step = 0; step < MAX_MOVES; step++) {
      const event = await ctx.db.get(eventId);
      if (!event || event.tenantId !== tenantId) break;
      const next = nextAutoStageStep(
        await eventFacts(ctx, event),
        byHand,
        Date.now(),
      );
      if (next.kind === "wait" && arm) {
        await ctx.scheduler.runAt(next.until, internal.eventAutoStage.advance, {
          tenantId,
          eventId,
          arm: true,
        });
      }
      if (next.kind !== "move") break;
      await system.runMutation(COMMANDS[next.command], {
        docId: eventId,
        version: event.version,
      });
      moved.push(next.to);
    }
    return { moved };
  },
});

/** Every open event of the company looks again (after the setting changes). */
export const advanceCompany = internalMutation({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();
    let queued = 0;
    for (const event of events) {
      if (event.deletedAt != null || FINISHED_STAGES.has(String(event.stage)))
        continue;
      await ctx.scheduler.runAfter(0, internal.eventAutoStage.advance, {
        tenantId,
        eventId: event._id,
        arm: true,
      });
      queued++;
    }
    return { queued };
  },
});

/**
 * The event page asks once when it opens, so events made before automatic
 * moves existed (and nothing has changed since) still move and book their
 * clock times.
 */
export const check = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const event = await ctx.db.get(eventId);
    if (!event || event.tenantId !== tenantId) return null;
    if (event.deletedAt != null || FINISHED_STAGES.has(String(event.stage)))
      return null;
    await ctx.scheduler.runAfter(0, internal.eventAutoStage.advance, {
      tenantId,
      eventId: eventId as Id<"events">,
      arm: true,
    });
    return null;
  },
});
