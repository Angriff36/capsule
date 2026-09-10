import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { reconcileEventPrepWork } from "./prepWorkReconciliation";

/** Runs after declared reactions, inside the originating command transaction. */
export async function handleManifestEvent(
  ctx: MutationCtx,
  event: ConvexCommandEvent,
): Promise<void> {
  if (
    event.type !== "EventDishServingsAdjusted" ||
    event.entity !== "EventDish"
  )
    return;
  await reconcileEventPrepWork(ctx, {
    eventDishId: event.entityId as Id<"eventDishes">,
  });
}
