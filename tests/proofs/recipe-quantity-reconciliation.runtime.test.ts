/**
 * Runtime proof (AC-390 recipe slice): one ComponentIngredient.adjustQuantity
 * re-records the EventIngredientContributions via the declared
 * EventDishComponentSeed.refresh fan-out, re-syncs the live IngredientDemands
 * to (quantity * batchMultiplier * servings) / yieldQuantity, and persists
 * exactly one §8.2 eventReconciliation receipt per affected live Event for
 * the recipe domain. Replaying the same recipe quantity writes no
 * demand-quantity diff and no second recipe receipt. Proof only — not the
 * whole §1.5 change matrix.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  demandFor,
  harness,
  listedDemands,
  readIngredientVersion,
  rolesFor,
  runner,
  seedComponentDishPair,
  type DemandRow,
  type Role,
} from "./recipe-quantity-reconciliation.runtime.helpers";
import {
  readReconciliationReceipts,
  type ReceiptOutput,
} from "./single-reconciliation.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type DemandSnapshotRow = {
  _id: string;
  ingredientId: string;
  requiredQuantity: number;
};

function demandSnapshot(rows: DemandRow[]): DemandSnapshotRow[] {
  return rows.map(({ _id, ingredientId, requiredQuantity }) => ({
    _id,
    ingredientId,
    requiredQuantity,
  }));
}

function recipeReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
): ReceiptOutput[] {
  return receipts.filter(
    (row) =>
      row.eventId === eventId &&
      row.triggerType === "ComponentIngredientQuantityAdjusted" &&
      row.affectedDomains.length === 1 &&
      row.affectedDomains[0] === "recipe",
  );
}

function checkpointKeys(receipts: ReceiptOutput[], eventId: string): string[] {
  return receipts
    .filter((row) => row.eventId === eventId)
    .map((row) => row.checkpoint.key)
    .sort((a, b) => a.localeCompare(b));
}

/** Seed two component-dish pairs on one planned event, then adjust the
 * Follow line 1 → 2 ("each"). Formula: (2 * 1 * 40) / 1 = 80. */
async function seedTwoDishesAndAdjust(
  tenantId: string,
  title: string,
): Promise<{
  runKitchen: ReturnType<typeof runner>;
  events: Role;
  eventId: string;
  followIngredientId: string;
  otherIngredientId: string;
  followLineId: string;
}> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const runKitchen = runner(proof, roles.kitchen);
  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  const follow = await seedComponentDishPair(
    proof,
    tenantId,
    eventId,
    "Follow",
  );
  const other = await seedComponentDishPair(proof, tenantId, eventId, "Other");
  await runKitchen(M.ComponentIngredient_adjustQuantity, {
    docId: follow.componentIngredientId,
    quantity: 2,
    unit: "each",
    version: 1,
  });
  return {
    runKitchen,
    events: roles.events,
    eventId,
    followIngredientId: follow.ingredientId,
    otherIngredientId: other.ingredientId,
    followLineId: follow.componentIngredientId,
  };
}

describe("runtime proof: single recipe reconciliation per recipe line edit (AC-390 slice)", () => {
  it("one recipe line edit reconciles following demand once with a recipe receipt", async () => {
    const tenantId = "tenant-ac390-recipe-once";
    const s = await seedTwoDishesAndAdjust(tenantId, "AC-390 recipe once");

    const demands = await listedDemands(s.events, s.eventId);
    expect(demands).toHaveLength(2);
    const follow = await demandFor(s.events, s.eventId, s.followIngredientId);
    expect(follow.requiredQuantity).toBe(80);
    const other = await demandFor(s.events, s.eventId, s.otherIngredientId);
    expect(other.requiredQuantity).toBe(40);

    const receipts = await readReconciliationReceipts(s.events, tenantId);
    const recipe = recipeReceipts(receipts, s.eventId);
    expect(recipe).toHaveLength(1);
    const receipt = recipe[0]!;
    expect(receipt.triggerType).toBe("ComponentIngredientQuantityAdjusted");
    expect(receipt.affectedDomains).toEqual(["recipe"]);
    expect(receipt.eventId).toBe(s.eventId);
    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.createdCount).toBe(0);
    expect(receipt.updatedCount).toBe(1);
    expect(receipt.retiredCount).toBe(0);
    expect(receipt.preservedCount).toBe(1);
    expect(receipt.exceptionCount).toBe(0);
    expect(receipt.unresolved).toEqual([]);
    expect(receipt.checkpoint.state).toBe("complete");
  });

  it("replaying the same recipe quantity against unchanged demand input is a no-op", async () => {
    const tenantId = "tenant-ac390-recipe-replay";
    const s = await seedTwoDishesAndAdjust(tenantId, "AC-390 recipe replay");

    const demandsBefore = await listedDemands(s.events, s.eventId);
    const snapshotBefore = demandSnapshot(demandsBefore);
    expect(snapshotBefore).toHaveLength(2);
    const receiptsBefore = await readReconciliationReceipts(s.events, tenantId);
    const checkpointsBefore = checkpointKeys(receiptsBefore, s.eventId);
    const version = await readIngredientVersion(s.events, s.followLineId);

    // The SAME recipe quantity again — a replay, not a change.
    await s.runKitchen(M.ComponentIngredient_adjustQuantity, {
      docId: s.followLineId,
      quantity: 2,
      unit: "each",
      version,
    });

    const demandsAfter = await listedDemands(s.events, s.eventId);
    expect(demandSnapshot(demandsAfter)).toEqual(snapshotBefore);
    const follow = await demandFor(s.events, s.eventId, s.followIngredientId);
    expect(follow.requiredQuantity).toBe(80);
    const other = await demandFor(s.events, s.eventId, s.otherIngredientId);
    expect(other.requiredQuantity).toBe(40);

    const receiptsAfter = await readReconciliationReceipts(s.events, tenantId);
    expect(checkpointKeys(receiptsAfter, s.eventId)).toEqual(checkpointsBefore);
    expect(recipeReceipts(receiptsAfter, s.eventId)).toHaveLength(1);
  });
});
