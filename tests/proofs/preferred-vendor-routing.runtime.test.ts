/**
 * Galley replacement (BE-20.6, kitchen job "choose the vendor"): an
 * ingredient with a preferred vendor goes on that vendor's weekly draft
 * order when an event is approved; an ingredient without one goes to the
 * company's default vendor. Nobody re-sorts the order lines by hand.
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

const TENANT = "tenant-preferred-vendor-routing";

describe("runtime proof: preferred vendor routing", () => {
  it("puts each ingredient on its preferred vendor's draft, the rest on the default vendor", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const kitchen = runner(proof, roles.kitchen);
    const buyer = runner(proof, roles.procurement);

    const catalog = await seedCatalog(proof, TENANT, [
      { name: "Flour", perServing: 0.1 },
      { name: "Saffron", perServing: 0.001 },
    ]);
    const [flour, saffron] = catalog.ingredientIds;
    const specialty = await buyer(api.mutations.Vendor_createViaOnboard, {
      name: "Spice specialist",
      paymentTermsDays: 30,
    });
    await kitchen(api.mutations.Ingredient_setPreferredVendor, {
      docId: saffron,
      version: await versionOf(roles.kitchen, saffron!),
      preferredVendorId: specialty.docId,
    });

    await approvedEvent(proof, TENANT, {
      title: "Saffron dinner",
      headcount: 40,
      dishIds: catalog.dishIds,
    });

    const open = await drafts(roles.procurement, TENANT);
    const byVendor = new Map(open.map((order) => [order.vendorId, order]));
    const defaultOrder = byVendor.get(catalog.vendorId);
    const specialtyOrder = byVendor.get(specialty.docId);
    expect(defaultOrder).toBeDefined();
    expect(specialtyOrder).toBeDefined();

    expect(
      await lineFor(roles.procurement, TENANT, defaultOrder!._id, flour!),
    ).toBeDefined();
    expect(
      await lineFor(roles.procurement, TENANT, defaultOrder!._id, saffron!),
    ).toBeUndefined();
    expect(
      await lineFor(roles.procurement, TENANT, specialtyOrder!._id, saffron!),
    ).toBeDefined();
    expect(
      await lineFor(roles.procurement, TENANT, specialtyOrder!._id, flour!),
    ).toBeUndefined();
  });
});
