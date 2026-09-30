// @vitest-environment edge-runtime
/**
 * AC-131 (PR10-01): an event's needs keep food, our reusable equipment,
 * rentals and service supplies (and client items) apart. Every line names
 * where it comes from, how much, whether it is there, and who is
 * responsible; equipment is never used up like an ingredient.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../../convex/_generated/api";
import schema from "../../../convex/schema";
import { modules } from "../../proofs/convex-test-modules";
import { buildEventRequirements } from "../../../src/features/logistics/eventRequirements";

const M = api.mutations;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("event requirement line kinds (AC-131)", () => {
  it("food, equipment, rental and supply lines keep separate entities and a stock issue never touches equipment quantity", async () => {
    const lines = buildEventRequirements({
      demands: [
        {
          id: "d1",
          ingredientName: "Short rib",
          requiredQuantity: 18,
          unit: "kilogram",
          status: "confirmed",
          vendorName: "Prime Meats",
        },
        {
          id: "d-old",
          ingredientName: "Old line",
          requiredQuantity: 1,
          unit: "each",
          status: "superseded",
        },
      ],
      holds: [
        {
          id: "h1",
          equipmentName: "Roll-top chafer",
          ownership: "owned",
          quantity: 6,
          status: "checked_out",
          homeLocation: "Shelf B4",
        },
        {
          id: "h2",
          equipmentName: "Gold chiavari chair",
          ownership: "rented",
          quantity: 150,
          status: "reserved",
          vendorName: "Party Rentals Co",
        },
      ],
      rentals: [
        {
          id: "r1",
          description: "20x40 tent",
          vendorName: "Tent Masters",
          quantity: 1,
          countUnit: "each",
          status: "delivered",
          deliveredQuantity: 1,
        },
      ],
      packLines: [
        {
          id: "p1",
          description: "Cocktail napkins",
          requiredQuantity: 300,
          packedQuantity: 300,
          unit: "each",
          category: "disposable",
          ownership: "owned",
          fromHold: false,
          excluded: false,
        },
        {
          id: "p2",
          description: "Half hotel pan",
          requiredQuantity: 8,
          packedQuantity: 3,
          unit: "each",
          category: null,
          ownership: null,
          fromHold: false,
          excluded: false,
        },
        {
          id: "p3",
          description: "Cake stand (client's own)",
          requiredQuantity: 1,
          packedQuantity: 0,
          unit: "each",
          category: "other",
          ownership: "client",
          fromHold: false,
          excluded: false,
        },
        {
          id: "p4",
          description: "Roll-top chafer",
          requiredQuantity: 6,
          packedQuantity: 6,
          unit: "each",
          category: "holding",
          ownership: "owned",
          fromHold: true,
          excluded: false,
        },
      ],
    });

    expect(
      lines.map(
        ({
          kind,
          name,
          source,
          quantity,
          unit,
          availability,
          responsible,
        }) => ({
          kind,
          name,
          source,
          quantity,
          unit,
          availability,
          responsible,
        }),
      ),
    ).toEqual([
      {
        kind: "food",
        name: "Short rib",
        source: "Menu recipes",
        quantity: 18,
        unit: "kilogram",
        availability: "On order",
        responsible: "Prime Meats",
      },
      {
        kind: "equipment",
        name: "Half hotel pan",
        source: "Pack list",
        quantity: 8,
        unit: "each",
        availability: "3 of 8 packed",
        responsible: "Warehouse",
      },
      {
        kind: "equipment",
        name: "Roll-top chafer",
        source: "Held from the equipment list",
        quantity: 6,
        unit: "each",
        availability: "Out with the event",
        responsible: "Shelf B4",
      },
      {
        kind: "rental",
        name: "20x40 tent",
        source: "Rented from a vendor",
        quantity: 1,
        unit: "each",
        availability: "Arrived",
        responsible: "Tent Masters",
      },
      {
        kind: "rental",
        name: "Gold chiavari chair",
        source: "Held from the equipment list",
        quantity: 150,
        unit: "each",
        availability: "Held",
        responsible: "Party Rentals Co",
      },
      {
        kind: "supply",
        name: "Cocktail napkins",
        source: "Pack list",
        quantity: 300,
        unit: "each",
        availability: "Packed",
        responsible: "Warehouse",
      },
      {
        kind: "client",
        name: "Cake stand (client's own)",
        source: "Pack list",
        quantity: 1,
        unit: "each",
        availability: "Not packed",
        responsible: "Client brings it",
      },
    ]);

    // A stock issue moves food stock only; the equipment count stays put.
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const tenantId = "tenant-ac131-kinds";
    const kitchen = proof.asRole({
      subject: "kitchen-ac131",
      role: "kitchen_manager",
      tenantId,
    });
    const inventory = proof.asRole({
      subject: "inventory-ac131",
      role: "inventory_manager",
      tenantId,
    });
    const run = (actor: typeof kitchen, cmd: unknown, args: object) =>
      proof.executeCommand(actor, cmd as never, args as never) as Promise<{
        docId: string;
      }>;
    const chafer = await run(inventory, M.Equipment_createViaRegister, {
      name: "Roll-top chafer",
      assetTag: "CF-POOL",
      category: "Holding",
      ownership: "owned",
      quantity: 12,
    });
    const ingredient = await run(kitchen, M.Ingredient_createViaIntroduce, {
      name: "Short rib",
      unit: "kilogram",
      costPerUnit: 9,
      allergens: [],
      category: "protein",
    });
    const location = await run(inventory, M.StorageLocation_createViaRegister, {
      name: "Walk-in",
      locationType: "cold",
    });
    const stock = await run(inventory, M.InventoryItem_createViaOpen, {
      ingredientId: ingredient.docId,
      locationId: location.docId,
      unit: "kilogram",
      quantityOnHand: 40,
    });
    await run(inventory, M.InventoryItem_adjustQuantity, {
      docId: stock.docId,
      delta: -18,
      reason: "Issued to the event",
    });
    const read = (id: string) =>
      inventory.run(async (ctx) => ctx.db.get(id as never)) as Promise<any>;
    expect((await read(stock.docId)).quantityOnHand).toBe(22);
    expect((await read(chafer.docId)).quantity).toBe(12);
  });
});
