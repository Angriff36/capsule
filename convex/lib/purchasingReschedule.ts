import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { getAuthContext, requireTenant } from "./authContext";
import { releaseNeedDraftContributions } from "./purchasingEvents";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

/**
 * Runs inside Event.reschedule / Event.normalizePurchasingWeek after the
 * declared reactions (#328). Every OPEN purchase need still sitting on another
 * week leaves its editable weekly draft and re-opens on the event's current
 * week, where the existing weekly routing consolidates it with that week's
 * other events. Needs already ordered or fulfilled keep their week: that
 * supply was bought for a real order and stays historical. Live ingredient
 * demand moves with the event. Fulfilled and superseded demand stays put.
 *
 * The week move is a consequence of the reschedule the caller was already
 * authorized to make, so it runs as the tenant's system role: event and
 * sales staff can reschedule an event with open purchase needs without
 * holding purchasing permissions of their own, and PurchaseNeed.moveToWeek
 * keeps its inventory/manager policy for everyone who calls it directly.
 */
export async function moveEventPurchasingWeek(
  ctx: MutationCtx,
  eventId: Id<"events">,
) {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || event.deletedAt != null) return;
  const weekStart = event.purchasingWeekStart;
  if (weekStart == null) return;
  await alignLiveDemands(ctx, tenantId, eventId, weekStart);
  const needs = await ctx.db
    .query("purchaseNeeds")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  const movable = needs.filter(
    (need) =>
      need.tenantId === tenantId &&
      need.deletedAt == null &&
      need.status === "open" &&
      need.purchasingWeekStart !== weekStart,
  );
  if (movable.length === 0) return;
  const purchasing = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
  for (const need of movable) {
    try {
      await moveNeedToWeek(purchasing, need, weekStart);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Moving this event's purchasing to its new week did not complete, so the reschedule was not saved. ${detail}`,
      );
    }
  }
}

async function alignLiveDemands(
  ctx: MutationCtx,
  tenantId: string,
  eventId: Id<"events">,
  weekStart: number,
) {
  const demands = await ctx.db
    .query("ingredientDemands")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  const live = demands.filter(
    (demand) =>
      demand.tenantId === tenantId &&
      demand.deletedAt == null &&
      demand.purchasingWeekStart !== weekStart &&
      (demand.status === "pending" ||
        demand.status === "calculated" ||
        demand.status === "confirmed"),
  );
  if (live.length === 0) return;
  const purchasing = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
  for (const demand of live) {
    try {
      await purchasing.runMutation(
        api.mutations.IngredientDemand_alignPurchasingWeek,
        { docId: demand._id, version: demand.version },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Moving this event's ingredient list to its new week did not complete, so the reschedule was not saved. ${detail}`,
      );
    }
  }
}

async function moveNeedToWeek(
  ctx: MutationCtx,
  need: Doc<"purchaseNeeds">,
  weekStart: number,
) {
  await releaseNeedDraftContributions(
    ctx,
    need,
    "Event rescheduled to another purchasing week",
  );
  const current = await ctx.db.get(need._id);
  if (!current) return;
  await ctx.runMutation(api.mutations.PurchaseNeed_moveToWeek, {
    docId: current._id,
    version: current.version,
    purchasingWeekStart: weekStart,
  });
}
