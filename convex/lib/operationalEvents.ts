import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { reconcileEventPrepWork } from "./prepWorkReconciliation";
import { reconcileDishPrep, standDownEventPrep } from "./prepRecipeEvents";
import { releaseEventInventoryHolds } from "./inventoryEvents";
import { standDownEventLogisticsAndBilling } from "./eventCancellation";
import { reconcileEventTiming } from "./eventTimingOperations";
import {
  reconcileEventStaffing, reflectManualEventShiftTiming, validateAutomaticEventShift,
  validateEventStaffingReferences, validateEventStaffingTiming,
  applyApprovedEventStaffingSwap, validateEventStaffingSwap,
  removeCancelledStaffNeedCoverage, validateStaffNeedCoverageRemoval,
  prepareStaffNeedCoverageChange, validatePreparedStaffNeedCoverage, finishPostedStaffNeedContinuation,
  validateFilledCoverageCredentials,
} from "./eventStaffingOperations";
import { validateScheduledShift, validateShiftWindow } from "./shiftSchedulingEvents";
import {
  adoptLegacyDraftQuantity,
  reconcileCancelledPurchaseDrafts,
  retireUnusedAutomaticDraft,
  standDownEventPurchasing,
} from "./purchasingEvents";

/** Runs after declared reactions, inside the originating command transaction. */
export async function handleManifestEvent(
  ctx: MutationCtx,
  event: ConvexCommandEvent,
): Promise<void> {
  if (event.entity === "EventStaffNeed" && event.type === "EventStaffNeedCoverageChangeRequested") {
    await prepareStaffNeedCoverageChange(ctx, event.entityId as Id<"eventStaffNeeds">);
    return;
  }
  if (event.entity === "EventStaffNeed" && event.type === "EventStaffNeedCoverageContinuationPrepared") {
    await validatePreparedStaffNeedCoverage(ctx, event.entityId as Id<"eventStaffNeeds">);
    return;
  }
  if (event.entity === "EventStaffNeed" && event.type === "EventStaffNeedPosted") {
    await finishPostedStaffNeedContinuation(ctx, event.entityId as Id<"eventStaffNeeds">);
  }
  if (event.entity === "EventStaffNeed" && event.type === "EventStaffNeedFilled") {
    await validateFilledCoverageCredentials(ctx, event.entityId as Id<"eventStaffNeeds">);
  }
  if (event.entity === "Shift" && event.type === "ShiftStaffNeedCoverageRemoved") {
    await validateStaffNeedCoverageRemoval(ctx, event.entityId as Id<"shifts">, event.payload);
    return;
  }
  if (event.entity === "EventStaffNeed" && event.type === "EventStaffNeedCancelled") {
    await removeCancelledStaffNeedCoverage(ctx, event.entityId as Id<"eventStaffNeeds">);
  }
  if (event.entity === "Shift" && event.type === "ShiftSwapped") {
    await validateScheduledShift(ctx, event.entityId as Id<"shifts">);
    await applyApprovedEventStaffingSwap(ctx, event.entityId as Id<"shifts">,
      event.payload.shiftSwapRequestId as Id<"shiftSwapRequests">);
    return;
  }
  if ((event.entity === "EventAssignment" && event.type === "EventAssignmentShiftSwapApplied") ||
    (event.entity === "EventStaffNeed" && event.type === "EventStaffNeedShiftSwapApplied")) {
    await validateEventStaffingSwap(ctx, event.entity, event.entityId, event.payload);
    return;
  }
  if (event.entity === "Shift" && ["ShiftScheduled", "ShiftRescheduled"].includes(event.type)) {
    await validateScheduledShift(ctx, event.entityId as Id<"shifts">);
    if (event.type === "ShiftRescheduled")
      await reflectManualEventShiftTiming(ctx, event.entityId as Id<"shifts">);
    else await validateAutomaticEventShift(ctx, event.entityId as Id<"shifts">, "schedule");
    return;
  }
  if (event.entity === "Shift" && event.type === "ShiftEventTimingPlanned") {
    await validateShiftWindow(ctx, event.entityId as Id<"shifts">, true);
    await validateAutomaticEventShift(ctx, event.entityId as Id<"shifts">, "plan");
    return;
  }
  if (event.entity === "Shift" && event.type === "ShiftEventTimingRetired") {
    await validateAutomaticEventShift(ctx, event.entityId as Id<"shifts">, "retire");
    return;
  }
  if ((event.entity === "EventAssignment" && event.type === "EventAssignmentAssigned") ||
    (event.entity === "EventStaffNeed" && ["EventStaffNeedPosted", "EventStaffNeedClaimed", "EventStaffNeedFilled"].includes(event.type))) {
    await validateEventStaffingReferences(ctx, event.payload.eventId as Id<"events">, event.payload.personId as Id<"people"> | undefined);
  }
  if ((event.entity === "EventAssignment" && event.type === "EventAssignmentTimingChanged") ||
    (event.entity === "EventStaffNeed" && event.type === "EventStaffNeedTimingChanged")) {
    await validateEventStaffingTiming(ctx, event.entity, event.entityId, event.payload.synchronizeShifts);
  }
  if (event.entity === "Event" &&
    ["EventTimingConfigured", "EventScheduleChanged"].includes(event.type)) {
    await reconcileEventTiming(ctx, event.entityId as Id<"events">);
    await reconcileEventStaffing(ctx, event.entityId as Id<"events">);
    return;
  }
  if (event.entity === "EventTimelineActivity" &&
    event.type === "EventTimelineCalculatedTimingRequested") {
    await reconcileEventTiming(ctx, event.payload.eventId as Id<"events">);
    await reconcileEventStaffing(ctx, event.payload.eventId as Id<"events">);
    return;
  }
  if ((event.entity === "EventAssignment" &&
    ["EventAssignmentAssigned", "EventAssignmentUnassigned", "EventAssignmentTimingChanged"].includes(event.type)) ||
    (event.entity === "EventStaffNeed" &&
    ["EventStaffNeedPosted", "EventStaffNeedFilled", "EventStaffNeedCancelled", "EventStaffNeedTimingChanged"].includes(event.type)) ||
    (event.entity === "EventTimelineActivity" &&
    ["EventTimelineActivityScheduled", "EventTimelineActivityAdjusted", "EventTimelineActivityRemoved", "EventTimelineActivityReopened"].includes(event.type))) {
    if (event.payload.synchronizeShifts !== false)
      await reconcileEventStaffing(ctx, event.payload.eventId as Id<"events">);
    return;
  }
  if (
    event.entity === "VendorOrderLine" &&
    event.type === "VendorOrderLineRequirementReconciled"
  ) {
    await retireUnusedAutomaticDraft(
      ctx,
      event.entityId as Id<"vendorOrderLines">,
    );
    return;
  }
  if (
    event.entity === "VendorOrderLine" &&
    event.type === "VendorOrderLineWeeklyEnsured"
  ) {
    await adoptLegacyDraftQuantity(
      ctx,
      event.entityId as Id<"vendorOrderLines">,
      event.eventId,
    );
    return;
  }
  if (
    event.entity === "PurchaseNeed" &&
    event.type === "PurchaseNeedCancelled"
  ) {
    await reconcileCancelledPurchaseDrafts(
      ctx,
      event.entityId as Id<"purchaseNeeds">,
    );
    return;
  }
  if (
    event.entity === "DishTask" &&
    ["DishTaskAdded", "DishTaskRevised", "DishTaskRetired"].includes(event.type)
  ) {
    if (event.payload.synchronizePrep !== false)
      await reconcileDishPrep(ctx, event.entityId as Id<"dishTasks">);
    return;
  }
  if (event.entity === "EventDish" && event.type === "EventDishRemoved") {
    await standDownEventPrep(
      ctx,
      { eventDishId: event.entityId as Id<"eventDishes"> },
      String(event.payload.reason),
    );
    return;
  }
  if (event.entity === "Event" && event.type === "EventCancelled") {
    await reconcileEventStaffing(ctx, event.entityId as Id<"events">);
    await releaseEventInventoryHolds(ctx, event.entityId as Id<"events">);
    await standDownEventLogisticsAndBilling(
      ctx,
      event.entityId as Id<"events">,
    );
    await standDownEventPurchasing(ctx, event.entityId as Id<"events">);
    await standDownEventPrep(
      ctx,
      { eventId: event.entityId as Id<"events"> },
      String(event.payload.reason),
    );
    return;
  }
  if (event.entity === "Event" && event.type === "EventCompleted") {
    await releaseEventInventoryHolds(ctx, event.entityId as Id<"events">);
    return;
  }
  if (
    event.type !== "EventDishServingsAdjusted" ||
    event.entity !== "EventDish"
  )
    return;
  await reconcileEventPrepWork(ctx, {
    eventDishId: event.entityId as Id<"eventDishes">,
  });
}
