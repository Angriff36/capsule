import type { MutationCtx } from "../_generated/server";
import { writeReconciledEventDemand } from "../culinaryDemand";
import { getAuthContext, requireTenant } from "./authContext";
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
  async apply(ctx: MutationCtx, eventIdRaw: unknown): Promise<void> {
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
  }
}

export const lineOverridePurchasingFollowThrough =
  new LineOverridePurchasingFollowThrough();
