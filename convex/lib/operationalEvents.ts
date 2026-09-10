import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { reconcileEventPrepWork } from "./prepWorkReconciliation";
import { reconcileDishPrep, standDownEventPrep } from "./prepRecipeEvents";
import { standDownEventPurchasing } from "./purchasingEvents";

/** Runs after declared reactions, inside the originating command transaction. */
export async function handleManifestEvent(
  ctx: MutationCtx,
  event: ConvexCommandEvent,
): Promise<void> {
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
    await standDownEventPurchasing(ctx, event.entityId as Id<"events">);
    await standDownEventPrep(
      ctx,
      { eventId: event.entityId as Id<"events"> },
      String(event.payload.reason),
    );
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
