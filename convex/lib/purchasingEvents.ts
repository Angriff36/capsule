import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { getAuthContext, requireTenant } from "./authContext";

/** Runs inside the authorized event cancellation; settled purchasing stays intact. */
export async function standDownEventPurchasing(
  ctx: MutationCtx,
  eventId: Id<"events">,
) {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || event.stage !== "cancelled")
    throw new Error("Purchasing stand-down requires a cancelled event");
  const needs = await ctx.db
    .query("purchaseNeeds")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  for (const need of needs) {
    if (
      need.tenantId !== tenantId ||
      need.deletedAt != null ||
      !["open", "ordered"].includes(need.status)
    )
      continue;
    await ctx.runMutation(api.mutations.PurchaseNeed_standDownWithEvent, {
      docId: need._id,
    });
  }
}
