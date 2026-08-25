/**
 * Runtime proof for issue #150: a stock line's unit is locked to the
 * ingredient's catalog unit. Units are opaque labels (no conversion exists),
 * so a stock line opened in a different unit silently breaks on-hand vs
 * demand arithmetic and low-stock alerts. Executes the public generated
 * mutation (not internals); reverting the openStockUnitMatchesCatalog
 * constraint in src/inventory/stock.manifest must fail this test.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-stock-unit-lock";

function harness() {
  const proof = createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
  const kitchen = proof.asRole({
    subject: "stock-unit-lock-kitchen",
    role: "kitchen_manager",
    tenantId: TENANT,
  });
  const inventory = proof.asRole({
    subject: "stock-unit-lock-inventory",
    role: "inventory_staff",
    tenantId: TENANT,
  });
  return { proof, kitchen, inventory };
}

async function seedKilogramCatalog(
  proof: ReturnType<typeof harness>["proof"],
  kitchen: ReturnType<typeof harness>["kitchen"],
  inventory: ReturnType<typeof harness>["inventory"],
) {
  const ingredient = (await proof.executeCommand(
    kitchen,
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: "Unit-lock heirloom tomato",
      unit: "kilogram",
      costPerUnit: 4.5,
      allergens: [],
      category: "produce",
    },
  )) as { docId: string };
  const location = (await proof.executeCommand(
    inventory,
    api.mutations.StorageLocation_createViaRegister,
    { name: "Unit-lock walk-in", locationType: "cold" },
  )) as { docId: string };
  return { ingredientId: ingredient.docId, locationId: location.docId };
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: stock line unit locked to ingredient catalog unit (#150)", () => {
  it("refuses to open a stock line in `each` for a kilogram ingredient and persists nothing", async () => {
    const { proof, kitchen, inventory } = harness();
    const { ingredientId, locationId } = await seedKilogramCatalog(
      proof,
      kitchen,
      inventory,
    );

    await expect(
      proof.executeCommand(
        inventory,
        api.mutations.InventoryItem_createViaOpen,
        {
          ingredientId,
          locationId,
          unit: "each",
          quantityOnHand: 12,
          parLevel: 5,
          reorderThreshold: 2,
          unitCost: 4.5,
        },
      ),
    ).rejects.toThrow(/catalog unit/i);

    const items = await inventory.run(async (ctx) =>
      ctx.db.query("inventoryItems").collect(),
    );
    expect(items).toEqual([]);
  });

  it("opens the stock line in the ingredient's catalog unit (kilogram)", async () => {
    const { proof, kitchen, inventory } = harness();
    const { ingredientId, locationId } = await seedKilogramCatalog(
      proof,
      kitchen,
      inventory,
    );

    const opened = (await proof.executeCommand(
      inventory,
      api.mutations.InventoryItem_createViaOpen,
      {
        ingredientId,
        locationId,
        unit: "kilogram",
        quantityOnHand: 12,
        parLevel: 5,
        reorderThreshold: 2,
        unitCost: 4.5,
      },
    )) as { docId: string };

    const doc = await inventory.run(async (ctx) =>
      ctx.db.get(opened.docId as never),
    );
    expect(doc).toMatchObject({
      unit: "kilogram",
      ingredientId,
      locationId,
      quantityOnHand: 12,
      tenantId: TENANT,
    });
    expect(doc?.unit).not.toBe("each");
  });
});
