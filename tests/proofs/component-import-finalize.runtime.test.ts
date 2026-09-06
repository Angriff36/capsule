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
import { ComponentImportRepository } from "../../src/features/kitchen/import/ComponentImportRepository";
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

  it("persists corrections through the repository, finalizes the durable review once, and conflicts on reuse", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "repository-import-chef",
      role: "kitchen_manager",
      tenantId: "tenant-repository-import",
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
      { id: existing.docId, name: "Kosher Salt", unit: "teaspoon" },
    ];
    const coordinator = new ComponentImportCoordinator();
    const parsed = coordinator.parseText(SOURCE, catalog);
    const operations = (api.lib as any).culinaryOperations;
    const repository = new ComponentImportRepository({
      createReview: (request) =>
        proof.executeCommand(
          kitchen,
          operations.createComponentImportReview,
          request as never,
        ) as never,
      saveReview: (request) =>
        proof.executeCommand(
          kitchen,
          operations.saveComponentImportReview,
          request as never,
        ) as never,
      getImport: (importId) =>
        kitchen.query(api.queries.getComponentImport, {
          id: importId as never,
        }) as never,
      listLinesByImportId: (importId) =>
        kitchen.query(api.queries.listComponentImportLineByImportId, {
          importId: importId as never,
        }) as never,
    });

    const created = await repository.create(parsed, {
      kind: "text_file",
      filename: "herb-oil.txt",
      rawText: SOURCE,
    });
    expect(created.reviewRevision).toBe(0);
    for (let index = 0; index < parsed.lines.length; index++) {
      const line = parsed.lines[index];
      if (line.matchedIngredientId) {
        await proof.executeCommand(
          kitchen,
          api.mutations.ComponentImportLine_suggestExactMatch,
          {
            docId: created.lineIds[index],
            matchedIngredientId: line.matchedIngredientId,
          },
        );
        await proof.executeCommand(
          kitchen,
          api.mutations.ComponentImportLine_confirmExisting,
          {
            docId: created.lineIds[index],
            matchedIngredientId: line.matchedIngredientId,
          },
        );
      } else {
        await proof.executeCommand(
          kitchen,
          api.mutations.ComponentImportLine_confirmNew,
          {
            docId: created.lineIds[index],
          },
        );
      }
    }

    // Reload binds the real line ids, then corrections save in one transaction.
    const loaded = await repository.load(created.importId);
    expect(loaded.lines.map((line) => line.importLineId)).toEqual(
      created.lineIds,
    );
    const edited = {
      ...loaded,
      yieldQuantity: 2.5,
      lines: loaded.lines.map((line, index) =>
        index === 0
          ? { ...line, quantity: 2.25, prepNotes: "extra virgin" }
          : line,
      ),
    };
    const saved = await repository.save(edited, loaded.reviewRevision ?? 0);
    expect(saved).toEqual({ reviewRevision: 1 });
    const reloaded = await repository.load(created.importId);
    expect(reloaded.yieldQuantity).toBe(2.5);
    expect(reloaded.lines[0]).toMatchObject({
      quantity: 2.25,
      prepNotes: "extra virgin",
      raw: "2 cups olive oil",
    });
    const storedRow = (await kitchen.query(api.queries.getComponentImport, {
      id: created.importId as never,
    })) as Record<string, unknown>;
    expect(storedRow.sourceFilename).toBe("herb-oil.txt");
    expect(storedRow.rawSourceText).toBe(SOURCE);

    // A stale expected revision conflicts and changes nothing.
    await expect(
      repository.save({ ...reloaded, yieldQuantity: 4 }, 0),
    ).rejects.toThrow(/stale review revision/);
    expect(
      (
        (await kitchen.query(api.queries.getComponentImport, {
          id: created.importId as never,
        })) as Record<string, unknown>
      ).parsedYieldQuantity,
    ).toBe(2.5);

    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_recordResolutionProgress,
      { docId: created.importId, resolvedLineCount: parsed.lines.length },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_approveReview,
      {
        docId: created.importId,
      },
    );

    // Finalize through the finalizer's atomic port against the real mutation.
    let captured: Record<string, unknown> | undefined;
    const finalizer = new ComponentImportFinalizer({
      createIngredient: async () => {
        throw new Error("legacy path must not run");
      },
      createComponent: async () => {
        throw new Error("legacy path must not run");
      },
      createComponentIngredient: async () => {
        throw new Error("legacy path must not run");
      },
      importComponent: async (input) => {
        captured = input as Record<string, unknown>;
        return {
          componentId: "captured",
          createdIngredientIds: [],
          lineIds: [],
        };
      },
    });
    await finalizer.finalize(reloaded, "repository:finalize");
    expect((captured as { review?: unknown }).review).toEqual({
      importId: created.importId,
      expectedRevision: 1,
    });
    const finalized = (await proof.executeCommand(
      kitchen,
      operations.importComponent,
      captured as never,
    )) as {
      componentId: string;
      createdIngredientIds: string[];
      lineIds: string[];
      recovered: boolean;
    };
    expect(finalized.createdIngredientIds).toHaveLength(2);
    const components = (await kitchen.query(
      api.queries.listComponent,
      {},
    )) as Record<string, unknown>[];
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({
      name: "House Herb Oil",
      yieldQuantity: 2.5,
      yieldUnit: "cup",
    });
    const bom = (await kitchen.query(
      api.queries.listComponentIngredient,
      {},
    )) as Record<string, unknown>[];
    expect(
      bom.filter((line) => line.componentId === finalized.componentId),
    ).toHaveLength(parsed.lines.length);
    expect(
      await kitchen.query(api.queries.getComponentImport, {
        id: created.importId as never,
      }),
    ).toMatchObject({
      status: "completed",
      resultingComponentId: finalized.componentId,
    });

    // Identical replay returns the same receipt; a changed request conflicts.
    const replay = await proof.executeCommand(
      kitchen,
      operations.importComponent,
      captured as never,
    );
    expect(replay).toEqual({ ...finalized, recovered: true });
    expect(await kitchen.query(api.queries.listComponent, {})).toHaveLength(1);
    const changed = {
      ...(captured as { projection: Record<string, unknown> }),
      projection: {
        ...(captured as { projection: Record<string, unknown> }).projection,
        yieldQuantity: 99,
      },
    };
    await expect(
      proof.executeCommand(
        kitchen,
        operations.importComponent,
        changed as never,
      ),
    ).rejects.toThrow(/already used with a different request/);
    expect(await kitchen.query(api.queries.listComponent, {})).toHaveLength(1);
  });
});
