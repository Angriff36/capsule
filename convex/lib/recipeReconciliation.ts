/**
 * §8.2 recipe reconciliation for recipe-line changes (AC-390 recipe slice):
 * after Manifest's ComponentIngredientQuantityAdjusted fan-outs have
 * re-recorded the EventIngredientContributions and re-synced the live
 * IngredientDemands, this records one eventReconciliation receipt per
 * affected live Event — and a replay of the same recipe quantity writes no
 * diff and no second receipt. It never writes demand or contribution rows.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type RecipeReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type RecipeInput = {
  componentId: Id<"components">;
  componentIngredientId: string;
  ingredientId: string;
  quantity: number;
  unit: string;
};

type SeedRow = Doc<"eventDishComponentSeeds">;
type DemandRow = Doc<"ingredientDemands">;

/** Same terminal list as prepRecipeEvents.ts: completed work stays historical. */
const TERMINAL_STAGES = ["completed", "closed_out", "cancelled"];

/** Identity + exactly-once receipting for the recipe side of a component
 * ingredient quantity change. Owns the receipt; the contribution re-record
 * and demand sync stay in the declared EventDishComponentSeed.refresh /
 * EventIngredientContribution.record / IngredientDemand.syncFromContributions
 * reactions. */
export class EventRecipeReconciliation {
  /** Runs in the originating command's transaction, AFTER the declared
   * recipe fan-outs. A recipe edit can touch many events, so there is no
   * single eventId argument — one receipt per affected live Event. */
  async run(
    ctx: MutationCtx,
    trigger: RecipeReconcileTrigger,
    input: RecipeInput,
  ): Promise<void> {
    const seeds = (await ctx.db
      .query("eventDishComponentSeeds")
      .withIndex("by_recipeSyncComponentId", (q) =>
        q.eq("recipeSyncComponentId", input.componentId),
      )
      .collect()) as SeedRow[];
    const eventIds = new Set<string>();
    for (const seed of seeds) {
      if (seed.deletedAt == null) eventIds.add(String(seed.eventId));
    }
    for (const eventId of eventIds) {
      await this.persistForEvent(ctx, eventId as Id<"events">, trigger, input);
    }
  }

  private async persistForEvent(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: RecipeReconcileTrigger,
    input: RecipeInput,
  ): Promise<void> {
    const event = await ctx.db.get(eventId);
    if (!event || event.deletedAt != null) return;
    if (TERMINAL_STAGES.includes(event.stage)) return;
    const windows: TimingWindow[] = [
      { key: "headcount", startsAt: event.expectedHeadcount ?? null, endsAt: null },
      { key: `stage:${event.stage}`, startsAt: null, endsAt: null },
      // The recipe key makes 1→2 a new input shape and a replay of 2 the
      // same input shape.
      {
        key: `recipe:${input.componentIngredientId}:${input.quantity}:${input.unit}`,
        startsAt: null,
        endsAt: null,
      },
    ];
    const checkpoint = eventReconciliationReceipt.windowsCheckpoint(windows);
    const operationKey = eventReconciliationReceipt.operationKey(
      String(eventId),
      "recipe",
      checkpoint,
    );
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;
    const demands = (await ctx.db
      .query("ingredientDemands")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as DemandRow[];
    const liveDemands = demands.filter((row) => row.deletedAt == null);
    // The edited line's demand already carries the new quantity from the
    // declared fan-out; every other live demand is preserved as-is.
    const updatedCount = liveDemands.filter(
      (row) => row.ingredientId === input.ingredientId,
    ).length;
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["recipe"],
      createdCount: 0,
      updatedCount,
      retiredCount: 0,
      preservedCount: liveDemands.length - updatedCount,
      exceptionCount: 0,
      unresolved: [],
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventRecipeReconciliation = new EventRecipeReconciliation();
