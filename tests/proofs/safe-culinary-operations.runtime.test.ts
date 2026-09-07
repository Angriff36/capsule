import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { buildComponentSnapshotData } from "../../src/features/kitchen/componentSnapshot";
import { ComponentImportCoordinator } from "../../src/features/kitchen/import/ComponentImportCoordinator";
import { ComponentImportFinalizer } from "../../src/features/kitchen/import/ComponentImportFinalizer";
import {
  buildCreateReviewRequest,
  buildSaveReviewRequest,
  mapStoredReview,
} from "../../src/features/kitchen/import/ComponentImportRepository";

const harness = () =>
  createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: safe culinary operations", () => {
  it("rolls back an invalid menu clone and replays a confirmed clone without source drift", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "menu-chef",
      role: "kitchen_manager",
      tenantId: "menu-tenant",
    });
    const source = (await proof.executeCommand(
      kitchen,
      api.mutations.Menu_createViaDraft,
      {
        name: "Source",
        isTemplate: true,
        basePrice: 10,
        pricePerPerson: 2,
        minGuests: 1,
        maxGuests: 10,
      },
    )) as { docId: string };
    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Soup",
        category: "starter",
        portionSize: 1,
        portionUnit: "serving",
      },
    )) as { docId: string };
    await proof.executeCommand(kitchen, api.mutations.MenuDish_createViaAdd, {
      menuId: source.docId,
      dishId: dish.docId,
      sortOrder: 3,
      sellingPrice: 7,
      course: "first",
      serviceStyle: "plated",
      specialInstructions: "hot",
    });
    const invalidLineId = await proof.seedEntity(kitchen, "menuDishes", {
      tenantId: "menu-tenant",
      menuId: source.docId,
      dishId: dish.docId,
      sortOrder: 4,
      sellingPrice: -1,
      version: 1,
    });
    await expect(
      proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.cloneMenu,
        {
          sourceMenuId: source.docId,
          name: "Broken",
          isTemplate: false,
          operationKey: "menu-clone:broken",
        },
      ),
    ).rejects.toThrow(/negative/i);
    expect(await kitchen.query(api.queries.listMenu, {})).toHaveLength(1);
    await kitchen.run((ctx) =>
      ctx.db.patch(invalidLineId as never, { deletedAt: Date.now() }),
    );

    const args = {
      sourceMenuId: source.docId,
      name: "Copy",
      isTemplate: false,
      operationKey: "menu-clone:storage-unavailable",
    };
    const first = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.cloneMenu,
      args,
    )) as any;
    await kitchen.run((ctx) =>
      ctx.db.patch(source.docId as never, { name: "Changed source" }),
    );
    const retry = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.cloneMenu,
      args,
    )) as any;
    expect(retry).toEqual({ ...first, recovered: true });
    const changedRequest = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.cloneMenu,
      { ...args, name: "Different requested copy" },
    )) as any;
    expect(changedRequest).toEqual({ ...first, recovered: true });
    const copies = (await kitchen.query(api.queries.listMenuDish, {})) as any[];
    expect(copies.filter((row) => row.menuId === first.menuId)).toMatchObject([
      { sortOrder: 3, specialInstructions: "hot" },
    ]);
  });

  it("atomically imports reviewed ingredients and rejects a foreign tenant match", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "import-chef",
      role: "kitchen_manager",
      tenantId: "import-tenant",
    });
    const outsider = proof.asRole({
      subject: "other-chef",
      role: "kitchen_manager",
      tenantId: "other-tenant",
    });
    const foreign = (await proof.executeCommand(
      outsider,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Foreign salt",
        unit: "gram",
        costPerUnit: 1,
        allergens: [],
      },
    )) as { docId: string };
    const projection = {
      name: "Dressing",
      yieldQuantity: 1,
      yieldUnit: "liter",
      batchMultiplier: 1,
      lines: [
        {
          name: "Salt",
          ingredientId: foreign.docId,
          quantity: 1,
          unit: "gram",
          sortOrder: 1,
          prepNotes: "fine",
          wasteFactor: 1.1,
        },
      ],
    };
    await expect(
      proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.importComponent,
        {
          operationKey: "import:foreign",
          projection,
        },
      ),
    ).rejects.toThrow(/Ingredient not found/i);

    const createdProjection = {
      ...projection,
      lines: [
        { ...projection.lines[0], ingredientId: undefined, createNew: true },
        {
          ...projection.lines[0],
          name: "Invalid",
          ingredientId: undefined,
          createNew: true,
          quantity: -1,
          sortOrder: 2,
        },
      ],
    };
    await expect(
      proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.importComponent,
        {
          operationKey: "import:correctable",
          projection: createdProjection,
        },
      ),
    ).rejects.toThrow(/positive/i);
    expect(await kitchen.query(api.queries.listComponent, {})).toEqual([]);
    expect(await kitchen.query(api.queries.listIngredient, {})).toEqual([]);
    const args = {
      operationKey: "import:correctable",
      projection: {
        ...createdProjection,
        lines: createdProjection.lines.slice(0, 1),
      },
    };
    const first = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.importComponent,
      args,
    )) as any;
    const retry = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.importComponent,
      args,
    )) as any;
    expect(retry).toEqual({ ...first, recovered: true });
    const changed = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.importComponent,
      {
        operationKey: args.operationKey,
        projection: {
          ...args.projection,
          name: "Different reviewed component",
        },
      },
    )) as any;
    expect(changed).toEqual({ ...first, recovered: true });

    const local = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Local salt", unit: "gram", costPerUnit: 1, allergens: [] },
    )) as { docId: string };
    const matchedArgs = {
      operationKey: "import:deleted-match",
      projection: {
        ...projection,
        name: "Matched dressing",
        lines: [{ ...projection.lines[0], ingredientId: local.docId }],
      },
    };
    const matched = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.importComponent,
      matchedArgs,
    )) as any;
    await kitchen.run((ctx) =>
      ctx.db.patch(local.docId as never, { deletedAt: Date.now() }),
    );
    expect(
      await proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.importComponent,
        matchedArgs,
      ),
    ).toEqual({ ...matched, recovered: true });
  });

  it("rolls back restore after removing existing lines, then retries a corrected legacy snapshot", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "restore-retry",
      role: "kitchen_manager",
      tenantId: "restore-retry-tenant",
    });
    const ingredient = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Butter",
        unit: "gram",
        costPerUnit: 1,
        allergens: [],
      },
    )) as { docId: string };
    const component = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      {
        name: "Original",
        yieldQuantity: 1,
        yieldUnit: "batch",
      },
    )) as { docId: string };
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentIngredient_createViaAdd,
      {
        componentId: component.docId,
        ingredientId: ingredient.docId,
        quantity: 10,
        unit: "gram",
        sortOrder: 9,
        wasteFactor: 1.4,
        prepNotes: "original",
      },
    );
    const snapshotOf = async (name: string, quantity: number) =>
      (await proof.executeCommand(
        kitchen,
        api.mutations.ComponentSnapshot_createViaCapture,
        {
          componentId: component.docId,
          versionNumber: 1,
          capturedByName: "Chef",
          changeSummary: name,
          snapshot: JSON.stringify({
            name,
            yieldQuantity: 2,
            yieldUnit: "batch",
            lines: [
              {
                ingredientId: ingredient.docId,
                ingredientName: "Butter",
                quantity,
                unit: "gram",
                prepNotes: "legacy",
              },
            ],
          }),
        },
      )) as { docId: string };
    const invalid = await snapshotOf("Invalid target", -1);
    const operationKey = "restore:correctable";
    await expect(
      proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.restoreComponentSnapshot,
        {
          componentId: component.docId,
          snapshotId: invalid.docId,
          operationKey,
        },
      ),
    ).rejects.toThrow(/positive/i);
    const afterFailure = await kitchen.run(async (ctx) => ({
      component: await ctx.db.get(component.docId as never),
      lines: await ctx.db.query("componentIngredients").collect(),
    }));
    expect(afterFailure.component).toMatchObject({ name: "Original" });
    expect(
      afterFailure.lines.filter((line) => line.deletedAt == null),
    ).toMatchObject([
      { quantity: 10, sortOrder: 9, wasteFactor: 1.4, prepNotes: "original" },
    ]);
    const corrected = await snapshotOf("Corrected target", 5);
    await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.restoreComponentSnapshot,
      {
        componentId: component.docId,
        snapshotId: corrected.docId,
        operationKey,
      },
    );
    const restored = (await kitchen.query(
      api.queries.listComponentIngredient,
      {},
    )) as any[];
    expect(
      restored.filter(
        (line) =>
          line.componentId === component.docId && line.deletedAt == null,
      ),
    ).toMatchObject([
      { quantity: 5, sortOrder: 0, wasteFactor: 1, prepNotes: "legacy" },
    ]);
  });

  it("restores the durable snapshot exactly and rejects a snapshot/component mismatch", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "restore-chef",
      role: "kitchen_manager",
      tenantId: "restore-tenant",
    });
    const ingredient = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Oil",
        unit: "liter",
        costPerUnit: 2,
        allergens: [],
      },
    )) as { docId: string };
    const component = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      {
        name: "Current",
        yieldQuantity: 2,
        yieldUnit: "liter",
      },
    )) as { docId: string };
    const other = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      {
        name: "Other",
        yieldQuantity: 1,
        yieldUnit: "liter",
      },
    )) as { docId: string };
    const capturedShape = buildComponentSnapshotData(
      {
        name: "Saved",
        category: "sauce",
        cuisine: "French",
        description: "desc",
        instructions: "mix",
        yieldQuantity: 1,
        yieldUnit: "liter",
        batchMultiplier: 1,
        servesPerYield: 4,
      },
      [
        {
          ingredientId: ingredient.docId,
          quantity: 0.5,
          unit: "liter",
          sortOrder: 7,
          wasteFactor: 1.2,
          prepNotes: "slowly",
        },
      ],
      () => "Oil",
    );
    const snapshot = (await proof.executeCommand(
      kitchen,
      api.mutations.ComponentSnapshot_createViaCapture,
      {
        componentId: component.docId,
        versionNumber: 1,
        capturedByName: "Chef",
        changeSummary: "Exact",
        snapshot: JSON.stringify(capturedShape),
      },
    )) as { docId: string };
    await expect(
      proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.restoreComponentSnapshot,
        {
          componentId: other.docId,
          snapshotId: snapshot.docId,
          operationKey: "restore:mismatch",
        },
      ),
    ).rejects.toThrow(/does not belong/i);
    const result = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.restoreComponentSnapshot,
      {
        componentId: component.docId,
        snapshotId: snapshot.docId,
        operationKey: "component-restore:storage-unavailable",
      },
    )) as any;
    const rows = (await kitchen.query(
      api.queries.listComponentIngredient,
      {},
    )) as any[];
    expect(
      rows.filter(
        (row) => row.componentId === component.docId && row.deletedAt == null,
      ),
    ).toMatchObject([
      {
        quantity: 0.5,
        unit: "liter",
        sortOrder: 7,
        wasteFactor: 1.2,
        prepNotes: "slowly",
      },
    ]);
    expect(
      await proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.restoreComponentSnapshot,
        {
          componentId: component.docId,
          snapshotId: snapshot.docId,
          operationKey: "component-restore:storage-unavailable",
        },
      ),
    ).toEqual({ ...result, recovered: true });
    const newerSnapshot = (await proof.executeCommand(
      kitchen,
      api.mutations.ComponentSnapshot_createViaCapture,
      {
        componentId: component.docId,
        versionNumber: 2,
        capturedByName: "Chef",
        changeSummary: "Different target",
        snapshot: JSON.stringify({ ...capturedShape, name: "Different" }),
      },
    )) as { docId: string };
    expect(
      await proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.restoreComponentSnapshot,
        {
          componentId: component.docId,
          snapshotId: newerSnapshot.docId,
          operationKey: "component-restore:storage-unavailable",
        },
      ),
    ).toEqual({ ...result, recovered: true });
  });

  it("saves and reloads a durable review, finalizes it atomically, and conflicts on reuse", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "durable-review-chef",
      role: "kitchen_manager",
      tenantId: "durable-review-tenant",
    });
    const outsider = proof.asRole({
      subject: "durable-review-outsider",
      role: "kitchen_manager",
      tenantId: "durable-review-other",
    });
    const durableSource = `House Herb Oil

Yield: 2 cups

Ingredients:
2 cups olive oil
1/4 cup parsley, chopped

Instructions:
Warm oil gently and steep herbs.`;
    const existing = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Olive Oil", unit: "cup", costPerUnit: 0.05, allergens: [] },
    )) as { docId: string };
    const catalog = [{ id: existing.docId, name: "Olive Oil", unit: "cup" }];
    const coordinator = new ComponentImportCoordinator();
    const parsed = coordinator.parseText(durableSource, catalog);

    const createRequest = buildCreateReviewRequest(parsed, {
      kind: "pasted_text",
      rawText: durableSource,
    });
    const created = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.createComponentImportReview,
      createRequest as never,
    )) as { importId: string; reviewRevision: number; lineIds: string[] };
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
          { docId: created.lineIds[index] },
        );
      }
    }

    // Save corrections: yield 2 -> 3, first line 2 -> 1.5 with a prep note.
    const baseline = {
      ...parsed,
      importId: created.importId,
      reviewRevision: 0,
      lines: parsed.lines.map((line, index) => ({
        ...line,
        importLineId: created.lineIds[index],
      })),
    };
    const edited = {
      ...baseline,
      yieldQuantity: 3,
      lines: baseline.lines.map((line, index) =>
        index === 0
          ? { ...line, quantity: 1.5, prepNotes: "extra virgin" }
          : line,
      ),
    };
    const saveRequest = buildSaveReviewRequest(baseline, edited, 0);
    expect(saveRequest.lines).toHaveLength(1);
    const saved = await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.saveComponentImportReview,
      saveRequest as never,
    );
    expect(saved).toEqual({ reviewRevision: 1 });

    // Reload: identical source, reviewed values and line decisions.
    const row = (await kitchen.query(api.queries.getComponentImport, {
      id: created.importId as never,
    })) as Record<string, unknown>;
    const lineRows = (await kitchen.query(
      api.queries.listComponentImportLineByImportId,
      { importId: created.importId as never },
    )) as Record<string, unknown>[];
    const reloaded = mapStoredReview(row as never, lineRows as never);
    expect(reloaded.yieldQuantity).toBe(3);
    expect(reloaded.reviewRevision).toBe(1);
    expect(reloaded.lines[0]).toMatchObject({
      quantity: 1.5,
      prepNotes: "extra virgin",
      matchStatus: "confirmed_existing",
      matchedIngredientId: existing.docId,
      raw: "2 cups olive oil",
    });
    expect(reloaded.lines[1]).toMatchObject({
      matchStatus: "confirmed_new",
      createNew: true,
      raw: "1/4 cup parsley, chopped",
    });
    expect(row.rawSourceText).toBe(durableSource);

    // A stale expected revision conflicts and writes nothing.
    await expect(
      proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.saveComponentImportReview,
        saveRequest as never,
      ),
    ).rejects.toThrow(/stale review revision/);
    expect(
      await kitchen.query(api.queries.getComponentImport, {
        id: created.importId as never,
      }),
    ).toMatchObject({ reviewRevision: 1, parsedYieldQuantity: 3 });

    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_recordResolutionProgress,
      { docId: created.importId, resolvedLineCount: 2 },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_approveReview,
      {
        docId: created.importId,
      },
    );

    // The finalizer builds the review-aware atomic request; capture it.
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
    await finalizer.finalize(reloaded, "durable-review:finalize");
    expect((captured as { review?: unknown }).review).toEqual({
      importId: created.importId,
      expectedRevision: 1,
    });

    // A foreign tenant cannot finalize this import, and nothing is written.
    await expect(
      proof.executeCommand(
        outsider,
        (api.lib as any).culinaryOperations.importComponent,
        captured as never,
      ),
    ).rejects.toThrow(/not found/i);
    expect(await kitchen.query(api.queries.listComponent, {})).toEqual([]);

    // Atomic finalize: one Component, one BOM, completed import, source kept.
    const finalized = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.importComponent,
      captured as never,
    )) as {
      componentId: string;
      createdIngredientIds: string[];
      lineIds: string[];
      recovered: boolean;
    };
    const components = (await kitchen.query(
      api.queries.listComponent,
      {},
    )) as Record<string, unknown>[];
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({
      name: "House Herb Oil",
      yieldQuantity: 3,
      yieldUnit: "cup",
      tenantId: "durable-review-tenant",
    });
    const bom = (await kitchen.query(
      api.queries.listComponentIngredient,
      {},
    )) as Record<string, unknown>[];
    expect(
      bom.filter((line) => line.componentId === finalized.componentId),
    ).toHaveLength(2);
    expect(finalized.createdIngredientIds).toHaveLength(1);
    expect(
      await kitchen.query(api.queries.getComponentImport, {
        id: created.importId as never,
      }),
    ).toMatchObject({
      status: "completed",
      resultingComponentId: finalized.componentId,
      rawSourceText: durableSource,
    });
    const attached = (await kitchen.query(
      api.queries.listComponentImportLineByImportId,
      { importId: created.importId as never },
    )) as Record<string, unknown>[];
    expect(
      (
        attached.find((line) => line.matchStatus === "confirmed_new") as {
          matchedIngredientId?: string;
        }
      ).matchedIngredientId,
    ).toBeTruthy();

    // Identical replay after a lost acknowledgement returns the same receipt.
    const replay = await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.importComponent,
      captured as never,
    );
    expect(replay).toEqual({ ...finalized, recovered: true });
    expect(await kitchen.query(api.queries.listComponent, {})).toHaveLength(1);

    // Same operation key with a changed request conflicts, not false success.
    const changed = {
      ...(captured as { projection: Record<string, unknown> }),
      projection: {
        ...(captured as { projection: Record<string, unknown> }).projection,
        name: "Different reviewed component",
      },
    };
    await expect(
      proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.importComponent,
        changed as never,
      ),
    ).rejects.toThrow(/already used with a different request/);
    expect(await kitchen.query(api.queries.listComponent, {})).toHaveLength(1);

    // Injected failure before completion leaves no partial business graph,
    // and the import stays ready so the correction can be retried.
    const brokenParsed = coordinator.parseText(durableSource, catalog);
    const brokenCreate = buildCreateReviewRequest(brokenParsed, {
      kind: "pasted_text",
      rawText: durableSource,
    });
    const broken = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.createComponentImportReview,
      {
        ...brokenCreate,
        lines: brokenCreate.lines.map((line, index) =>
          index === 1 ? { ...line, parsedQuantity: -1 } : line,
        ),
      },
    )) as { importId: string; lineIds: string[] };
    for (let index = 0; index < brokenParsed.lines.length; index++) {
      const line = brokenParsed.lines[index];
      if (line.matchedIngredientId) {
        await proof.executeCommand(
          kitchen,
          api.mutations.ComponentImportLine_suggestExactMatch,
          {
            docId: broken.lineIds[index],
            matchedIngredientId: line.matchedIngredientId,
          },
        );
        await proof.executeCommand(
          kitchen,
          api.mutations.ComponentImportLine_confirmExisting,
          {
            docId: broken.lineIds[index],
            matchedIngredientId: line.matchedIngredientId,
          },
        );
      } else {
        await proof.executeCommand(
          kitchen,
          api.mutations.ComponentImportLine_confirmNew,
          { docId: broken.lineIds[index] },
        );
      }
    }
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_recordResolutionProgress,
      { docId: broken.importId, resolvedLineCount: 2 },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_approveReview,
      {
        docId: broken.importId,
      },
    );
    const ingredientsBefore = (
      (await kitchen.query(api.queries.listIngredient, {})) as unknown[]
    ).length;
    const brokenProjection = {
      name: "House Herb Oil",
      yieldQuantity: 2,
      yieldUnit: "cup",
      lines: [
        {
          name: brokenParsed.lines[0].name.trim(),
          ingredientId: existing.docId,
          quantity: 2,
          unit: "cup",
          sortOrder: 1,
        },
        {
          name: brokenParsed.lines[1].name.trim(),
          createNew: true,
          quantity: -1,
          unit: "cup",
          sortOrder: 2,
        },
      ],
    };
    await expect(
      proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.importComponent,
        {
          operationKey: "durable-review:broken",
          projection: brokenProjection,
          review: { importId: broken.importId, expectedRevision: 0 },
        },
      ),
    ).rejects.toThrow(/positive/i);
    expect(await kitchen.query(api.queries.listComponent, {})).toHaveLength(1);
    expect(
      (await kitchen.query(api.queries.listIngredient, {})) as unknown[],
    ).toHaveLength(ingredientsBefore);
    expect(
      await kitchen.query(api.queries.getComponentImport, {
        id: broken.importId as never,
      }),
    ).toMatchObject({ status: "ready" });

    // Recovery: correct the stored measurement, re-approve, finalize once.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_resumeReview,
      {
        docId: broken.importId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_reviseMeasurements,
      {
        docId: broken.lineIds[1],
        expectedReviewRevision: 0,
        parsedQuantity: 0.5,
        parsedUnit: "cup",
        // Unchanged fields restate their stored values: generated revise
        // commands wipe omitted optionals.
        parsedIngredientName: brokenParsed.lines[1].name.trim(),
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_approveReview,
      {
        docId: broken.importId,
      },
    );
    const recovered = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.importComponent,
      {
        operationKey: "durable-review:broken",
        projection: {
          ...brokenProjection,
          lines: brokenProjection.lines.map((line) =>
            line.createNew ? { ...line, quantity: 0.5 } : line,
          ),
        },
        review: { importId: broken.importId, expectedRevision: 0 },
      },
    )) as { componentId: string };
    expect(recovered.componentId).not.toBe(finalized.componentId);
    expect(await kitchen.query(api.queries.listComponent, {})).toHaveLength(2);
    expect(
      await kitchen.query(api.queries.getComponentImport, {
        id: broken.importId as never,
      }),
    ).toMatchObject({
      status: "completed",
      resultingComponentId: recovered.componentId,
    });
  });

  it("persists workbench match decisions, name corrections and removed lines through the durable save", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "decision-chef",
      role: "kitchen_manager",
      tenantId: "decision-tenant",
    });
    const coordinator = new ComponentImportCoordinator();
    const olive = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Olive Oil", unit: "cup", costPerUnit: 0.05, allergens: [] },
    )) as { docId: string };
    const parsley = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Parsley", unit: "cup", costPerUnit: 0.1, allergens: [] },
    )) as { docId: string };
    const catalog = [
      { id: olive.docId, name: "Olive Oil", unit: "cup" },
      { id: parsley.docId, name: "Parsley", unit: "cup" },
    ];
    const source = `House Herb Oil

Yield: 2 cups

Ingredients:
2 cups olive oil
1 tsp mystery spice
1/4 cup parsley, chopped`;
    const parsed = coordinator.parseText(source, catalog);
    expect(parsed.lines).toHaveLength(3);
    const created = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.createComponentImportReview,
      buildCreateReviewRequest(parsed, {
        kind: "pasted_text",
        rawText: source,
      }) as never,
    )) as { importId: string; reviewRevision: number; lineIds: string[] };

    // The create itself stores the workbench match confidence — no manual
    // per-line commands are needed for the initial decisions.
    const rowAfterCreate = (await kitchen.query(
      api.queries.getComponentImport,
      { id: created.importId as never },
    )) as Record<string, unknown>;
    const linesAfterCreate = (
      (await kitchen.query(api.queries.listComponentImportLineByImportId, {
        importId: created.importId as never,
      })) as Record<string, unknown>[]
    ).sort((a, b) => Number(a.sourceOrder) - Number(b.sourceOrder));
    expect(linesAfterCreate).toMatchObject([
      { matchStatus: "exact", matchedIngredientId: olive.docId },
      { matchStatus: "new" },
      { matchStatus: "exact", matchedIngredientId: parsley.docId },
    ]);
    const reloaded = mapStoredReview(
      rowAfterCreate as never,
      linesAfterCreate as never,
    );

    // Workbench edits: confirm the exact match, rename + confirm the new
    // ingredient, remove the parsley line, correct the yield.
    const edited = {
      ...reloaded,
      yieldQuantity: 5,
      lines: [
        {
          ...reloaded.lines[0],
          matchStatus: "confirmed_existing" as const,
          createNew: false,
        },
        {
          ...reloaded.lines[1],
          name: "Smoked paprika",
          matchStatus: "confirmed_new" as const,
          createNew: true,
          matchedIngredientId: undefined,
        },
      ],
    };
    const saveRequest = buildSaveReviewRequest(
      reloaded,
      edited,
      created.reviewRevision,
    );
    expect(saveRequest.discardedLines).toEqual([
      { lineId: created.lineIds[2], reason: "Removed during review" },
    ]);
    expect(saveRequest.lines).toHaveLength(2);
    const saved = await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.saveComponentImportReview,
      saveRequest as never,
    );
    expect(saved).toEqual({ reviewRevision: 1 });

    const row = (await kitchen.query(api.queries.getComponentImport, {
      id: created.importId as never,
    })) as Record<string, unknown>;
    const lineRows = (
      (await kitchen.query(api.queries.listComponentImportLineByImportId, {
        importId: created.importId as never,
      })) as Record<string, unknown>[]
    ).sort((a, b) => Number(a.sourceOrder) - Number(b.sourceOrder));
    expect(row).toMatchObject({ parsedYieldQuantity: 5, reviewRevision: 1 });
    // The discarded line is gone from the live list; its source text survives
    // verbatim on the import — a rename never rewrites the source. The save
    // itself recomputed the resolution ledger: both remaining decisions plus
    // the discard are counted outcomes.
    expect(lineRows).toHaveLength(2);
    expect(lineRows[0]).toMatchObject({
      matchStatus: "confirmed_existing",
      matchedIngredientId: olive.docId,
    });
    expect(lineRows[1]).toMatchObject({
      matchStatus: "confirmed_new",
      parsedIngredientName: "Smoked paprika",
    });
    expect(row).toMatchObject({
      resolvedLineCount: 3,
      parsedLineCount: 3,
    });
    expect(row.rawSourceText).toBe(source);

    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_approveReview,
      { docId: created.importId },
    );
    const finalized = (await proof.executeCommand(
      kitchen,
      (api.lib as any).culinaryOperations.importComponent,
      {
        operationKey: "decision-review:finalize",
        projection: {
          name: "House Herb Oil",
          yieldQuantity: 5,
          yieldUnit: "cup",
          lines: [
            {
              name: "olive oil",
              ingredientId: olive.docId,
              quantity: 2,
              unit: "cup",
              sortOrder: 1,
            },
            {
              name: "Smoked paprika",
              createNew: true,
              quantity: 1,
              unit: "teaspoon",
              sortOrder: 2,
            },
          ],
        },
        review: { importId: created.importId, expectedRevision: 1 },
      },
    )) as { componentId: string; createdIngredientIds: string[] };
    expect(finalized.createdIngredientIds).toHaveLength(1);
    const bom = (await kitchen.query(
      api.queries.listComponentIngredient,
      {},
    )) as Record<string, unknown>[];
    expect(
      bom.filter((line) => line.componentId === finalized.componentId),
    ).toHaveLength(2);
    const introduced = (
      (await kitchen.query(api.queries.listIngredient, {})) as Record<
        string,
        unknown
      >[]
    ).find((item) => item._id === finalized.createdIngredientIds[0]);
    expect(introduced).toMatchObject({ name: "Smoked paprika" });
    expect(row.rawSourceText).toBe(source);
  });
});
