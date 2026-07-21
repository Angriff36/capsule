/**
 * Focused proof: EventDish/headcount → RecipeIngredient fanOut → IngredientDemand.
 * Scenario: UI Auto Multi-Ingredient Dish at headcount 10, then 12.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-recipe-to-demand",
  weekStart: Date.UTC(2026, 6, 20, 12, 0),
  endsAt: Date.UTC(2026, 6, 20, 22, 0),
  headcount: 10,
  headcountRevised: 12,
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

describe("runtime proof: recipe → IngredientDemand foreach-create", () => {
  it("fans out three ingredients and revises on headcount change", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-rtd",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-rtd",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-rtd",
      role: "kitchen_staff",
      tenantId: S.tenantId,
    });
    const inventory = proof.asRole({
      subject: "inventory-rtd",
      role: "inventory_staff",
      tenantId: S.tenantId,
    });

    const chicken = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "chicken",
        unit: "each",
        costPerUnit: 1,
        allergens: [],
        category: "protein",
      },
    )) as { docId: string };
    const onions = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "onions",
        unit: "each",
        costPerUnit: 1,
        allergens: [],
        category: "produce",
      },
    )) as { docId: string };
    const garlic = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Minced Garlic",
        unit: "cup",
        costPerUnit: 1,
        allergens: [],
        category: "produce",
      },
    )) as { docId: string };

    const recipe = (await proof.executeCommand(
      kitchen,
      api.mutations.Recipe_createViaDraft,
      {
        name: "UI Auto Multi recipe",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    )) as { docId: string };

    await proof.executeCommand(
      kitchen,
      api.mutations.RecipeIngredient_createViaAdd,
      {
        recipeId: recipe.docId,
        ingredientId: chicken.docId,
        quantity: 1,
        unit: "each",
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.RecipeIngredient_createViaAdd,
      {
        recipeId: recipe.docId,
        ingredientId: onions.docId,
        quantity: 2,
        unit: "each",
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.RecipeIngredient_createViaAdd,
      {
        recipeId: recipe.docId,
        ingredientId: garlic.docId,
        quantity: 0.5,
        unit: "cup",
      },
    );

    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "UI Auto Multi-Ingredient Dish",
        portionSize: 1,
        portionUnit: "portion",
        category: "entree",
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
        companyName: "Recipe demand client",
      },
    )) as { docId: string };

    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Multi-ingredient lunch",
        eventType: "catering",
        startsAt: S.weekStart,
        endsAt: S.endsAt,
        expectedHeadcount: S.headcount,
        primaryContactName: "Pat Planner",
        budgetAmount: 2000,
        quotedPrice: 2500,
      },
    )) as { docId: string };

    // Hop diagnostics before add
    const catalog = await kitchen.run(async (ctx) => {
      const dishRecipes = (await ctx.db.query("dishRecipes").collect()).filter(
        (row) => (row as { dishId?: string }).dishId === dish.docId,
      );
      const recipeIngredients = (
        await ctx.db.query("recipeIngredients").collect()
      ).filter(
        (row) => (row as { recipeId?: string }).recipeId === recipe.docId,
      );
      return { dishRecipes, recipeIngredients };
    });
    expect(catalog.dishRecipes).toHaveLength(1);
    expect(catalog.recipeIngredients).toHaveLength(3);

    const firstEventDish = (await proof.executeCommand(
      events,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: event.docId,
        dishId: dish.docId,
        quantityServings: S.headcount,
      },
    )) as { docId: string };

    const hops = await inventory.run(async (ctx) => {
      const seeds = await ctx.db.query("eventDishRecipeSeeds").collect();
      const contribs = await ctx.db
        .query("eventIngredientContributions")
        .collect();
      const demands = await ctx.db.query("ingredientDemands").collect();
      return {
        seeds: seeds.filter(
          (row) => (row as { deletedAt?: number | null }).deletedAt == null,
        ),
        contribs: contribs.filter(
          (row) => (row as { deletedAt?: number | null }).deletedAt == null,
        ),
        demands: demands.filter(
          (row) => (row as { deletedAt?: number | null }).deletedAt == null,
        ),
      };
    });

    expect(
      hops.seeds,
      `hop1 EventDishRecipeSeed count=${hops.seeds.length}`,
    ).toHaveLength(1);
    expect(
      hops.contribs,
      `hop2 EventIngredientContribution count=${hops.contribs.length}`,
    ).toHaveLength(3);
    expect(
      hops.demands,
      `hop3 IngredientDemand count=${hops.demands.length}`,
    ).toHaveLength(3);

    const qtyByIngredient = (demands: typeof hops.demands) => {
      const map = new Map<string, { q: number; unit: string; id: string }>();
      for (const row of demands) {
        const r = row as {
          _id: string;
          ingredientId: string;
          requiredQuantity: number;
          unit: string;
        };
        map.set(r.ingredientId, {
          q: Number(r.requiredQuantity),
          unit: r.unit,
          id: r._id,
        });
      }
      return map;
    };

    const at10 = qtyByIngredient(hops.demands);
    expect(at10.get(chicken.docId)).toEqual({
      q: 10,
      unit: "each",
      id: at10.get(chicken.docId)!.id,
    });
    expect(at10.get(onions.docId)).toEqual({
      q: 20,
      unit: "each",
      id: at10.get(onions.docId)!.id,
    });
    expect(at10.get(garlic.docId)).toEqual({
      q: 5,
      unit: "cup",
      id: at10.get(garlic.docId)!.id,
    });

    const chickenIdAt10 = at10.get(chicken.docId)!.id;
    const onionsIdAt10 = at10.get(onions.docId)!.id;
    const garlicIdAt10 = at10.get(garlic.docId)!.id;

    // Soft-deleted EventDish must not abort headcount fanOut (Manifest ≥3.6.41).
    await proof.executeCommand(events, api.mutations.EventDish_remove, {
      docId: firstEventDish.docId,
      reason: "swap before re-add",
    });
    await proof.executeCommand(
      events,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: event.docId,
        dishId: dish.docId,
        quantityServings: S.headcount,
      },
    );

    const afterReadd = await inventory.run(async (ctx) => {
      const demands = await ctx.db.query("ingredientDemands").collect();
      return demands.filter(
        (row) => (row as { deletedAt?: number | null }).deletedAt == null,
      );
    });
    expect(afterReadd).toHaveLength(3);
    const at10Again = qtyByIngredient(afterReadd);
    expect(at10Again.get(chicken.docId)?.q).toBe(10);
    expect(at10Again.get(onions.docId)?.q).toBe(20);
    expect(at10Again.get(garlic.docId)?.q).toBe(5);

    await proof.executeCommand(events, api.mutations.Event_changeHeadcount, {
      docId: event.docId,
      version: 1,
      newHeadcount: S.headcountRevised,
    });

    const after = await inventory.run(async (ctx) => {
      const demands = await ctx.db.query("ingredientDemands").collect();
      return demands.filter(
        (row) => (row as { deletedAt?: number | null }).deletedAt == null,
      );
    });
    expect(after).toHaveLength(3);
    const at12 = qtyByIngredient(after);
    // Same IngredientDemand rows (match else create), revised quantities.
    expect(at12.get(chicken.docId)?.id).toBe(chickenIdAt10);
    expect(at12.get(onions.docId)?.id).toBe(onionsIdAt10);
    expect(at12.get(garlic.docId)?.id).toBe(garlicIdAt10);
    expect(at12.get(chicken.docId)?.q).toBe(12);
    expect(at12.get(onions.docId)?.q).toBe(24);
    expect(at12.get(garlic.docId)?.q).toBe(6);
    expect(at12.get(chicken.docId)?.unit).toBe("each");
    expect(at12.get(onions.docId)?.unit).toBe("each");
    expect(at12.get(garlic.docId)?.unit).toBe("cup");
  });
});
