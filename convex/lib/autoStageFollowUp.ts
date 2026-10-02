import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { AUTO_STAGE_MOVES } from "../../src/lib/eventStageMoves";

/**
 * Changes that can meet an event's next-stage conditions (site comment #421)
 * queue one automatic stage check in its own transaction
 * (convex/eventAutoStage.ts). Changes to the event's times, timing plan or
 * stage also book the next clock move.
 */
const CHILD_ENTITIES = new Set(["EventDish", "EventAssignment"]);
const CLOCK_INPUTS = new Set([
  "EventScheduleChanged",
  "EventTimingConfigured",
  "EventTimingRuleRestored",
  "EventSubmittedForApproval",
  "EventApproved",
  "EventSalesLocked",
  "EventSalesLockConfirmed",
  "EventExecutionStarted",
  "EventFinalized",
]);
const COMPANY_INPUTS = new Set(["OrganizationStageMovesConfigured"]);
const MOVABLE_STAGES = new Set(AUTO_STAGE_MOVES.map((move) => move.from));
const NOT_STARTED_STAGES = new Set([
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
]);

export async function queueAutoStage(
  ctx: MutationCtx,
  event: ConvexCommandEvent,
): Promise<void> {
  const tenantId =
    typeof event.payload?.tenantId === "string" ? event.payload.tenantId : null;
  if (!tenantId) return;
  if (COMPANY_INPUTS.has(event.type)) {
    await ctx.scheduler.runAfter(0, internal.eventAutoStage.advanceCompany, {
      tenantId,
    });
    return;
  }
  const eventId =
    event.entity === "Event"
      ? event.entityId
      : CHILD_ENTITIES.has(event.entity) &&
          typeof event.payload?.eventId === "string"
        ? event.payload.eventId
        : null;
  const id = eventId ? ctx.db.normalizeId("events", eventId) : null;
  if (!id) return;
  // Nothing to move: a completed or cancelled event, or one that never got
  // going and is already over - an old event brought in by an import comes
  // in at planning with past dates and must start nothing (AC-091).
  const row = await ctx.db.get(id);
  if (!row || !MOVABLE_STAGES.has(String(row.stage))) return;
  const endedAt = Number(row.endsAt ?? row.startsAt);
  if (
    NOT_STARTED_STAGES.has(String(row.stage)) &&
    Number.isFinite(endedAt) &&
    endedAt < Date.now()
  ) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.eventAutoStage.advance, {
    tenantId,
    eventId: id,
    arm: CLOCK_INPUTS.has(event.type),
  });
}
