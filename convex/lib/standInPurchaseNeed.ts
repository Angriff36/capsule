import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * A stand-in the cook just saved (shallots instead of onions) is already on
 * the ingredient count. The buyer's list is a purchase line, and a brand-new
 * ingredient does not get one until that count is confirmed. Confirming the
 * stand-in is part of the swap the kitchen was already allowed to make.
 * Other ingredients on the event stay as they were.
 */
export class StandInPurchaseNeedOpener {
  async open(
    ctx: MutationCtx,
    eventId: Id<"events">,
    overrideIdRaw: unknown,
  ): Promise<void> {
    const ingredientId = await this.standInIngredient(ctx, eventId, overrideIdRaw);
    if (ingredientId == null) return;
    const demands = await ctx.db
      .query("ingredientDemands")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    for (const demand of demands) {
      if (!this.readyToOpen(demand, ingredientId)) continue;
      await ctx.runMutation(api.mutations.IngredientDemand_confirm, {
        docId: demand._id,
        version: demand.version,
      });
    }
  }

  private async standInIngredient(
    ctx: MutationCtx,
    eventId: Id<"events">,
    overrideIdRaw: unknown,
  ): Promise<Id<"ingredients"> | null> {
    if (typeof overrideIdRaw !== "string" || overrideIdRaw.length === 0) {
      return null;
    }
    const overrideId = ctx.db.normalizeId("eventDishLineOverrides", overrideIdRaw);
    if (overrideId == null) return null;
    const override = await ctx.db.get(overrideId);
    if (!this.introducesIngredient(override, eventId)) return null;
    return override.ingredientId ?? null;
  }

  private introducesIngredient(
    override: Doc<"eventDishLineOverrides"> | null,
    eventId: Id<"events">,
  ): override is Doc<"eventDishLineOverrides"> & { ingredientId: Id<"ingredients"> } {
    if (override == null || override.deletedAt != null || override.revokedAt != null) {
      return false;
    }
    if (override.eventId !== eventId) return false;
    if (override.kind !== "add" && override.kind !== "replace") return false;
    return override.ingredientId != null;
  }

  private readyToOpen(
    demand: Doc<"ingredientDemands">,
    ingredientId: Id<"ingredients">,
  ): boolean {
    return (
      demand.ingredientId === ingredientId &&
      demand.deletedAt == null &&
      demand.status === "calculated" &&
      demand.calculatedAt != null &&
      Number(demand.requiredQuantity) > 0
    );
  }
}

export const standInPurchaseNeedOpener = new StandInPurchaseNeedOpener();
