import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./proofs/convex-test-modules";

function kitchenActor() {
  const proof = createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
  const actor = proof.asRole({
    subject: "culinary-create-user",
    role: "kitchen_manager",
    tenantId: "tenant-culinary-create",
  });
  return { proof, actor };
}

describe("culinary governed creation", () => {
  it("creates Ingredient, Recipe, and Dish with command-owned timestamps", async () => {
    const { proof, actor } = kitchenActor();

    const ingredient = (await proof.executeCommand(
      actor,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Kosher salt",
        unit: "gram",
        costPerUnit: 0.02,
        allergens: [],
        category: "pantry",
      },
    )) as { docId: string };
    const recipe = (await proof.executeCommand(
      actor,
      api.mutations.Recipe_createViaDraft,
      {
        name: "Seasoning base",
        yieldQuantity: 12,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    )) as { docId: string };
    const dish = (await proof.executeCommand(
      actor,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Seasoned vegetables",
        portionSize: 1,
        portionUnit: "portion",
      },
    )) as { docId: string };

    const created = await actor.run(async (ctx) => ({
      ingredient: await ctx.db.get(ingredient.docId as never),
      recipe: await ctx.db.get(recipe.docId as never),
      dish: await ctx.db.get(dish.docId as never),
    }));

    expect(created.ingredient).toMatchObject({
      name: "Kosher salt",
      tenantId: "tenant-culinary-create",
      version: 1,
    });
    expect(created.recipe).toMatchObject({
      name: "Seasoning base",
      tenantId: "tenant-culinary-create",
      version: 1,
    });
    expect(created.dish).toMatchObject({
      name: "Seasoned vegetables",
      tenantId: "tenant-culinary-create",
      version: 1,
    });
    expect(created.ingredient?.introducedAt).toEqual(expect.any(Number));
    expect(created.recipe?.draftedAt).toEqual(expect.any(Number));
    expect(created.dish?.introducedAt).toEqual(expect.any(Number));
  });

  it("creates Ingredient when optional category is omitted", async () => {
    const { proof, actor } = kitchenActor();

    const result = (await proof.executeCommand(
      actor,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Black pepper",
        unit: "gram",
        costPerUnit: 0.05,
        allergens: [],
      },
    )) as { docId: string };

    const doc = await actor.run(async (ctx) =>
      ctx.db.get(result.docId as never),
    );
    expect(doc).toMatchObject({
      name: "Black pepper",
      tenantId: "tenant-culinary-create",
    });
    expect(doc?.category ?? null).toBeNull();
    expect(doc?.introducedAt).toEqual(expect.any(Number));
  });

  it("rejects invalid allergen values at the generated API boundary", async () => {
    const { proof, actor } = kitchenActor();

    await expect(
      proof.executeCommand(actor, api.mutations.Ingredient_createViaIntroduce, {
        name: "Mystery spice",
        unit: "gram",
        costPerUnit: 1,
        allergens: ["not_a_real_allergen"],
      }),
    ).rejects.toThrow();

    const ingredients = await actor.run(async (ctx) =>
      ctx.db.query("ingredients").collect(),
    );
    expect(ingredients).toEqual([]);
  });

  it("returns the useful validation message and leaves no partial Ingredient", async () => {
    const { proof, actor } = kitchenActor();

    await expect(
      proof.executeCommand(actor, api.mutations.Ingredient_createViaIntroduce, {
        name: "   ",
        unit: "each",
        costPerUnit: 0,
      }),
    ).rejects.toThrow("Ingredient name is required");

    const ingredients = await actor.run(async (ctx) =>
      ctx.db.query("ingredients").collect(),
    );
    expect(ingredients).toEqual([]);
  });
});
