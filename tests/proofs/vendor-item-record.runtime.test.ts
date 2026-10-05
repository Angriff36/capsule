/**
 * Galley replacement (PL-REPLACEMENT-PROOF, kitchen job "pack sizes and
 * vendor items"): an ingredient keeps one item per vendor - the vendor's item
 * number, the pack and the pack price - and a price change keeps the price
 * before and after in the item's history.
 *
 *   - purchasing adds a vendor item; a cook can read it but not change it
 *   - a price change moves the price date and records old and new price
 *   - a negative price or an empty pack is refused in plain words
 *   - removing the item takes it off the list
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

const TENANT = "tenant-vendor-item-record";

describe("runtime proof: vendor items on an ingredient", () => {
  it("adds, reprices with history, refuses bad input, and removes", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const buyer = runner(proof, roles.procurement);
    const kitchen = runner(proof, roles.kitchen);

    const vendor = await buyer(api.mutations.Vendor_createViaOnboard, {
      name: "Dairy vendor",
      paymentTermsDays: 14,
    });
    const cream = await kitchen(api.mutations.Ingredient_createViaIntroduce, {
      name: "Heavy cream",
      unit: "quart",
      costPerUnit: 4,
      allergens: [],
      category: "dairy",
    });

    const item = await buyer(api.mutations.VendorItem_createViaAdd, {
      vendorId: vendor.docId,
      ingredientId: cream.docId,
      description: "Heavy cream 36%, case",
      itemCode: "DC-1180",
      packQuantity: 12,
      packUnit: "quart",
      packPrice: 54,
    });

    const cookRole = proof.asRole({
      subject: `cook-${TENANT}`,
      role: "kitchen_staff",
      tenantId: TENANT,
    });
    const cook = runner(proof, cookRole);
    const listed = (await cookRole.query(
      api.queries.listVendorItem,
      {},
    )) as any[];
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      vendorId: vendor.docId,
      ingredientId: cream.docId,
      itemCode: "DC-1180",
      packQuantity: 12,
      packUnit: "quart",
      packPrice: 54,
    });
    const firstPriceAt = listed[0].priceSetAt as number;
    expect(firstPriceAt).toBeGreaterThan(0);

    // A cook reads but does not change vendor items.
    await expect(
      cook(api.mutations.VendorItem_remove, {
        docId: item.docId,
        version: listed[0].version,
      }),
    ).rejects.toThrow();

    await buyer(api.mutations.VendorItem_update, {
      docId: item.docId,
      version: listed[0].version,
      description: "Heavy cream 36%, case",
      itemCode: "DC-1180",
      packQuantity: 12,
      packUnit: "quart",
      packPrice: 58.5,
    });
    const repriced = (
      (await roles.procurement.query(api.queries.listVendorItem, {})) as any[]
    )[0];
    expect(repriced.packPrice).toBe(58.5);
    expect(repriced.priceSetAt).toBeGreaterThanOrEqual(firstPriceAt);

    const history = (await roles.procurement.run((ctx: any) =>
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q: any) => q.eq("entityId", item.docId))
        .collect(),
    )) as any[];
    const update = history.find((row) => row.payload?.packPrice === 58.5);
    expect(update?.payload).toMatchObject({
      previousPackPrice: 54,
      packPrice: 58.5,
    });

    await expect(
      buyer(api.mutations.VendorItem_update, {
        docId: item.docId,
        version: repriced.version,
        description: "Heavy cream 36%, case",
        packQuantity: 12,
        packUnit: "quart",
        packPrice: -1,
      }),
    ).rejects.toThrow(/pack price can't be negative/);
    await expect(
      buyer(api.mutations.VendorItem_createViaAdd, {
        vendorId: vendor.docId,
        ingredientId: cream.docId,
        description: "Empty pack",
        packQuantity: 0,
        packUnit: "quart",
      }),
    ).rejects.toThrow(/pack amount has to be more than zero/);

    await buyer(api.mutations.VendorItem_remove, {
      docId: item.docId,
      version: repriced.version,
    });
    const after = (
      (await roles.procurement.query(api.queries.listVendorItem, {})) as any[]
    ).filter((row) => row.deletedAt == null);
    expect(after).toHaveLength(0);
  });
});
