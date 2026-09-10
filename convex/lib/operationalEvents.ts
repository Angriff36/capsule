import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { reconcileEventPrepWork } from "./prepWorkReconciliation";
import { reconcileDishPrep, standDownEventPrep } from "./prepRecipeEvents";
import { releaseEventInventoryHolds } from "./inventoryEvents";
import { standDownEventLogisticsAndBilling } from "./eventCancellation";
import { reconcileEventTiming } from "./eventTimingOperations";
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
  if (event.entity === "Event" &&
    ["EventTimingConfigured", "EventScheduleChanged"].includes(event.type)) {
    await reconcileEventTiming(ctx, event.entityId as Id<"events">);
    return;
  }
  if (event.entity === "EventTimelineActivity" &&
    event.type === "EventTimelineCalculatedTimingRequested") {
    await reconcileEventTiming(ctx, event.payload.eventId as Id<"events">);
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
