import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { getAuthContext, requireTenant } from "./authContext";
import { reconcileEventPrepWork } from "./prepWorkReconciliation";

/** Recipe commands update only current event work; historical events stay intact. */
export async function reconcileDishPrep(
  ctx: MutationCtx,
  dishTaskId: Id<"dishTasks">,
) {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const template = await ctx.db.get(dishTaskId);
  if (!template || template.tenantId !== tenantId)
    throw new Error("Recipe step not found");
  const selections = await ctx.db
    .query("eventDishes")
    .withIndex("by_dishId", (q) => q.eq("dishId", template.dishId))
    .collect();
  for (const selection of selections) {
    if (
      selection.tenantId !== tenantId ||
      selection.deletedAt != null ||
      selection.removedAt != null
    )
      continue;
    const event = await ctx.db.get(selection.eventId);
    if (
      !event ||
      event.tenantId !== tenantId ||
      event.deletedAt != null ||
      ["completed", "closed_out", "cancelled"].includes(event.stage)
    )
      continue;
    await reconcileEventPrepWork(ctx, { eventDishId: selection._id });
  }
}

/** Invoked by an already-authorized removal/cancellation command, never a public API. */
export async function standDownEventPrep(
  ctx: MutationCtx,
  scope: { eventId: Id<"events"> } | { eventDishId: Id<"eventDishes"> },
  reason: string,
) {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const tasks =
    "eventId" in scope
      ? await ctx.db
          .query("prepTasks")
          .withIndex("by_eventId", (q) => q.eq("eventId", scope.eventId))
          .collect()
      : await ctx.db
          .query("prepTasks")
          .withIndex("by_eventDishId", (q) =>
            q.eq("eventDishId", scope.eventDishId),
          )
          .collect();
  for (const task of tasks) {
    if (
      task.tenantId !== tenantId ||
      task.deletedAt != null ||
      ["completed", "cancelled"].includes(task.status)
    )
      continue;
    await ctx.runMutation(api.mutations.PrepTask_standDown, {
      docId: task._id,
      reason,
    });
  }
}
