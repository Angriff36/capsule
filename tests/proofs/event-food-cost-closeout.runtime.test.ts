/**
 * AC-334 (CF-10.3): the event food-cost read prices the menu at the event
 * date from guest count x dish lines, counts an unpriced ingredient instead
 * of treating it as free, and after closeout shows estimated vs actual food
 * cost (received purchases plus recorded waste), variance, cost per guest and
 * food-cost % on the closeout revenue — the basis the profit report uses.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { EventFoodCost } from "../../convex/lib/culinaryModel/eventFoodCost";
import {
  CAPTURED_ACTUALS,
  captureCloseout,
  finalizeCloseout,
} from "./plan-vs-fact-finalized-closeout.runtime.helpers";
import {
  closeOut,
  FOOD,
  harness,
  runner,
  S,
  seedCostedEvent,
} from "./event-food-cost.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: event food cost estimate vs actual", () => {
  it("completed event closeout shows estimated vs actual food cost including recorded waste", async () => {
    const proof = harness();
    const tenantId = "tenant-event-food-cost-closeout";
    const seed = await seedCostedEvent(proof, tenantId);
    const eventId = seed.event.docId as Id<"events">;
    const read = async (role: typeof seed.kitchen) =>
      (await role.query(api.culinaryDemand.eventFoodCostReport, {
        eventId,
      })) as EventFoodCost;

    // Saffron has no price: the known part is butter only and the estimate
    // says it is not complete, so no food-cost % is claimed.
    const butterCost =
      S.expectedHeadcount * FOOD.butterPerGuest * FOOD.butterPrice; // 80
    const partial = await read(seed.roles.finance);
    expect(partial.asOf).toBe(S.startsAt);
    expect(partial.estimated.knownCost).toBe(butterCost);
    expect(partial.estimated.complete).toBe(false);
    expect(partial.estimated.unknownRows).toBe(1);
    expect(
      partial.estimated.lines.find((l) => l.name === "Food-cost saffron"),
    ).toMatchObject({ cost: 0, unknownRows: 1, reason: "priced at $0" });
    expect(partial.estimated.costPerGuest).toBeNull();
    expect(partial.estimatedFoodCostPercent).toBeNull();
    // Before closeout the revenue basis is the quote; there is no actual yet.
    expect(partial.revenue).toEqual({ amount: S.quotedPrice, source: "quote" });
    expect(partial.actual).toBeNull();

    // Price the saffron: the estimate is now complete.
    const saffronPrice = 30;
    await runner(proof, seed.kitchen)(api.mutations.Ingredient_updateCosting, {
      docId: seed.saffron.docId,
      costPerUnit: saffronPrice,
      version: 1,
    });
    const estimate =
      butterCost + S.expectedHeadcount * FOOD.saffronPerGuest * saffronPrice; // 80 + 120
    const full = await read(seed.roles.finance);
    expect(full.estimated.complete).toBe(true);
    expect(full.estimated.knownCost).toBe(estimate);
    expect(full.estimated.undatedRows).toBe(2);
    expect(full.estimated.costPerGuest).toBe(estimate / S.expectedHeadcount);

    // Close out: capture the actuals, finalize, and record kitchen waste.
    const closeoutId = await closeOut(proof, tenantId, eventId);
    await captureCloseout(proof, tenantId, closeoutId, eventId);
    await finalizeCloseout(proof, tenantId, closeoutId, 2);
    const inventory = proof.asRole({
      subject: `inventory-${tenantId}`,
      role: "inventory_staff",
      tenantId,
    });
    const store = runner(proof, inventory);
    const location = await store(
      api.mutations.StorageLocation_createViaRegister,
      { name: "Food-cost walk-in", locationType: "cold" },
    );
    const wasteArgs = {
      ingredientId: seed.butter.docId,
      locationId: location.docId,
      eventId,
      quantity: 2,
      unit: "pound",
      reason: "spoilage",
      unitCost: FOOD.butterPrice,
    };
    await store(api.mutations.WasteRecord_createViaRecord, wasteArgs);
    // A voided waste record is not waste.
    const voided = await store(api.mutations.WasteRecord_createViaRecord, {
      ...wasteArgs,
      quantity: 5,
    });
    await runner(
      proof,
      proof.asRole({
        subject: `inventory-manager-${tenantId}`,
        role: "inventory_manager",
        tenantId,
      }),
    )(api.mutations.WasteRecord_voidRecord, {
      docId: voided.docId,
      version: 1,
      reason: "Wrong crate",
    });

    const after = await read(seed.roles.finance);
    const waste = 2 * FOOD.butterPrice;
    const actualTotal = CAPTURED_ACTUALS.actualIngredientCost + waste; // 808
    expect(after.actual).toEqual({
      ingredientCost: CAPTURED_ACTUALS.actualIngredientCost,
      wasteCost: waste,
      total: actualTotal,
      costPerGuest:
        Math.round((actualTotal / CAPTURED_ACTUALS.actualHeadcount) * 100) /
        100,
      finalized: true,
    });
    expect(after.estimated.knownCost).toBe(estimate);
    expect(after.variance).toBe(actualTotal - estimate);
    // Same revenue basis as the profit report: the finalized closeout revenue.
    expect(after.revenue).toEqual({
      amount: CAPTURED_ACTUALS.actualRevenue,
      source: "closeout",
    });
    expect(after.actualFoodCostPercent).toBe(
      Math.round((actualTotal / CAPTURED_ACTUALS.actualRevenue) * 1000) / 10,
    );
    expect(after.estimatedFoodCostPercent).toBe(
      Math.round((estimate / CAPTURED_ACTUALS.actualRevenue) * 1000) / 10,
    );

    // Kitchen staff see the estimate but not revenue or closeout money.
    const kitchenStaff = proof.asRole({
      subject: `kitchen-staff-${tenantId}`,
      role: "kitchen_staff",
      tenantId,
    });
    const kitchenView = await read(kitchenStaff);
    expect(kitchenView.estimated.knownCost).toBe(estimate);
    expect(kitchenView.revenue).toBeNull();
    expect(kitchenView.actual).toBeNull();
  });
});
