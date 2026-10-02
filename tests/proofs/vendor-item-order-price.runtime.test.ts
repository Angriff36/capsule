/**
 * Galley replacement (PL-REPLACEMENT-PROOF, kitchen job "prices"): a weekly
 * order line for a vendor takes that vendor's own pack price per unit from
 * its vendor item; an ingredient with no vendor item (or a removed one) keeps
 * the ingredient's general cost.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  approvedEvent,
  drafts,
  harness,
  lineFor,
  rolesFor,
  runner,
  seedCatalog,
  versionOf,
} from "./weekly-purchasing.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-vendor-item-order-price";

describe("runtime proof: order lines priced from vendor items", () => {
  it("uses the vendor's pack price per unit, else the ingredient cost", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const buyer = runner(proof, roles.procurement);

    const catalog = await seedCatalog(proof, TENANT, [
      { name: "Flour", perServing: 0.1 },
      { name: "Sugar", perServing: 0.05 },
      { name: "Salt", perServing: 0.01 },
    ]);
    const [flour, sugar, salt] = catalog.ingredientIds;

    // Flour: a 25 kg sack at 45.00 -> 1.80 per kilogram.
    await buyer(api.mutations.VendorItem_createViaAdd, {
      vendorId: catalog.vendorId,
      ingredientId: flour,
      description: "All-purpose flour 25 kg",
      packQuantity: 25,
      packUnit: "kilogram",
      packPrice: 45,
    });
    // Salt: an item that was removed does not price the line.
    const salted = await buyer(api.mutations.VendorItem_createViaAdd, {
      vendorId: catalog.vendorId,
      ingredientId: salt,
      description: "Kosher salt 1 kg",
      packQuantity: 1,
      packUnit: "kilogram",
      packPrice: 9,
    });
    await buyer(api.mutations.VendorItem_remove, {
      docId: salted.docId,
      version: await versionOf(roles.procurement, salted.docId),
    });

    await approvedEvent(proof, TENANT, {
      title: "Bakery lunch",
      headcount: 40,
      dishIds: catalog.dishIds,
    });

    const order = (await drafts(roles.procurement, TENANT)).find(
      (row) => row.vendorId === catalog.vendorId,
    );
    expect(order).toBeDefined();
    const flourLine = await lineFor(
      roles.procurement,
      TENANT,
      order!._id,
      flour!,
    );
    const sugarLine = await lineFor(
      roles.procurement,
      TENANT,
      order!._id,
      sugar!,
    );
    const saltLine = await lineFor(
      roles.procurement,
      TENANT,
      order!._id,
      salt!,
    );
    expect(Number(flourLine?.unitCost)).toBeCloseTo(1.8, 4);
    // No vendor item: the ingredient's general cost (2 per kilogram).
    expect(Number(sugarLine?.unitCost)).toBe(2);
    expect(Number(saltLine?.unitCost)).toBe(2);
  });
});
