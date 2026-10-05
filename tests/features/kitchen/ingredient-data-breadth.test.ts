// @vitest-environment edge-runtime
/**
 * AC-452 (PL-CULINARY-CATALOG, BE-9.6-data-breadth): one ingredient carries
 * its pack size, where its price came from, allergens, nutrition, and shelf
 * life and storage — and a shelf life nobody recorded stays "not on file",
 * never zero days.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../../convex/_generated/api";
import schema from "../../../convex/schema";
import { modules } from "../../proofs/convex-test-modules";
import { resolveIngredientPrice } from "../../../src/features/kitchen/IngredientPriceHistory";
import { ingredientShelfLifeLabel } from "../../../src/features/kitchen/IngredientStorageEditor";

const TENANT = "tenant-ingredient-breadth";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Row = Record<string, unknown> & { _id: string; version: number };

describe("AC-452 ingredient data breadth", () => {
  it("an ingredient carries pack size, price provenance, allergens, nutrition, and an explicit unknown for shelf life", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-breadth",
      role: "kitchen_manager",
      tenantId: TENANT,
    });
    const read = async (id: string) =>
      (await kitchen.run(async (ctx) => ctx.db.get(id as never))) as Row;

    const { docId } = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Heavy cream",
        unit: "quart",
        costPerUnit: 4.5,
        allergens: ["milk"],
      },
    )) as { docId: string };

    // Nothing recorded yet: shelf life and storage are unknown, not zero.
    let row = await read(docId);
    expect(row.shelfLifeDays ?? null).toBeNull();
    expect(row.storageInstructions ?? null).toBeNull();
    expect(ingredientShelfLifeLabel(row.shelfLifeDays as number | null)).toBe(
      "Shelf life not on file",
    );

    // Pack size: one case is 12 quarts, with where that came from.
    await proof.executeCommand(
      kitchen,
      api.mutations.ItemUnitMapping_createViaRecord,
      {
        kind: "pack",
        unit: "case",
        equalsQuantity: 12,
        equalsUnit: "quart",
        ingredientId: docId,
        source: "Sysco case label",
      },
    );
    const mappings = (await kitchen.query(
      api.queries.listItemUnitMapping,
      {},
    )) as Row[];
    expect(
      mappings.find((mapping) => mapping.ingredientId === docId),
    ).toMatchObject({
      kind: "pack",
      unit: "case",
      equalsQuantity: 12,
      equalsUnit: "quart",
      source: "Sysco case label",
    });

    row = await read(docId);
    await proof.executeCommand(kitchen, api.mutations.Ingredient_setNutrition, {
      docId,
      version: row.version,
      caloriesPerUnit: 3200,
      fatGramsPerUnit: 344,
    });
    row = await read(docId);
    await proof.executeCommand(kitchen, api.mutations.Ingredient_setStorage, {
      docId,
      version: row.version,
      shelfLifeDays: 10,
      storageInstructions: "Walk-in, 34-38°F, keep sealed",
    });

    row = await read(docId);
    expect(row.allergens).toEqual(["milk"]);
    expect(row.caloriesPerUnit).toBe(3200);
    expect(row.proteinGramsPerUnit ?? null).toBeNull();
    expect(row.shelfLifeDays).toBe(10);
    expect(row.storageInstructions).toBe("Walk-in, 34-38°F, keep sealed");
    expect(ingredientShelfLifeLabel(10)).toBe("Keeps 10 days");
    expect(ingredientShelfLifeLabel(0)).toBe("Keeps 0 days");

    // Price provenance: with no receipt the price says it is the catalog
    // price; a received price says it came from a receipt.
    const catalog = resolveIngredientPrice({
      id: docId,
      unit: String(row.unit),
      costPerUnit: Number(row.costPerUnit),
    });
    expect(catalog).toEqual({
      unit: "quart",
      costPerUnit: 4.5,
      source: "catalog",
    });
    expect(
      resolveIngredientPrice(
        { id: docId, unit: "quart", costPerUnit: 4.5 },
        {
          _id: "obs-1",
          ingredientId: docId,
          vendorId: "v1",
          vendorOrderId: "o1",
          vendorOrderLineId: "l1",
          receiptQuantity: 12,
          cumulativeReceivedQuantity: 12,
          unit: "quart",
          unitPrice: 4.1,
        },
      ).source,
    ).toBe("receipt");

    // A blank save clears back to not on file; negative days are refused.
    await proof.executeCommand(kitchen, api.mutations.Ingredient_setStorage, {
      docId,
      version: row.version,
    });
    row = await read(docId);
    expect(row.shelfLifeDays ?? null).toBeNull();
    expect(row.storageInstructions ?? null).toBeNull();
    await expect(
      proof.executeCommand(kitchen, api.mutations.Ingredient_setStorage, {
        docId,
        version: row.version,
        shelfLifeDays: -1,
      }),
    ).rejects.toThrow(/Shelf life can't be negative/);
  });
});
