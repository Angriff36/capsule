import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { reconcileEventPrepWork } from "./prepWorkReconciliation";
import { reconcileDishPrep, standDownEventPrep } from "./prepRecipeEvents";
import { releaseEventInventoryHolds } from "./inventoryEvents";
import {
  standDownEventAssignments,
  standDownEventEquipmentReservations,
  standDownEventLogisticsAndBilling,
} from "./eventCancellation";
import { reconcileEventTiming } from "./eventTimingOperations";
import { eventStaffingReconciliation } from "./staffingReconciliation";
import { eventHeadcountReconciliation } from "./headcountReconciliation";
import { eventPackReconciliation } from "./packReconciliation";
import { eventDemandReconciliation } from "./demandReconciliation";
import { eventPrepReconciliation } from "./prepReconciliation";
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
import { moveEventPurchasingWeek } from "./purchasingReschedule";
import { ensureUniqueInvoiceNumber } from "./invoiceNumbering";
import { ensureEventNumber } from "./eventNumbering";
import { eventReconciliationIsolation } from "./reconciliationIsolation";
import { recordAcceptedProposalRevision } from "./proposalAcceptanceRevision";
import { deleteBlobIfOrphan } from "./blobs";

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
    await reconcileEventTiming(ctx, event.entityId as Id<"events">,
      { triggerEventId: String(event.eventId), triggerType: event.type });
    await eventStaffingReconciliation.run(ctx, event.entityId as Id<"events">,
      { triggerEventId: String(event.eventId), triggerType: event.type });
    return;
  }
  if (event.entity === "Event" && event.type === "EventHeadcountChanged") {
    // Menu + pack + demand sides: the EventDish.syncHeadcount,
    // PackListItem.syncContainerServings, and EventIngredientContribution
    // demand-sync fan-outs already ran; these record the §8.2 receipts (once
    // per input shape, one per domain).
    await eventHeadcountReconciliation.run(
      ctx,
      event.entityId as Id<"events">,
      { triggerEventId: String(event.eventId), triggerType: event.type },
      {
        previousHeadcount: Number(event.payload.previousHeadcount),
        newHeadcount: Number(event.payload.newHeadcount),
      },
    );
    await eventPackReconciliation.run(
      ctx,
      event.entityId as Id<"events">,
      { triggerEventId: String(event.eventId), triggerType: event.type },
      {
        previousHeadcount: Number(event.payload.previousHeadcount),
        newHeadcount: Number(event.payload.newHeadcount),
      },
    );
    await eventDemandReconciliation.run(
      ctx,
      event.entityId as Id<"events">,
      { triggerEventId: String(event.eventId), triggerType: event.type },
      {
        previousHeadcount: Number(event.payload.previousHeadcount),
        newHeadcount: Number(event.payload.newHeadcount),
      },
    );
    await eventPrepReconciliation.run(
      ctx,
      event.entityId as Id<"events">,
      { triggerEventId: String(event.eventId), triggerType: event.type },
      {
        previousHeadcount: Number(event.payload.previousHeadcount),
        newHeadcount: Number(event.payload.newHeadcount),
      },
    );
    return;
  }
  if (event.entity === "Organization" && event.type === "OrganizationBrandLogoSet") {
    // A replaced or removed logo leaves no orphan blob behind (#237).
    const previous = event.payload.previousStorageId;
    if (typeof previous === "string" && previous !== event.payload.storageId)
      await deleteBlobIfOrphan(ctx, previous);
    return;
  }
  if (event.entity === "Event" && event.type === "EventPurchasingWeekChanged") {
    if (event.payload.previousPurchasingWeekStart !== event.payload.purchasingWeekStart)
      await moveEventPurchasingWeek(ctx, event.entityId as Id<"events">);
    return;
  }
  if (event.entity === "Event" &&
    (event.type === "EventPlanned" || event.type === "EventNumberSet")) {
    // Every planned event gets the next 4-digit number; a typed one is checked.
    await ensureEventNumber(ctx, event.entityId as Id<"events">);
    return;
  }
  if (event.entity === "Proposal" && event.type === "ProposalAccepted") {
    // The acceptance transaction records WHICH revision was accepted
    // (AC-413/AC-434); a validation failure here rolls the acceptance — and
    // its cascade — back.
    await recordAcceptedProposalRevision(ctx, event);
    return;
  }
  if (event.entity === "Invoice" &&
    (event.type === "InvoiceIssued" || event.type === "InvoiceNumberAssigned")) {
    // A manually assigned number is validated exactly like an explicit one at issue.
    await ensureUniqueInvoiceNumber(
      ctx,
      event.entityId as Id<"invoices">,
      event.type === "InvoiceIssued" && event.payload.autoNumbered === true,
    );
    return;
  }
  if (event.entity === "EventTimelineActivity" &&
    event.type === "EventTimelineCalculatedTimingRequested") {
    await reconcileEventTiming(ctx, event.payload.eventId as Id<"events">,
      { triggerEventId: String(event.eventId), triggerType: event.type });
    await eventStaffingReconciliation.run(ctx, event.payload.eventId as Id<"events">,
      { triggerEventId: String(event.eventId), triggerType: event.type });
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
    const eventId = event.entityId as Id<"events">;
    const trigger = {
      triggerEventId: String(event.eventId),
      triggerType: event.type,
    };
    await reconcileEventStaffing(ctx, eventId);
    await releaseEventInventoryHolds(ctx, eventId);
    await standDownEventLogisticsAndBilling(ctx, eventId);
    await standDownEventEquipmentReservations(ctx, eventId);
    await standDownEventAssignments(ctx, eventId);
    const row = await ctx.db.get(eventId);
    if (row) {
      // AC-424: timing refuses a cancelled parent, so a bare throw here
      // would abort the cascade before purchasing stands down. Isolate.
      await eventReconciliationIsolation.run(ctx, {
        eventId: String(eventId),
        tenantId: row.tenantId,
        trigger,
        domains: [
          { name: "timing", run: () => reconcileEventTiming(ctx, eventId, trigger) },
          { name: "purchasing", run: () => standDownEventPurchasing(ctx, eventId) },
        ],
      });
    }
    await standDownEventPrep(ctx, { eventId }, String(event.payload.reason));
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
