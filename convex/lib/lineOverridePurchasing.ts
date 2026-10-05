import type { MutationCtx } from "../_generated/server";
import { writeReconciledEventDemand } from "../culinaryDemand";
import { getAuthContext, requireTenant } from "./authContext";
import { standInPurchaseNeedOpener } from "./standInPurchaseNeed";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

/**
 * A kitchen line change (no onions, use shallots) is already allowed for
 * kitchen staff. Purchasing rows are inventory-gated, so the shopping list
 * used to keep the original ingredient until someone with inventory access
 * pressed Recalculate — and that button stays hidden once the old list looks
 * complete. Moving the shopping list is a consequence of the change the
 * kitchen was already allowed to make, so it runs as the tenant's system
 * role. The master recipe is not rewritten.
 */
export class LineOverridePurchasingFollowThrough {
  async apply(
    ctx: MutationCtx,
    eventIdRaw: unknown,
    overrideIdRaw: unknown,
  ): Promise<void> {
    if (typeof eventIdRaw !== "string" || eventIdRaw.length === 0) return;
    const tenantId = requireTenant(await getAuthContext(ctx));
    const eventId = ctx.db.normalizeId("events", eventIdRaw);
    if (eventId == null) return;
    const event = await ctx.db.get(eventId);
    if (event == null || event.tenantId !== tenantId || event.deletedAt != null) {
      return;
    }
    const purchasing = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
    await writeReconciledEventDemand(purchasing, eventId);
    await standInPurchaseNeedOpener.open(purchasing, eventId, overrideIdRaw);
  }

  /**
   * #401: a guest-count change rescales every ingredient line of the dish to
   * the new servings, which knows nothing about a kitchen swap (onion and
   * shallot both jumped to the full count). When the dish has a live swap,
   * the full demand calculation runs again so the swapped portions stay
   * swapped. Dishes with no swap keep the plain rescale.
   */
  async afterServingsChange(
    ctx: MutationCtx,
    eventDishIdRaw: unknown,
  ): Promise<void> {
    if (typeof eventDishIdRaw !== "string") return;
    const eventDishId = ctx.db.normalizeId("eventDishes", eventDishIdRaw);
    if (eventDishId == null) return;
    const tenantId = requireTenant(await getAuthContext(ctx));
    const eventDish = await ctx.db.get(eventDishId);
    if (eventDish == null || eventDish.tenantId !== tenantId) return;
    const overrides = await ctx.db
      .query("eventDishLineOverrides")
      .withIndex("by_eventDishId", (q) => q.eq("eventDishId", eventDishId))
      .collect();
    const live = overrides.some(
      (o) =>
        o.tenantId === tenantId && o.revokedAt == null && o.deletedAt == null,
    );
    if (!live) return;
    await this.apply(ctx, String(eventDish.eventId), null);
  }
}

export const lineOverridePurchasingFollowThrough =
  new LineOverridePurchasingFollowThrough();
