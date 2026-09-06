/**
 * AC-042 — honest measurements for the flat-formula import portion of
 * PR03-01/03/08 (specs/ralph/production-03-recipe-truth.md).
 *
 * Why these tests exist: the parser used to finish incomplete sources by
 * guessing — missing yield became "1 portion", an unrecognized unit became
 * "each", and a unit-less line became quantity 1. A kitchen user then saw a
 * finished formula that the source never stated. These tests pin the honest
 * contract instead: gaps stay visible correction issues, raw source text is
 * retained through correction, mixed fractions keep their meaning, and the
 * finalizer writes only after every measured field is supplied. Saving an
 * incomplete review stays possible; only finalization requires correction.
 */
import { describe, expect, it } from "vitest";
import { ComponentImportCoordinator } from "../src/features/kitchen/import/ComponentImportCoordinator";
import { ComponentImportFinalizer } from "../src/features/kitchen/import/ComponentImportFinalizer";
import {
  reviewMeasurementIssues,
  reviewIsReady,
  type ComponentImportReviewState,
} from "../src/features/kitchen/import/ComponentImportTypes";

const COORDINATOR = new ComponentImportCoordinator();

/** Source with no yield line and several unmeasured lines. */
const GAPPY_SOURCE = `Relish

Yield: 6 trays

Ingredients:
1 medium onion, chopped
2 fl oz lemon juice
case tomatoes
salt to taste
`;

const COMPLETE_SOURCE = `House Herb Oil

Yield: 6 portions

Ingredients:
2 cups olive oil
1/4 cup parsley, chopped
1 1/2 tsp kosher salt
`;

function confirmAllAsNew(
  review: ComponentImportReviewState,
): ComponentImportReviewState {
  return {
    ...review,
    lines: review.lines.map((line) =>
      line.matchStatus === "exact"
        ? line
        : { ...line, matchStatus: "confirmed_new" as const, createNew: true },
    ),
  };
}

describe("review measurement issues (paste source)", () => {
  it("reports missing yield and unrecognized units as field-specific issues, not defaults", () => {
    const review = COORDINATOR.parseText(GAPPY_SOURCE, []);
    expect(review.yieldQuantity).toBe(6);
    expect(review.yieldUnit).toBeNull();

    const issues = reviewMeasurementIssues(review);
    expect(issues).toContainEqual(
      expect.objectContaining({
        lineIndex: null,
        field: "yieldUnit",
      }),
    );
    // "medium" was consumed as the unit token but has no unit meaning.
    expect(issues).toContainEqual(
      expect.objectContaining({ lineIndex: 0, field: "unit" }),
    );
    // "fl oz", "case", "salt to taste" — no recognized unit at all.
    const unitIssues = issues.filter((issue) => issue.field === "unit");
    expect(unitIssues).toHaveLength(4);
    const quantityIssues = issues.filter((issue) => issue.field === "quantity");
    expect(quantityIssues).toHaveLength(2);
    expect(issues.every((issue) => issue.message.length > 0)).toBe(true);
    const mediumIssue = unitIssues.find((issue) => issue.lineIndex === 0) as {
      message: string;
    };
    expect(mediumIssue.message).toContain("medium");
  });

  it("keeps the raw source readable on every line while measurements are incomplete", () => {
    const review = COORDINATOR.parseText(GAPPY_SOURCE, []);
    expect(review.lines.map((line) => line.raw)).toEqual([
      "1 medium onion, chopped",
      "2 fl oz lemon juice",
      "case tomatoes",
      "salt to taste",
    ]);
    expect(review.lines[0].unitRaw).toBe("medium");
  });

  it("keeps mixed fractions and valid existing imports meaningful with zero issues", () => {
    const review = COORDINATOR.parseText(COMPLETE_SOURCE, []);
    expect(review.yieldQuantity).toBe(6);
    expect(review.yieldUnit).toBe("portion");
    expect(reviewMeasurementIssues(review)).toEqual([]);
    expect(review.lines[0]).toMatchObject({ quantity: 2, unit: "cup" });
    expect(review.lines[1].quantity).toBeCloseTo(0.25);
    expect(review.lines[2].quantity).toBeCloseTo(1.5);
    expect(reviewIsReady(confirmAllAsNew(review))).toBe(true);
  });

  it("reports a missing yield with both yield fields flagged", () => {
    const review = COORDINATOR.parseText(
      "Sauce\n\nIngredients:\n2 kg flour\n",
      [],
    );
    const issues = reviewMeasurementIssues(review);
    expect(issues).toContainEqual(
      expect.objectContaining({ field: "yieldQuantity", lineIndex: null }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ field: "yieldUnit", lineIndex: null }),
    );
    expect(reviewIsReady(confirmAllAsNew(review))).toBe(false);
  });
});

describe("review measurement issues (CSV bundle source)", () => {
  const GAPPY_SHEET = [
    "component_name,description,category,cuisine,yield_quantity,yield_unit,batch_multiplier,instructions",
    "Relish,,,,,trays,,",
  ].join("\n");
  const LINES = [
    "component_name,source_order,source_line,quantity,unit,ingredient_name,preparation_note",
    "Relish,1,1 medium onion,,,,",
    "Relish,2,2 cups water,,,,",
  ].join("\n");

  it("flags CSV yield gaps while structural errors stay separate", () => {
    const review = COORDINATOR.parseCsvBundle(
      GAPPY_SHEET,
      LINES,
      [],
      "relish_sheet.csv",
      "relish_lines.csv",
    );
    expect(review.errors).toEqual([]);
    expect(review.yieldQuantity).toBeNull();
    expect(review.yieldUnit).toBeNull();
    expect(review.sourceFilename).toBe("relish_sheet.csv + relish_lines.csv");

    const issues = reviewMeasurementIssues(review);
    expect(issues).toContainEqual(
      expect.objectContaining({ field: "yieldQuantity" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ field: "yieldUnit" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ lineIndex: 0, field: "unit" }),
    );
    // The CSV line source text is retained for review.
    expect(review.lines[0].raw).toBe("1 medium onion");
    expect(review.lines[1].raw).toBe("2 cups water");
    expect(review.lines[1].unit).toBe("cup");
  });

  it("still surfaces structural CSV errors as review errors", () => {
    const review = COORDINATOR.parseCsvBundle("a,b\n", "x,y\n", []);
    expect(review.errors.length).toBeGreaterThan(0);
    expect(review.errors[0]).toContain("row 1");
  });
});

describe("finalization readiness", () => {
  it("refuses to finalize incomplete measurements before any write", async () => {
    const calls: string[] = [];
    const finalizer = new ComponentImportFinalizer({
      createIngredient: async (input) => {
        calls.push(`ingredient:${input.name}`);
        return { docId: "i" };
      },
      createComponent: async (input) => {
        calls.push(`component:${input.name}`);
        return { docId: "c" };
      },
      createComponentIngredient: async () => {
        calls.push("line");
        return { docId: "l" };
      },
    });
    const review = COORDINATOR.parseText(GAPPY_SOURCE, []);
    const confirmed = confirmAllAsNew(review);

    await expect(finalizer.finalize(confirmed)).rejects.toThrow(
      /yield unit is required/i,
    );
    expect(calls).toEqual([]);
  });

  it("finalizes after corrections and preserves the original source text", async () => {
    const projectionCalls: Array<Record<string, unknown>> = [];
    const finalizer = new ComponentImportFinalizer({
      importComponent: async ({ projection }) => {
        projectionCalls.push(projection);
        return {
          componentId: "component-relish",
          createdIngredientIds: [],
          lineIds: [],
        };
      },
      createIngredient: async () => ({ docId: "unused" }),
      createComponent: async () => ({ docId: "unused" }),
      createComponentIngredient: async () => ({ docId: "unused" }),
    });

    const review = COORDINATOR.parseText(GAPPY_SOURCE, []);
    const confirmed = confirmAllAsNew(review);
    expect(reviewIsReady(confirmed)).toBe(false);

    // Reviewer corrections: supply the yield the source implied in words,
    // fix the line units and the two amount-less lines.
    let corrected = COORDINATOR.setYieldUnit(confirmed, "portion");
    corrected = {
      ...corrected,
      lines: corrected.lines.map((line, index) => ({
        ...line,
        unit: line.unit ?? ("each" as const),
        quantity: line.quantity ?? (index === 2 ? 1 : 0.5),
      })),
    };
    expect(reviewMeasurementIssues(corrected)).toEqual([]);
    expect(reviewIsReady(corrected)).toBe(true);

    const result = await finalizer.finalize(corrected, "operation-key");
    expect(result.componentId).toBe("component-relish");
    expect(projectionCalls).toHaveLength(1);
    const projection = projectionCalls[0] as {
      yieldQuantity: number;
      yieldUnit: string;
      lines: Array<{
        name: string;
        quantity: number;
        unit: string;
      }>;
    };
    expect(projection.yieldQuantity).toBe(6);
    expect(projection.yieldUnit).toBe("portion");
    expect(projection.lines).toHaveLength(4);
    expect(projection.lines[0]).toMatchObject({
      name: "Onion",
      quantity: 1,
      unit: "each",
    });

    // Corrections never rewrite the source lines themselves.
    expect(corrected.lines.map((line) => line.raw)).toEqual([
      "1 medium onion, chopped",
      "2 fl oz lemon juice",
      "case tomatoes",
      "salt to taste",
    ]);
    expect(corrected.lines[0].unitRaw).toBe("medium");
  });
});
