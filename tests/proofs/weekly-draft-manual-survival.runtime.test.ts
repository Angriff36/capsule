/**
 * Runtime proof (AC-472, BE-10.3): what the buyer types on the weekly draft -
 * quantity, price, and a line added by hand - survives automatic
 * recalculation, and a hand-set quantity can go back to the calculation.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  approvedEvent,
  drafts,
  harness,
  lineFor,
  linesOf,
  rolesFor,
  runner,
  seedCatalog,
  versionOf,
} from "./weekly-purchasing.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: buyer changes survive the weekly recalculation (AC-472)", () => {
  it("a buyer-revised quantity survives a headcount-driven recalculation and can be reset to the calculation", async () => {
    const proof = harness();
    const tenantId = "tenant-ac472-buyer-survival";
    const roles = rolesFor(proof, tenantId);
    const buyer = runner(proof, roles.procurement);
    const events = runner(proof, roles.events);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Rice", perServing: 0.2 },
      { name: "Oil", perServing: 0.05 },
    ]);
    const [riceId, oilId] = catalog.ingredientIds as [string, string];
    // A third catalog item no event uses: the buyer adds it by hand.
    const napkins = await runner(proof, roles.kitchen)(
      M.Ingredient_createViaIntroduce,
      {
        name: `Hand-added ${tenantId}`,
        unit: "kilogram",
        costPerUnit: 4,
        allergens: [],
        category: "dry",
      },
    );
    const eventId = await approvedEvent(proof, tenantId, {
      title: "AC-472 banquet",
      headcount: 50,
      dishIds: catalog.dishIds,
    });

    const [draft] = await drafts(roles.procurement, tenantId);
    const rice = await lineFor(roles.procurement, tenantId, draft!._id, riceId);
    const oil = await lineFor(roles.procurement, tenantId, draft!._id, oilId);
    expect(Number(rice!.orderedQuantity)).toBeCloseTo(10, 4);
    expect(Number(oil!.orderedQuantity)).toBeCloseTo(2.5, 4);

    // Buyer: rice to a 12 kg case at the vendor's quoted price; oil price only.
    await buyer(M.VendorOrderLine_reviseQuantity, {
      docId: rice!._id,
      version: rice!.version,
      orderedQuantity: 12,
      unitCost: 1.75,
    });
    await buyer(M.VendorOrderLine_reviseQuantity, {
      docId: oil!._id,
      version: oil!.version,
      orderedQuantity: Number(oil!.orderedQuantity),
      unitCost: 6.5,
    });
    await buyer(M.VendorOrderLine_createViaAddLine, {
      vendorOrderId: draft!._id,
      ingredientId: napkins.docId,
      orderedQuantity: 4,
      unit: "kilogram",
      unitCost: 4,
    });

    await events(M.Event_changeHeadcount, {
      docId: eventId,
      version: await versionOf(roles.events, eventId),
      newHeadcount: 80,
    });

    const [same] = await drafts(roles.procurement, tenantId);
    expect(same!._id).toBe(draft!._id);
    const riceAfter = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      riceId,
    );
    expect(Number(riceAfter!.orderedQuantity)).toBe(12);
    expect(Number(riceAfter!.unitCost)).toBe(1.75);
    expect(riceAfter!.quantityIsManual).toBe(true);
    expect(Number(riceAfter!.plannedQuantity)).toBeCloseTo(16, 4);
    // A price change alone leaves the quantity following the event.
    const oilAfter = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      oilId,
    );
    expect(Number(oilAfter!.orderedQuantity)).toBeCloseTo(4, 4);
    expect(Number(oilAfter!.unitCost)).toBe(6.5);
    expect(oilAfter!.quantityIsManual).toBe(false);
    const handLine = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      napkins.docId,
    );
    expect(Number(handLine!.orderedQuantity)).toBe(4);
    expect(handLine!.quantityIsManual).toBe(true);
    expect(await linesOf(roles.procurement, tenantId, draft!._id)).toHaveLength(
      3,
    );

    // "Use the calculation" on the rice line (the order page button).
    await buyer(M.VendorOrderLine_reconcileDraftRequirement, {
      docId: riceAfter!._id,
      version: riceAfter!.version,
      plannedQuantity: Number(riceAfter!.plannedQuantity),
      quantityIsManual: false,
    });
    const reset = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      riceId,
    );
    expect(Number(reset!.orderedQuantity)).toBeCloseTo(16, 4);
    expect(reset!.quantityIsManual).toBe(false);
    expect(Number(reset!.unitCost)).toBe(1.75);

    // From now on the rice line follows the event again.
    await events(M.Event_changeHeadcount, {
      docId: eventId,
      version: await versionOf(roles.events, eventId),
      newHeadcount: 60,
    });
    const follows = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      riceId,
    );
    expect(Number(follows!.orderedQuantity)).toBeCloseTo(12, 4);
    expect(Number(follows!.unitCost)).toBe(1.75);
  });
});
