/**
 * DX proof: plain-text component import finalize through generated createVia only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { ComponentImportCoordinator } from "../../src/features/kitchen/import/ComponentImportCoordinator";
import { ComponentImportFinalizer } from "../../src/features/kitchen/import/ComponentImportFinalizer";
import { modules } from "./convex-test-modules";

const SOURCE = `House Herb Oil

Yield: 2 cups

Ingredients:
2 cups olive oil
1/4 cup parsley, chopped
2 tsp kosher salt

Instructions:
Warm oil gently and steep herbs.`;

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

describe("runtime proof: component import finalize", () => {
  it("parses text and persists Component + Ingredient + ComponentIngredient via createVia", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "component-import-chef",
      role: "kitchen_manager",
      tenantId: "tenant-component-import",
    });

    const existing = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Kosher Salt",
        unit: "teaspoon",
        costPerUnit: 0.01,
        allergens: [],
      },
    )) as { docId: string };

    const catalog = [
      {
        id: existing.docId,
        name: "Kosher Salt",
        unit: "teaspoon",
      },
    ];
    const review = new ComponentImportCoordinator().parseText(SOURCE, catalog);
    expect(
      review.lines.some((line) => line.matchedIngredientId === existing.docId),
    ).toBe(true);
    const ready = {
      ...review,
      lines: review.lines.map((line) =>
        line.matchStatus === "exact"
          ? line
          : { ...line, matchStatus: "confirmed_new" as const, createNew: true },
      ),
    };

    const asArgs = (input: object) => input as Record<string, unknown>;
    const finalizer = new ComponentImportFinalizer({
      createIngredient: (input) =>
        proof.executeCommand(
          kitchen,
          api.mutations.Ingredient_createViaIntroduce,
          asArgs(input),
        ) as Promise<{ docId: string }>,
      createComponent: (input) =>
        proof.executeCommand(
          kitchen,
          api.mutations.Component_createViaDraft,
          asArgs(input),
        ) as Promise<{ docId: string }>,
      createComponentIngredient: (input) =>
        proof.executeCommand(
          kitchen,
          api.mutations.ComponentIngredient_createViaAdd,
          asArgs(input),
        ) as Promise<{ docId: string }>,
    });

    const saved = await finalizer.finalize(ready);
    const snapshot = await kitchen.run(async (ctx) => {
      const component = await ctx.db.get(saved.componentId as never);
      const ingredients = await ctx.db.query("ingredients").collect();
      const lines = await ctx.db.query("componentIngredients").collect();
      return { component, ingredients, lines };
    });

    expect(snapshot.component).toMatchObject({
      name: "House Herb Oil",
      yieldQuantity: 2,
      yieldUnit: "cup",
      tenantId: "tenant-component-import",
    });
    expect(
      snapshot.lines.filter((line) => line.componentId === saved.componentId),
    ).toHaveLength(3);
    expect(snapshot.ingredients.some((item) => item.name === "Olive Oil")).toBe(
      true,
    );
    expect(saved.createdIngredientIds.length).toBeGreaterThan(0);
  });

  it("denies import finalize for roles without kitchen access", async () => {
    const proof = harness();
    const outsider = proof.asRole({
      subject: "component-import-denied",
      role: "workforce_staff",
      tenantId: "tenant-component-import-deny",
    });
    const review = new ComponentImportCoordinator().parseText(SOURCE, []);
    const ready = {
      ...review,
      lines: review.lines.map((line) => ({
        ...line,
        matchStatus: "confirmed_new" as const,
        createNew: true,
      })),
    };
    const asArgs = (input: object) => input as Record<string, unknown>;
    const finalizer = new ComponentImportFinalizer({
      createIngredient: (input) =>
        proof.executeCommand(
          outsider,
          api.mutations.Ingredient_createViaIntroduce,
          asArgs(input),
        ) as Promise<{ docId: string }>,
      createComponent: (input) =>
        proof.executeCommand(
          outsider,
          api.mutations.Component_createViaDraft,
          asArgs(input),
        ) as Promise<{ docId: string }>,
      createComponentIngredient: (input) =>
        proof.executeCommand(
          outsider,
          api.mutations.ComponentIngredient_createViaAdd,
          asArgs(input),
        ) as Promise<{ docId: string }>,
    });

    await expect(finalizer.finalize(ready)).rejects.toThrow(/Kitchen staff/i);
  });
});
