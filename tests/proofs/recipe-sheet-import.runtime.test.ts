/**
 * PL-RECIPE-SHEET part 2: the owner's one-file recipe sheet imports through
 * the normal recipe review, and the save step stores what the review does not
 * hold — times, the allergen marks, the equipment list, the numbered steps and
 * packaging per service style — on the new recipe in the same transaction.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { ComponentImportCoordinator } from "../../src/features/kitchen/import/ComponentImportCoordinator";
import { ComponentImportFinalizer } from "../../src/features/kitchen/import/ComponentImportFinalizer";
import { recipeSheetSave } from "../../src/features/kitchen/import/RecipeSheetParser";

const sheet = readFileSync(
  join(__dirname, "../fixtures/recipe-sheet/pomodoro-sauce.csv"),
  "utf8",
);

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: recipe sheet import", () => {
  it("saves the owner's Pomodoro Sauce sheet with times, allergens, equipment, steps and packaging", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const tenantId = "sheet-tenant";
    const admin = proof.asRole({
      subject: "sheet-admin",
      role: "admin",
      tenantId,
    });
    const kitchen = proof.asRole({
      subject: "sheet-chef",
      role: "kitchen_manager",
      tenantId,
    });
    const styles: Record<string, string> = {};
    for (const [name, code, sortOrder] of [
      ["Drop Off", "DROP", 1],
      ["Buffet – Bring Hot", "BRING_HOT_BUFFET", 2],
      ["Cook Onsite", "COOK_ONSITE", 3],
    ] as const) {
      const created = (await proof.executeCommand(
        admin,
        api.mutations.ServiceStyle_createViaRegister,
        { name, code, sortOrder },
      )) as { docId: string };
      styles[name] = created.docId;
    }
    const salt = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      { name: "Salt", unit: "cup", costPerUnit: 1, allergens: [] },
    )) as { docId: string };

    const styleRows = (await kitchen.query(
      api.queries.listServiceStyle,
      {},
    )) as never;
    const review = new ComponentImportCoordinator().parseTextFile(
      sheet,
      "recipe_sheet.csv",
      [{ id: salt.docId, name: "Salt", unit: "cup" }],
    );
    // A cook confirms every other line as a new ingredient in the review.
    const coordinator = new ComponentImportCoordinator();
    let ready = review;
    ready.lines.forEach((line, index) => {
      if (line.matchStatus !== "exact")
        ready = coordinator.confirmNewLine(ready, index);
    });
    const save = recipeSheetSave(sheet, styleRows);
    expect(save?.notes.join(" ")).toContain(
      "Packaging for Drop Off, Buffet – Bring Hot, Cook Onsite.",
    );

    const finalizer = new ComponentImportFinalizer({
      importComponent: async (input) =>
        (await proof.executeCommand(
          kitchen,
          (api.lib as any).culinaryOperations.importComponent,
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
    });
    const result = await finalizer.finalize(
      ready,
      "sheet:pomodoro",
      save?.sheet,
    );

    const recipe = (await kitchen.query(api.queries.getComponent, {
      id: result.componentId as never,
    })) as any;
    expect(recipe).toMatchObject({
      name: "Pomodoro Sauce",
      yieldQuantity: 10,
      yieldUnit: "gallon",
      activePrepMinutes: 20,
      passiveCookMinutes: 60,
      declaredAllergens: ["wheat"],
    });
    expect(result.lineIds).toHaveLength(10);

    const equipment = (
      (await kitchen.query(api.queries.listComponentEquipment, {})) as any[]
    )
      .filter((row) => row.componentId === result.componentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => row.name);
    expect(equipment).toEqual([
      "Tilt Skillet",
      "Immersion Blender",
      "200 Pans",
      "Tilt Skillet Spatula",
      "Measuring Cups",
    ]);

    const steps = (
      (await kitchen.query(api.queries.listComponentStep, {})) as any[]
    )
      .filter((row) => row.componentId === result.componentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(steps).toHaveLength(9);
    expect(steps[8].instruction).toBe(
      "REMOVE SAUCE FROM TILT SKILLET INTO 200 PANS TO COOL COMPLETELY",
    );

    const packaging = (
      (await kitchen.query(api.queries.listStylePackaging, {})) as any[]
    ).filter((row) => row.componentId === result.componentId);
    expect(packaging.map((row) => row.serviceStyleId).sort()).toEqual(
      Object.values(styles).sort(),
    );
    expect(packaging[0].instructions).toMatch(/BAIN MARIE CATER WRAP/);

    // A lost acknowledgement replays to the same recipe, adding nothing twice.
    const again = await finalizer.finalize(
      ready,
      "sheet:pomodoro",
      save?.sheet,
    );
    expect(again.componentId).toBe(result.componentId);
    expect(
      ((await kitchen.query(api.queries.listComponentEquipment, {})) as any[])
        .length,
    ).toBe(5);
  });

  it("refuses packaging for a service style another company owns", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const other = proof.asRole({
      subject: "o",
      role: "admin",
      tenantId: "other",
    });
    const kitchen = proof.asRole({
      subject: "k",
      role: "kitchen_manager",
      tenantId: "mine",
    });
    const foreign = (await proof.executeCommand(
      other,
      api.mutations.ServiceStyle_createViaRegister,
      { name: "Drop Off", code: "DROP" },
    )) as { docId: string };
    await expect(
      proof.executeCommand(
        kitchen,
        (api.lib as any).culinaryOperations.importComponent,
        {
          operationKey: "sheet:foreign",
          projection: {
            name: "Sauce",
            yieldQuantity: 1,
            yieldUnit: "gallon",
            lines: [
              {
                name: "Salt",
                createNew: true,
                quantity: 1,
                unit: "cup",
                sortOrder: 1,
              },
            ],
            sheet: {
              packaging: [
                { serviceStyleId: foreign.docId, instructions: "Pack it" },
              ],
            },
          },
        },
      ),
    ).rejects.toThrow(/service style this company does not have/);
    expect(await kitchen.query(api.queries.listComponent, {})).toEqual([]);
  });
});
