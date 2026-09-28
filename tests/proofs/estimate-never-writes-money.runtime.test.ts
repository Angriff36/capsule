/**
 * AC-449 (BE-9.3): the food-cost estimate is a live planning read. Re-costing
 * an event — reading the estimate, reconciling its demand, and repricing an
 * ingredient — changes the estimate only; the quoted price, the invoice, the
 * closeout amounts and every receipt price stay exactly as they were.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  captureCloseout,
  finalizeCloseout,
} from "./plan-vs-fact-finalized-closeout.runtime.helpers";
import {
  closeOut,
  harness,
  runner,
  seedCostedEvent,
} from "./event-food-cost.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const MONEY_FIELDS = {
  events: ["quotedPrice", "budgetAmount", "version"],
  invoices: [
    "subtotal",
    "taxAmount",
    "discountAmount",
    "total",
    "amountPaid",
    "status",
    "version",
  ],
  eventCloseouts: [
    "actualRevenue",
    "actualIngredientCost",
    "actualWasteCost",
    "actualLaborCost",
    "actualVendorCost",
    "totalActualCost",
    "grossProfit",
    "status",
    "version",
  ],
  ingredientPriceObservations: ["unitPrice", "unit", "observedAt"],
} as const;

describe("runtime proof: the food-cost estimate never writes money", () => {
  it("re-costing an event changes no quoted price, invoice, or closeout row", async () => {
    const proof = harness();
    const tenantId = "tenant-estimate-never-writes-money";
    const seed = await seedCostedEvent(proof, tenantId);
    const eventId = seed.event.docId as Id<"events">;
    const closeoutId = await closeOut(proof, tenantId, eventId);
    await captureCloseout(proof, tenantId, closeoutId, eventId);
    await finalizeCloseout(proof, tenantId, closeoutId, 2);

    const finance = seed.roles.finance;
    const snapshot = async () => {
      const out: Record<string, unknown[]> = {};
      for (const [table, fields] of Object.entries(MONEY_FIELDS)) {
        const rows = (await finance.run(async (ctx) =>
          ctx.db.query(table as "events").collect(),
        )) as unknown as Record<string, unknown>[];
        out[table] = rows.map((row) =>
          Object.fromEntries(
            ["_id", ...fields].map((field) => [field, row[field]]),
          ),
        );
      }
      return out;
    };
    const before = await snapshot();
    expect(before.events).toHaveLength(1);
    expect(before.invoices).toHaveLength(1);
    expect(before.eventCloseouts).toHaveLength(1);

    const estimate = async () =>
      (
        await finance.query(api.culinaryDemand.eventFoodCostReport, {
          eventId,
        })
      ).estimated.knownCost;
    const first = await estimate();
    await seed.kitchen.mutation(api.culinaryDemand.reconcileEventDemand, {
      eventId,
    });
    // Reprice the butter: the estimate moves, nothing else does.
    await runner(proof, seed.kitchen)(api.mutations.Ingredient_updateCosting, {
      docId: seed.butter.docId,
      costPerUnit: 9,
      version: 1,
    });
    const second = await estimate();
    expect(second).not.toBe(first);
    expect(await snapshot()).toEqual(before);
  });
});
