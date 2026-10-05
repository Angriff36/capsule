/**
 * AC-067 runtime proof: finalizing a second import of an identical source
 * fingerprint links (or conflicts) instead of creating a second component.
 *
 * Cases: identical source re-import links; an identical formula scaled to a
 * different batch links without touching the original serving basis; the same
 * source text finished differently conflicts with a plain message; a same-name
 * different-formula recipe stays a separate, distinguishable book entry.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { ComponentImportCoordinator } from "../../src/features/kitchen/import/ComponentImportCoordinator";
import { ComponentImportFinalizer } from "../../src/features/kitchen/import/ComponentImportFinalizer";
import { ComponentImportRepository } from "../../src/features/kitchen/import/ComponentImportRepository";
import type { ComponentImportReviewState } from "../../src/features/kitchen/import/ComponentImportTypes";
import { modules } from "./convex-test-modules";

const SOURCE = `House Herb Oil

Yield: 2 cups

Ingredients:
2 cups olive oil
1/4 cup parsley, chopped
2 tsp kosher salt

Instructions:
Warm oil gently and steep herbs.`;

const SCALED = `House Herb Oil

Yield: 4 cups

Ingredients:
4 cups olive oil
1/2 cup parsley, chopped
4 tsp kosher salt

Instructions:
Warm oil gently and steep herbs.`;

const BUTTER_VARIANT = `House Herb Oil

Yield: 2 cups

Ingredients:
2 cups olive oil
1/4 cup parsley, chopped
2 tsp kosher salt
2 tbsp butter

Instructions:
Warm oil gently, steep herbs, finish with butter.`;

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

describe("runtime proof: component import duplicate fingerprint", () => {
  it("links identical and scaled re-imports, conflicts on a different reading, and keeps a distinct same-name formula", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "duplicate-import-chef",
      role: "kitchen_manager",
      tenantId: "tenant-duplicate-import",
    });
    const operations = (api.lib as any).culinaryOperations;
    const salt = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Kosher Salt",
        unit: "teaspoon",
        costPerUnit: 0.01,
        allergens: [],
      },
    )) as { docId: string };
    const catalog = [{ id: salt.docId, name: "Kosher Salt", unit: "teaspoon" }];

    /** One full durable review for a source text, finalized for real. */
    async function importOnce(
      rawText: string,
      operationKey: string,
      edit?: (state: ComponentImportReviewState) => ComponentImportReviewState,
    ): Promise<{ importId: string; componentId: string }> {
      const coordinator = new ComponentImportCoordinator();
      const parsed = coordinator.parseText(rawText, catalog);
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
        rawText,
      });
      for (let index = 0; index < created.lineIds.length; index++) {
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
      const settled = await repository.load(created.importId);
      const approved = edit ? edit(settled) : settled;
      await repository.save(approved, settled.reviewRevision ?? 0);
      // Finalize against the saved revision, the way the workbench reloads.
      const saved = await repository.load(created.importId);
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
      await finalizer.finalize(saved, operationKey);
      const result = (await proof.executeCommand(
        kitchen,
        operations.importComponent,
        captured as never,
      )) as { componentId: string };
      return { importId: created.importId, componentId: result.componentId };
    }

    const importRow = (importId: string) =>
      kitchen.query(api.queries.getComponentImport, {
        id: importId as never,
      }) as Promise<Record<string, unknown>>;
    const book = async () =>
      (await kitchen.query(api.queries.listComponent, {})) as Record<
        string,
        unknown
      >[];

    // 1. First import creates the recipe.
    await importOnce(SOURCE, "dup:identical-1");
    let components = await book();
    expect(components).toHaveLength(1);
    const original = components[0];
    expect(original.recipeIdentityFingerprint).toMatch(/^rid-/);
    expect(original.recipeSourceFingerprint).toBeTruthy();

    // 2. The same source text again: linked, no second component.
    const second = await importOnce(SOURCE, "dup:identical-2");
    expect(second.componentId).toBe(String(original._id));
    expect(await book()).toHaveLength(1);
    expect(await importRow(second.importId)).toMatchObject({
      status: "completed",
      resultingComponentId: String(original._id),
      duplicateOutcome: "identical_source",
      duplicateOfComponentId: String(original._id),
    });

    // 3. The same formula scaled 2x: still linked, and the book recipe keeps
    // its original serving basis (yield untouched).
    const scaled = await importOnce(SCALED, "dup:scaled");
    expect(scaled.componentId).toBe(String(original._id));
    components = await book();
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ yieldQuantity: 2, yieldUnit: "cup" });
    expect(await importRow(scaled.importId)).toMatchObject({
      status: "completed",
      duplicateOutcome: "scaled_copy",
    });

    // 4. The same source text finished differently: conflict with a plain
    // message, and nothing new in the book.
    await expect(
      importOnce(SOURCE, "dup:conflict", (state) => ({
        ...state,
        lines: state.lines.map((line, index) =>
          index === 0 ? { ...line, quantity: 1 } : line,
        ),
      })),
    ).rejects.toThrow(/already in the recipe book/);
    expect(await book()).toHaveLength(1);

    // 5. Same name, different formula: a second, distinguishable book entry
    // with the pairing recorded for a person to resolve.
    const variant = await importOnce(BUTTER_VARIANT, "dup:variant");
    expect(variant.componentId).not.toBe(String(original._id));
    components = await book();
    expect(components).toHaveLength(2);
    expect(
      components.filter((row) => row.name === "House Herb Oil"),
    ).toHaveLength(2);
    expect(await importRow(variant.importId)).toMatchObject({
      status: "completed",
      resultingComponentId: variant.componentId,
      duplicateOutcome: "same_name_other_formula",
      duplicateOfComponentId: String(original._id),
    });
  });
});
