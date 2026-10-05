/**
 * Galley replacement (PL-REPLACEMENT-PROOF, "vendors and price history have
 * no way in"): a vendor price list file brings vendors and their items in.
 *
 *   - a new vendor is added; each row becomes that vendor's item for one
 *     ingredient, matched by the Ingredient column or the item name
 *   - reading the same file again changes nothing
 *   - a new price updates the item and keeps the old price in its history
 *   - an unknown ingredient, a bad unit or a word in the price is sent back
 *     with its row number; nothing is guessed
 *   - a cook may not bring in a price list
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  rolesFor,
  runner,
} from "./buyer-qty-override-survival.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-vendor-price-list";

const sheet = (price: string) => [
  {
    Vendor: "Hillside Dairy",
    "Item number": "HD-12",
    "Item name": "Heavy cream 36% case",
    Ingredient: "heavy cream",
    "Pack amount": "12",
    "Pack unit": "qt",
    "Pack price": price,
  },
  {
    Vendor: "Hillside Dairy",
    "Item number": "",
    "Item name": "Butter",
    Ingredient: "",
    "Pack amount": "36",
    "Pack unit": "lb",
    "Pack price": "$118.80",
  },
  {
    Vendor: "Hillside Dairy",
    "Item number": "HD-77",
    "Item name": "Goat cheese log",
    Ingredient: "Chevre",
    "Pack amount": "6",
    "Pack unit": "lb",
    "Pack price": "40",
  },
  {
    Vendor: "Hillside Dairy",
    "Item number": "HD-80",
    "Item name": "Sour cream",
    Ingredient: "Butter",
    "Pack amount": "4",
    "Pack unit": "buckets",
    "Pack price": "20",
  },
  {
    Vendor: "Hillside Dairy",
    "Item number": "HD-81",
    "Item name": "Cream cheese",
    Ingredient: "Butter",
    "Pack amount": "3",
    "Pack unit": "lb",
    "Pack price": "call",
  },
];

describe("runtime proof: vendor price list file", () => {
  it("adds vendors and items, repeats as no change, reprices with history", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const buyer = runner(proof, roles.procurement);
    const kitchen = runner(proof, roles.kitchen);

    const cream = await kitchen(api.mutations.Ingredient_createViaIntroduce, {
      name: "Heavy Cream",
      unit: "quart",
      costPerUnit: 4,
      allergens: [],
      category: "dairy",
    });
    const butter = await kitchen(api.mutations.Ingredient_createViaIntroduce, {
      name: "Butter",
      unit: "pound",
      costPerUnit: 3,
      allergens: [],
      category: "dairy",
    });

    const first = (await roles.procurement.mutation(
      api.vendorPriceList.importVendorPriceRows,
      { rows: sheet("54.00") },
    )) as { problems: unknown[] };
    expect(first).toMatchObject({
      vendorsAdded: 1,
      added: 2,
      updated: 0,
      unchanged: 0,
    });
    expect(first.problems).toEqual([
      { row: 4, reason: expect.stringMatching(/No ingredient named "Chevre"/) },
      { row: 5, reason: '"buckets" is not a unit we know.' },
      { row: 6, reason: '"call" is not a price.' },
    ]);

    const vendors = (await roles.procurement.query(
      api.queries.listVendor,
      {},
    )) as any[];
    expect(vendors.map((row) => row.name)).toEqual(["Hillside Dairy"]);
    const items = (await roles.procurement.query(
      api.queries.listVendorItem,
      {},
    )) as any[];
    const creamItem = items.find((row) => row.ingredientId === cream.docId);
    expect(creamItem).toMatchObject({
      vendorId: vendors[0]._id,
      itemCode: "HD-12",
      packQuantity: 12,
      packUnit: "quart",
      packPrice: 54,
    });
    expect(
      items.find((row) => row.ingredientId === butter.docId),
    ).toMatchObject({
      description: "Butter",
      packUnit: "pound",
      packPrice: 118.8,
    });

    const again = await roles.procurement.mutation(
      api.vendorPriceList.importVendorPriceRows,
      { rows: sheet("54.00") },
    );
    expect(again).toMatchObject({
      vendorsAdded: 0,
      added: 0,
      updated: 0,
      unchanged: 2,
    });

    const repriced = await roles.procurement.mutation(
      api.vendorPriceList.importVendorPriceRows,
      { rows: sheet("58.50") },
    );
    expect(repriced).toMatchObject({ added: 0, updated: 1, unchanged: 1 });
    const after = (
      (await roles.procurement.query(api.queries.listVendorItem, {})) as any[]
    ).filter((row) => row.deletedAt == null);
    expect(after).toHaveLength(2);
    expect(after.find((row) => row._id === creamItem._id)?.packPrice).toBe(
      58.5,
    );
    const history = (await roles.procurement.run((ctx: any) =>
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q: any) => q.eq("entityId", creamItem._id))
        .collect(),
    )) as any[];
    expect(
      history.find((row) => row.payload?.packPrice === 58.5)?.payload,
    ).toMatchObject({ previousPackPrice: 54, packPrice: 58.5 });

    // The price history read: the import price, then the change.
    const creamHistory = (await roles.procurement.query(
      api.vendorPriceList.priceHistory,
      { ingredientId: cream.docId },
    )) as any[];
    expect(creamHistory.map((p) => p.packPrice)).toEqual([58.5, 54]);

    const cookRole = proof.asRole({
      subject: `cook-${TENANT}`,
      role: "kitchen_staff",
      tenantId: TENANT,
    });
    await expect(
      cookRole.mutation(api.vendorPriceList.importVendorPriceRows, {
        rows: sheet("1").map((row) => ({ ...row, Vendor: "Other dairy" })),
      }),
    ).rejects.toThrow();
  });

  it("brings in dated old prices as history; the newest stays the price", async () => {
    const proof = harness();
    const tenant = `${TENANT}-dated`;
    const roles = rolesFor(proof, tenant);
    const kitchen = runner(proof, roles.kitchen);
    const cream = await kitchen(api.mutations.Ingredient_createViaIntroduce, {
      name: "Heavy Cream",
      unit: "quart",
      costPerUnit: 4,
      allergens: [],
      category: "dairy",
    });
    const row = (price: string, date: string) => ({
      Vendor: "Hillside Dairy",
      "Item number": "HD-12",
      "Item name": "Heavy cream 36% case",
      Ingredient: "Heavy Cream",
      "Pack amount": "12",
      "Pack unit": "qt",
      "Pack price": price,
      "Price date": date,
    });
    const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
    // Out of order in the file on purpose; one bad date, one future date.
    const history = [
      row("52.00", "6/1/2025"),
      row("48.00", "2025-01-15"),
      row("50.00", "3/10/25"),
      row("49.00", "soon"),
      row("60.00", "2099-01-01"),
    ];
    const first = (await roles.procurement.mutation(
      api.vendorPriceList.importVendorPriceRows,
      { rows: history },
    )) as any;
    expect(first).toMatchObject({ added: 1, updated: 2, pastPrices: 0 });
    expect(first.problems).toEqual([
      { row: 5, reason: expect.stringMatching(/"soon" is not a date/) },
      { row: 6, reason: "The price date is after today." },
    ]);
    const item = (
      (await roles.procurement.query(api.queries.listVendorItem, {})) as any[]
    ).find((r) => r.ingredientId === cream.docId);
    expect(item).toMatchObject({ packPrice: 52, priceSetAt: at(2025, 6, 1) });

    const read = async () =>
      (
        (await roles.procurement.query(api.vendorPriceList.priceHistory, {
          ingredientId: cream.docId,
        })) as any[]
      ).map((p) => [p.packPrice, p.pricedAt]);
    expect(await read()).toEqual([
      [52, at(2025, 6, 1)],
      [50, at(2025, 3, 10)],
      [48, at(2025, 1, 15)],
    ]);

    // An older file read later: its prices go into the history only.
    const older = (await roles.procurement.mutation(
      api.vendorPriceList.importVendorPriceRows,
      { rows: [row("45.00", "2024-11-02")] },
    )) as any;
    expect(older).toMatchObject({ updated: 0, pastPrices: 1 });
    const after = (
      (await roles.procurement.query(api.queries.listVendorItem, {})) as any[]
    ).find((r) => r._id === item._id);
    expect(after).toMatchObject({ packPrice: 52, priceSetAt: at(2025, 6, 1) });
    expect((await read()).at(-1)).toEqual([45, at(2024, 11, 2)]);

    // Both files again change nothing.
    const again = (await roles.procurement.mutation(
      api.vendorPriceList.importVendorPriceRows,
      { rows: [...history.slice(0, 3), row("45.00", "2024-11-02")] },
    )) as any;
    expect(again).toMatchObject({
      added: 0,
      updated: 0,
      pastPrices: 0,
      unchanged: 4,
    });
    expect(await read()).toHaveLength(4);

    // Another company sees none of it; a cook in this company may read it.
    const other = rolesFor(proof, `${tenant}-other`);
    expect(
      await other.procurement.query(api.vendorPriceList.priceHistory, {
        ingredientId: cream.docId,
      }),
    ).toEqual([]);
    expect(
      await roles.kitchen.query(api.vendorPriceList.priceHistory, {
        ingredientId: cream.docId,
      }),
    ).toHaveLength(4);
  });
});
