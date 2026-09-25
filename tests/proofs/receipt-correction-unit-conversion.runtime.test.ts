/**
 * A receipt correction counted in a smaller measure than the shelf must
 * move the shelf by the converted amount, and a correction that would
 * empty the shelf past zero must still be refused.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-correction-unit";
const GRAMS_PER_POUND = 453.59237;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function harness() {
  const proof = createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
  const kitchen = proof.asRole({
    subject: "correction-unit-kitchen",
    role: "kitchen_manager",
    tenantId: TENANT,
  });
  const inventory = proof.asRole({
    subject: "correction-unit-inventory",
    role: "inventory_staff",
    tenantId: TENANT,
  });
  return { proof, kitchen, inventory };
}

describe("receipt correction unit conversion", () => {
  it("subtracts grams from a pound shelf and refuses a count that would go below zero", async () => {
    const { proof, kitchen, inventory } = harness();
    const ingredient = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Correction-unit butter",
        unit: "pound",
        costPerUnit: 4.25,
        allergens: [],
        category: "dairy",
      },
    )) as { docId: string };
    const location = (await proof.executeCommand(
      inventory,
      api.mutations.StorageLocation_createViaRegister,
      { name: "Correction-unit walk-in", locationType: "cold" },
    )) as { docId: string };
    const opened = (await proof.executeCommand(
      inventory,
      api.mutations.InventoryItem_createViaOpen,
      {
        ingredientId: ingredient.docId,
        locationId: location.docId,
        unit: "pound",
        quantityOnHand: 2,
        parLevel: 1,
        reorderThreshold: 1,
        unitCost: 4.25,
      },
    )) as { docId: string };

    await proof.executeCommand(
      inventory,
      api.mutations.InventoryItem_applyReceiptCorrection,
      {
        docId: opened.docId,
        ingredientId: ingredient.docId,
        locationId: location.docId,
        delta: -100,
        unit: "gram",
        reason: "The case was short one hundred grams",
      },
    );

    const afterShort = await inventory.run(async (ctx) =>
      ctx.db.get(opened.docId as never),
    );
    const expected = 2 - 100 / GRAMS_PER_POUND;
    expect(afterShort?.quantityOnHand).toBeCloseTo(expected, 6);

    await expect(
      proof.executeCommand(
        inventory,
        api.mutations.InventoryItem_applyReceiptCorrection,
        {
          docId: opened.docId,
          ingredientId: ingredient.docId,
          locationId: location.docId,
          delta: -2,
          unit: "kilogram",
          reason: "This would take more than is on the shelf",
        },
      ),
    ).rejects.toThrow(/can't be negative/);

    const afterRefusal = await inventory.run(async (ctx) =>
      ctx.db.get(opened.docId as never),
    );
    expect(afterRefusal?.quantityOnHand).toBeCloseTo(expected, 6);
  });
});
