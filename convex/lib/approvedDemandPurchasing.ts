import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

/** Stages where approval already opened the event's buying. */
const BUYING_STAGES = new Set(["approved", "sales_lock", "executing", "final"]);

/**
 * Approval opens a purchase need for every food amount the event has at that
 * moment. A dish added AFTER approval (golden event step 14, AC-666) got its
 * amount worked out but waited for someone to confirm it by hand in the
 * demand ledger, so the weekly order silently missed it. When a new amount
 * is worked out for an event whose buying is already open, it is confirmed
 * here through the governed IngredientDemand.confirm - the same step a buyer
 * takes by hand - which opens the purchase need and routes it to the week's
 * draft order. Runs as the company's system role: the person who added the
 * dish may not hold purchasing access. Amounts that already have a need are
 * left alone (the need follows them through reviseRequired).
 */
export async function openNeedForApprovedEventDemand(
  ctx: MutationCtx,
  event: ConvexCommandEvent,
): Promise<void> {
  if (event.entity !== "IngredientDemand" || event.type !== "IngredientDemandCalculated")
    return;
  const demand = await ctx.db.get(event.entityId as Id<"ingredientDemands">);
  if (
    !demand ||
    demand.deletedAt != null ||
    demand.status !== "calculated" ||
    demand.purchaseEligibleEventId == null ||
    !(Number(demand.requiredQuantity) > 0)
  )
    return;
  const owner = await ctx.db.get(demand.eventId as Id<"events">);
  if (
    !owner ||
    owner.deletedAt != null ||
    owner.tenantId !== demand.tenantId ||
    !BUYING_STAGES.has(String(owner.stage))
  )
    return;
  const needs = await ctx.db
    .query("purchaseNeeds")
    .withIndex("by_ingredientDemandId", (q) =>
      q.eq("ingredientDemandId", demand._id),
    )
    .collect();
  if (needs.some((need) => need.deletedAt == null)) return;
  await TenantSystemCommandRunner.forTenant(ctx, demand.tenantId).context.runMutation(
    api.mutations.IngredientDemand_confirm,
    { docId: demand._id, version: demand.version },
  );
}
