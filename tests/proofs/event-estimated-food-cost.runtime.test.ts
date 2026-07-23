/**
 * Runtime proof: getEvent.estimatedFoodCost equals sum(listEventDish.estimatedCost)
 * for same-unit priced recipe lines, and both update when Ingredient.costPerUnit changes.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-event-estimated-food-cost",
  startsAt: Date.UTC(2026, 6, 30, 12, 0),
  endsAt: Date.UTC(2026, 6, 30, 22, 0),
  headcount: 10,
  qtyPerBatch: 2,
  costPerUnitInitial: 3,
  costPerUnitUpdated: 5,
} as const;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: Event.estimatedFoodCost ↔ EventDish.estimatedCost", () => {
  it("keeps getEvent rollup equal to listEventDish sum across ingredient price changes", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-food-cost",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-food-cost",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-food-cost",
      role: "kitchen_manager",
      tenantId: S.tenantId,
    });

    const flour = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Food-cost flour",
        unit: "kilogram",
        costPerUnit: S.costPerUnitInitial,
        allergens: [],
        category: "dry",
      },
    )) as { docId: string };

    const recipe = (await proof.executeCommand(
      kitchen,
      api.mutations.Recipe_createViaDraft,
      {
        name: "Food-cost dough",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
        servesPerYield: 1,
      },
    )) as { docId: string };

    await proof.executeCommand(kitchen, api.mutations.Recipe_publishVersion, {
      docId: recipe.docId,
      version: 1,
    });

    await proof.executeCommand(
      kitchen,
      api.mutations.RecipeIngredient_createViaAdd,
      {
        recipeId: recipe.docId,
        ingredientId: flour.docId,
        quantity: S.qtyPerBatch,
        unit: "kilogram",
      },
    );

    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Food-cost bread",
        portionSize: 1,
        portionUnit: "portion",
        category: "bread",
      },
    )) as { docId: string };

    await proof.executeCommand(
      kitchen,
      api.mutations.DishRecipe_createViaAttach,
      {
        dishId: dish.docId,
        recipeId: recipe.docId,
        yieldQuantity: 1,
        batchMultiplier: 1,
      },
    );

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Food-cost client",
      },
    )) as { docId: string };

    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Food-cost lunch",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: S.headcount,
        primaryContactName: "Cost Checker",
        budgetAmount: 1000,
        quotedPrice: 1200,
      },
    )) as { docId: string };

    await proof.executeCommand(
      events,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: event.docId,
        dishId: dish.docId,
        quantityServings: S.headcount,
      },
    );

    const assertEqualCosts = async (expectedUnitCost: number) => {
      const eventRow = (await events.query(api.queries.getEvent, {
        id: event.docId as never,
      })) as { estimatedFoodCost?: number } | null;
      const dishes = (await events.query(api.queries.listEventDishByEventId, {
        eventId: event.docId as never,
      })) as Array<{ estimatedCost?: number; deletedAt?: number | null }>;
      const active = dishes.filter((d) => d.deletedAt == null);
      const dishSum = active.reduce(
        (acc, d) =>
          acc + (typeof d.estimatedCost === "number" ? d.estimatedCost : 0),
        0,
      );
      // headcount batches × qty × unit cost (servesPerYield=1)
      const expected = S.headcount * S.qtyPerBatch * expectedUnitCost;
      expect(dishSum).toBe(expected);
      expect(eventRow?.estimatedFoodCost).toBe(dishSum);
      expect(eventRow?.estimatedFoodCost).toBe(expected);
    };

    await assertEqualCosts(S.costPerUnitInitial);

    await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_updateCosting,
      {
        docId: flour.docId,
        costPerUnit: S.costPerUnitUpdated,
        version: 1,
      },
    );

    await assertEqualCosts(S.costPerUnitUpdated);
  });
});
