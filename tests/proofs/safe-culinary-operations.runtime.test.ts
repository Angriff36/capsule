import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { buildComponentSnapshotData } from "../../src/features/kitchen/componentSnapshot";

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
});
