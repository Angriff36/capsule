/**
 * Runtime proof (AC-441, BE-9.2 quantity formula): every recipe line becomes
 * event demand as recipe amount x waste x servings in the ingredient's own
 * unit. Two prep steps on the same recipe add no second demand row. A
 * servings change scales each row exactly once, and a replayed reconcile
 * writes nothing.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-servings-replay",
  startsAt: Date.UTC(2026, 9, 12, 12, 0),
  endsAt: Date.UTC(2026, 9, 12, 22, 0),
  headcount: 12,
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

type ContributionRow = {
  _id: string;
  eventDishId: string;
  ingredientId: string;
  quantity: number;
  servings: number;
  unit: string;
  sourceKey?: string | null;
  ownership?: string | null;
  supersededAt?: number | null;
  deletedAt?: number | null;
};

type Reconcile = {
  created: number;
  updated: number;
  superseded: number;
  unchanged: number;
};

const live = (rows: ContributionRow[]) =>
  rows.filter(
    (r) =>
      r.deletedAt == null &&
      r.supersededAt == null &&
      (r.ownership ?? "event_dish") === "event_dish",
  );

describe("runtime proof: servings change reconciles demand once (AC-441)", () => {
  it("scales each contribution exactly once and a replay writes nothing", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-441",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-441",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-441",
      role: "kitchen_manager",
      tenantId: S.tenantId,
    });
    const manager = proof.asRole({
      subject: "manager-441",
      role: "manager",
      tenantId: S.tenantId,
    });

    const butter = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "butter",
        unit: "pound",
        costPerUnit: 4,
        allergens: [],
        category: "dairy",
      },
    )) as { docId: string };
    const cream = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "heavy cream",
        unit: "quart",
        costPerUnit: 5,
        allergens: [],
        category: "dairy",
      },
    )) as { docId: string };
    const recipe = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      {
        name: "Beurre blanc",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    )) as { docId: string };
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentIngredient_createViaAdd,
      {
        componentId: recipe.docId,
        ingredientId: butter.docId,
        quantity: 0.25,
        unit: "pound",
        wasteFactor: 1.2,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentIngredient_createViaAdd,
      {
        componentId: recipe.docId,
        ingredientId: cream.docId,
        quantity: 2,
        unit: "fluid_ounce",
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.Component_publishVersion,
      {
        docId: recipe.docId,
      },
    );
    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Halibut",
        portionSize: 1,
        portionUnit: "portion",
        category: "entree",
      },
    )) as { docId: string };
    await proof.executeCommand(
      kitchen,
      api.mutations.DishComponent_createViaAttach,
      {
        dishId: dish.docId,
        componentId: recipe.docId,
        yieldQuantity: 1,
        batchMultiplier: 1,
      },
    );
    // Two prep steps on the same recipe: making and portioning the sauce.
    for (const name of ["Make beurre blanc", "Portion beurre blanc"]) {
      await proof.executeCommand(kitchen, api.mutations.DishTask_createViaAdd, {
        dishId: dish.docId,
        name,
        defaultQuantity: 1,
        defaultUnit: "portion",
        station: "Sauce",
        componentId: recipe.docId,
      });
    }
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Servings client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Servings dinner",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: S.headcount,
        primaryContactName: "Pat Planner",
        budgetAmount: 2000,
        quotedPrice: 2500,
      },
    )) as { docId: string };
    const eventDish = (await proof.executeCommand(
      events,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: event.docId,
        dishId: dish.docId,
        quantityServings: S.headcount,
      },
    )) as { docId: string };

    const eventId = event.docId as Id<"events">;
    const reconcile = async () =>
      (await kitchen.mutation(api.culinaryDemand.reconcileEventDemand, {
        eventId,
      })) as Reconcile;
    const rows = async () =>
      live(
        (await kitchen.run(
          async (ctx) =>
            await ctx.db.query("eventIngredientContributions").collect(),
        )) as unknown as ContributionRow[],
      ).filter((r) => r.eventDishId === eventDish.docId);
    const byIngredient = (list: ContributionRow[], id: string) =>
      list.filter((r) => r.ingredientId === id);

    await reconcile();
    const first = await rows();
    // One row per recipe line, even with two prep steps on the recipe.
    expect(byIngredient(first, butter.docId)).toHaveLength(1);
    expect(byIngredient(first, cream.docId)).toHaveLength(1);
    // 0.25 lb x 1.2 waste x 12 = 3.6 lb; 2 fl oz x 12 = 24 fl oz = 0.75 qt.
    expect(byIngredient(first, butter.docId)[0]).toMatchObject({
      unit: "pound",
      servings: 12,
    });
    expect(byIngredient(first, butter.docId)[0].quantity).toBeCloseTo(3.6, 6);
    expect(byIngredient(first, cream.docId)[0].unit).toBe("quart");
    expect(byIngredient(first, cream.docId)[0].quantity).toBeCloseTo(0.75, 6);

    // A replay with nothing changed writes nothing.
    expect(await reconcile()).toMatchObject({
      created: 0,
      updated: 0,
      superseded: 0,
    });

    await proof.executeCommand(
      manager,
      api.mutations.EventDish_adjustServings,
      {
        docId: eventDish.docId,
        quantityServings: 20,
      },
    );
    const change = await reconcile();
    expect(change.created).toBe(0);
    expect(change.superseded).toBe(0);

    const second = await rows();
    expect(second).toHaveLength(2);
    expect(byIngredient(second, butter.docId)).toHaveLength(1);
    expect(byIngredient(second, cream.docId)).toHaveLength(1);
    // Scaled once: 0.25 x 1.2 x 20 = 6 lb (not 3.6 + 6, not 6 x 20/12 twice).
    expect(byIngredient(second, butter.docId)[0].quantity).toBeCloseTo(6, 6);
    expect(byIngredient(second, butter.docId)[0].servings).toBe(20);
    expect(byIngredient(second, cream.docId)[0].quantity).toBeCloseTo(1.25, 6);
    // Same rows, same source keys: the change updated them in place.
    expect(second.map((r) => r.sourceKey).sort()).toEqual(
      first.map((r) => r.sourceKey).sort(),
    );

    expect(await reconcile()).toMatchObject({
      created: 0,
      updated: 0,
      superseded: 0,
    });
    const third = await rows();
    expect(third.map((r) => [r._id, r.quantity])).toEqual(
      second.map((r) => [r._id, r.quantity]),
    );
  });
});
