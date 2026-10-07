import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

/**
 * Changes that can move an event's setup, load, briefing or safety buffer
 * (spec §8.4 recalculation, PL-TIMING AC-430). The venue, kitchen and
 * date also queue a drive-time check (routeFollowUp.ts).
 */
const EVENT_INPUTS = new Set([
  // A new event gets the company times straight away.
  "EventPlanned",
  "EventDraftCaptured",
  "EventVenueChanged",
  "EventScheduleChanged",
  "EventServiceStyleChanged",
  "EventHeadcountChanged",
  "EventOperatingLocationChosen",
  "EventTimingRuleRestored",
  "EventTimingConfigured",
]);
// Truck changes queue their own re-plan in convex/vehicleAssignment.ts.
const PACK_INPUTS = new Set(["PackListItemAdded", "PackListItemRemoved"]);
const COMPANY_INPUTS = new Set([
  "OrganizationTimingPolicyConfigured",
  "OrganizationRoutePolicyConfigured",
]);

/**
 * Queues a re-plan in its own transaction. The re-plan writes only when a
 * company-rule value differs, so its own EventTimingConfigured finds nothing
 * to change and stops.
 */
export async function queueTimingRecalculation(
  ctx: MutationCtx,
  event: ConvexCommandEvent,
): Promise<void> {
  const tenantId =
    typeof event.payload?.tenantId === "string" ? event.payload.tenantId : null;
  if (!tenantId) return;
  if (COMPANY_INPUTS.has(event.type)) {
    await ctx.scheduler.runAfter(
      0,
      internal.eventTimingRules.recalculateCompany,
      { tenantId },
    );
    return;
  }
  let eventId: string | null = null;
  if (event.entity === "Event" && EVENT_INPUTS.has(event.type)) {
    eventId = event.entityId;
  } else if (PACK_INPUTS.has(event.type)) {
    const listId =
      typeof event.payload?.packListId === "string"
        ? ctx.db.normalizeId("packLists", event.payload.packListId)
        : null;
    const list = listId ? await ctx.db.get(listId) : null;
    eventId = list && list.tenantId === tenantId ? String(list.eventId) : null;
  }
  const id = eventId ? ctx.db.normalizeId("events", eventId) : null;
  if (!id) return;
  await ctx.scheduler.runAfter(0, internal.eventTimingRules.recalculate, {
    tenantId,
    eventId: id,
  });
}
