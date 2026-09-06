import { describe, expect, it } from "vitest";
import {
  componentImportOutcome,
  componentRestoreOutcome,
  menuCloneOutcome,
} from "../src/features/kitchen/culinaryRecovery";
import { ComponentImportFinalizer } from "../src/features/kitchen/import/ComponentImportFinalizer";

describe("culinary recovery presentation", () => {
  it("does not present a recovered prior menu as the newly named clone", () => {
    expect(
      menuCloneOutcome({
        menuId: "old-menu",
        menuName: "Earlier",
        lineCount: 2,
        recovered: true,
      }),
    ).toEqual({
      navigateToId: null,
      recoveredId: "old-menu",
      notice:
        "Recovered the previously saved menu “Earlier” with 2 dishes. No new menu was created; choose the action again to create another.",
    });
  });

  it("does not present a recovered prior import as the newly reviewed component", () => {
    expect(
      componentImportOutcome({
        componentId: "old-component",
        lineIds: ["a"],
        recovered: true,
      }),
    ).toEqual({
      navigateToId: null,
      recoveredId: "old-component",
      notice:
        "Recovered a previously saved component import with 1 ingredient line. The current review is still here; open the saved component or choose Save component again to import this review.",
    });
  });

  it("does not present a recovered prior snapshot as restoring the newly selected snapshot", () => {
    expect(
      componentRestoreOutcome({
        componentId: "component",
        snapshotId: "old-snapshot",
        lineCount: 3,
        recovered: true,
      }),
    ).toEqual({
      completed: false,
      notice:
        "Recovered the previous restore from snapshot old-snapshot with 3 ingredient lines. The newly selected snapshot was not applied; choose Restore again to apply it.",
    });
  });

  it("preserves recovered and actual saved identity through the finalizer adapter", async () => {
    const expected = {
      componentId: "actual-prior",
      createdIngredientIds: ["i"],
      lineIds: ["l"],
      recovered: true,
    };
    const finalizer = new ComponentImportFinalizer({
      importComponent: async () => expected,
      createIngredient: async () => ({ docId: "unused" }),
      createComponent: async () => ({ docId: "unused" }),
      createComponentIngredient: async () => ({ docId: "unused" }),
    });
    const result = await finalizer.finalize(
      {
        sourceKind: "pasted_text",
        name: "Changed request",
        yieldQuantity: 1,
        yieldUnit: "batch",
        batchMultiplier: 1,
        warnings: [],
        errors: [],
        lines: [
          {
            raw: "1 g salt",
            name: "Salt",
            quantity: 1,
            unit: "gram",
            unitRaw: "g",
            matchStatus: "confirmed_new",
            createNew: true,
            possibleMatchIds: [],
            possibleMatchNames: [],
          },
        ],
      },
      "component-import:storage-unavailable",
    );
    expect(result).toEqual(expected);
  });
});
