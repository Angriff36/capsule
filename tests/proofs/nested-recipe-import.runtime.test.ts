// AC-066 / AC-069 runtime proof: a pasted recipe that uses another recipe
// from the recipe book is parsed, matched, corrected, saved, reloaded and
// finished through the real governed seams. The finished recipe carries a
// nested recipe line (the same record the recipe book's Sub-recipes panel
// reads) next to its ingredient line, and the import keeps the source text.
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ComponentImportCoordinator } from "../../src/features/kitchen/import/ComponentImportCoordinator";
import { ComponentImportFinalizer } from "../../src/features/kitchen/import/ComponentImportFinalizer";
import { ComponentImportRepository } from "../../src/features/kitchen/import/ComponentImportRepository";

const ops = (api.lib as any).culinaryOperations;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const SOURCE = `Mac sauce
Yield: 5 gallon

Ingredients:
1 qt heavy cream
2 gal Alfredo sauce (see recipe)

Method:
1. Warm the cream and stir in the alfredo.
`;

describe("runtime proof: nested recipe import", () => {
  it("parses, links, corrects, reloads and finishes a recipe that uses another recipe", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const kitchen = proof.asRole({
      subject: "nested-chef",
      role: "kitchen_manager",
      tenantId: "nested-tenant",
    });
    const outsider = proof.asRole({
      subject: "other-chef",
      role: "kitchen_manager",
      tenantId: "other-tenant",
    });
    const cream = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Heavy Cream", unit: "quart", costPerUnit: 5, allergens: [] },
    )) as { docId: string };
    const alfredo = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      { name: "Alfredo sauce", yieldQuantity: 1, yieldUnit: "gallon" },
    )) as { docId: string };
    const otherAlfredo = (await proof.executeCommand(
      outsider,
      api.mutations.Component_createViaDraft,
      { name: "Alfredo sauce", yieldQuantity: 1, yieldUnit: "gallon" },
    )) as { docId: string };

    const repository = new ComponentImportRepository({
      createReview: async (request) =>
        (await proof.executeCommand(
          kitchen,
          ops.createComponentImportReview,
          request as never,
        )) as never,
      saveReview: async (request) =>
        (await proof.executeCommand(
          kitchen,
          ops.saveComponentImportReview,
          request as never,
        )) as never,
      getImport: async (id) =>
        (await kitchen.query(api.queries.getComponentImport, {
          id: id as never,
        })) as never,
      listLinesByImportId: async (id) =>
        (await kitchen.query(api.queries.listComponentImportLineByImportId, {
          importId: id as never,
        })) as never,
    });

    // Parse + match: cream is an ingredient, alfredo links the book recipe,
    // the method stays method text.
    const review = new ComponentImportCoordinator().parseText(
      SOURCE,
      [{ id: cream.docId, name: "Heavy Cream", unit: "quart" }],
      "pasted_text",
      undefined,
      [{ id: alfredo.docId, name: "Alfredo sauce" }],
    );
    expect(review.lines.map((line) => line.matchStatus)).toEqual([
      "exact",
      "subrecipe",
    ]);
    expect(review.lines[1]).toMatchObject({
      name: "Alfredo Sauce",
      quantity: 2,
      unit: "gallon",
      matchedComponentId: alfredo.docId,
    });
    expect(review.instructions).toContain("Warm the cream");

    const created = await repository.create(review, {
      kind: "pasted_text",
      rawText: SOURCE,
    });
    expect(
      await kitchen.query(api.queries.getComponentImport, {
        id: created.importId as never,
      }),
    ).toMatchObject({ status: "ready", resolvedLineCount: 2 });

    // A sub-recipe link to another workspace's recipe is refused with no
    // write: the review keeps its revision and its own link.
    await expect(
      proof.executeCommand(kitchen, ops.saveComponentImportReview, {
        importId: created.importId,
        expectedReviewRevision: 0,
        header: { name: "Mac sauce" },
        lines: [
          {
            lineId: created.lineIds[1],
            match: {
              matchStatus: "subrecipe",
              matchedComponentId: otherAlfredo.docId,
            },
          },
        ],
      } as never),
    ).rejects.toThrow("Recipe not found");
    let loaded = await repository.load(created.importId);
    expect(loaded.reviewRevision).toBe(0);
    expect(loaded.lines[1]).toMatchObject({
      matchStatus: "subrecipe",
      matchedComponentId: alfredo.docId,
      raw: "2 gal Alfredo sauce (see recipe)",
      subrecipeHint: true,
    });

    // Correction: 3 gallons, not 2. Saved, then reloaded exactly.
    const coordinator = new ComponentImportCoordinator();
    await repository.save(
      coordinator.updateLine(loaded, 1, { quantity: 3 }),
      0,
    );
    loaded = await repository.load(created.importId);
    expect(loaded.reviewRevision).toBe(1);
    expect(loaded.lines[1]).toMatchObject({
      matchStatus: "subrecipe",
      matchedComponentId: alfredo.docId,
      quantity: 3,
    });
    expect(loaded.rawSourceText).toBe(SOURCE);

    // Finishing with a request that swaps the linked recipe is refused.
    await expect(
      proof.executeCommand(kitchen, ops.importComponent, {
        operationKey: "nested-swap",
        review: { importId: created.importId, expectedRevision: 1 },
        projection: {
          name: "Mac sauce",
          yieldQuantity: 5,
          yieldUnit: "gallon",
          lines: [
            {
              name: "Heavy Cream",
              ingredientId: cream.docId,
              quantity: 1,
              unit: "quart",
              sortOrder: 1,
            },
            {
              name: "Alfredo Sauce",
              componentId: otherAlfredo.docId,
              quantity: 3,
              unit: "gallon",
              sortOrder: 2,
            },
          ],
        },
      } as never),
    ).rejects.toThrow("must keep its linked sub-recipe");

    const finalized = await new ComponentImportFinalizer({
      importComponent: async (input) =>
        (await proof.executeCommand(
          kitchen,
          ops.importComponent,
          input as never,
        )) as never,
      createIngredient: async () => {
        throw new Error("not used");
      },
      createComponent: async () => {
        throw new Error("not used");
      },
      createComponentIngredient: async () => {
        throw new Error("not used");
      },
    }).finalize(loaded, "nested-finish");
    expect(finalized.createdIngredientIds).toEqual([]);

    // The recipe book reads the finished recipe: one ingredient line and one
    // nested recipe line pointing at Alfredo, in source order.
    const nested = (await kitchen.query(
      api.queries.listComponentComponentByComponentId,
      { componentId: finalized.componentId as never },
    )) as { childComponentId: string; quantity: number; unit: string }[];
    expect(nested).toHaveLength(1);
    expect(nested[0]).toMatchObject({
      childComponentId: alfredo.docId,
      quantity: 3,
      unit: "gallon",
    });
    const ingredientLines = (await kitchen.query(
      api.queries.listComponentIngredientByComponentId,
      { componentId: finalized.componentId as never },
    )) as { ingredientId: string }[];
    expect(ingredientLines.map((line) => line.ingredientId)).toEqual([
      cream.docId,
    ]);
    expect(
      await kitchen.query(api.queries.getComponent, {
        id: finalized.componentId as never,
      }),
    ).toMatchObject({
      name: "Mac sauce",
      instructions: expect.stringContaining("Warm the cream"),
    });
    // The import is complete and still holds the original text.
    expect(
      await kitchen.query(api.queries.getComponentImport, {
        id: created.importId as never,
      }),
    ).toMatchObject({
      status: "completed",
      resultingComponentId: finalized.componentId,
      rawSourceText: SOURCE,
    });
  });

  it("refuses a recipe-book loop by name, and a removed sub-recipe line no longer blocks", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const kitchen = proof.asRole({
      subject: "loop-chef",
      role: "kitchen_manager",
      tenantId: "loop-tenant",
    });
    const draft = async (name: string) =>
      (
        (await proof.executeCommand(
          kitchen,
          api.mutations.Component_createViaDraft,
          { name, yieldQuantity: 1, yieldUnit: "gallon" },
        )) as { docId: string }
      ).docId;
    const mac = await draft("Mac sauce");
    const alfredo = await draft("Alfredo sauce");
    const roux = await draft("Roux");
    const add = (componentId: string, childComponentId: string) =>
      proof.executeCommand(
        kitchen,
        (api as any).culinaryDemand.addNestedRecipeLine,
        { componentId, childComponentId, quantity: 1, unit: "gallon" },
      ) as Promise<{ docId: string }>;
    await add(mac, alfredo);
    await add(alfredo, roux);
    await expect(add(roux, mac)).rejects.toThrow(
      "Mac sauce already uses Roux (Mac sauce → Alfredo sauce → Roux), so it cannot go inside Roux. That would make a loop.",
    );
    // Taking Alfredo out of Mac ends the loop, so the same add now works.
    const [line] = (await kitchen.query(
      api.queries.listComponentComponentByComponentId,
      { componentId: mac as never },
    )) as { _id: string; version: number }[];
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentComponent_remove,
      {
        docId: line._id,
        version: line.version,
        reason: "Made fresh now",
      } as never,
    );
    await expect(add(roux, mac)).resolves.toHaveProperty("docId");
  });
});
