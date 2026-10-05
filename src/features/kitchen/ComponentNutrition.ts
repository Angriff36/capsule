import { convertComponentQuantity } from "./ComponentCostCalculator";
import type { UnitOfMeasure } from "./import/UnitOfMeasureMapper";

// Per-unit nutrition lives on the Ingredient (generated Convex fields). Energy in
// kcal, macros + fiber + sugar in grams, sodium/calcium/iron in milligrams.
export interface IngredientNutritionFields {
  caloriesPerUnit?: number | null;
  proteinGramsPerUnit?: number | null;
  carbsGramsPerUnit?: number | null;
  fatGramsPerUnit?: number | null;
  fiberGramsPerUnit?: number | null;
  sugarGramsPerUnit?: number | null;
  sodiumMgPerUnit?: number | null;
  calciumMgPerUnit?: number | null;
  ironMgPerUnit?: number | null;
}

export type NutrientKey =
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "sugar"
  | "sodium"
  | "calcium"
  | "iron";

export interface NutrientDescriptor {
  key: NutrientKey;
  label: string;
  unit: "kcal" | "g" | "mg";
  field: keyof IngredientNutritionFields;
  precision: number;
}

// Single source of truth for the nutrient set — the editor, panels, and
// aggregation all iterate this array, so adding a nutrient is one line + one
// manifest field.
export const NUTRIENTS: readonly NutrientDescriptor[] = [
  {
    key: "calories",
    label: "Calories",
    unit: "kcal",
    field: "caloriesPerUnit",
    precision: 0,
  },
  {
    key: "protein",
    label: "Protein",
    unit: "g",
    field: "proteinGramsPerUnit",
    precision: 1,
  },
  {
    key: "carbs",
    label: "Carbs",
    unit: "g",
    field: "carbsGramsPerUnit",
    precision: 1,
  },
  {
    key: "fat",
    label: "Fat",
    unit: "g",
    field: "fatGramsPerUnit",
    precision: 1,
  },
  {
    key: "fiber",
    label: "Fiber",
    unit: "g",
    field: "fiberGramsPerUnit",
    precision: 1,
  },
  {
    key: "sugar",
    label: "Sugar",
    unit: "g",
    field: "sugarGramsPerUnit",
    precision: 1,
  },
  {
    key: "sodium",
    label: "Sodium",
    unit: "mg",
    field: "sodiumMgPerUnit",
    precision: 0,
  },
  {
    key: "calcium",
    label: "Calcium",
    unit: "mg",
    field: "calciumMgPerUnit",
    precision: 0,
  },
  {
    key: "iron",
    label: "Iron",
    unit: "mg",
    field: "ironMgPerUnit",
    precision: 1,
  },
];

export type NutrientTotals = Record<NutrientKey, number>;

export function emptyTotals(): NutrientTotals {
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    calcium: 0,
    iron: 0,
  };
}

/** True when the ingredient has at least one recorded nutrient value. */
export function hasNutrition(fields: IngredientNutritionFields): boolean {
  return NUTRIENTS.some((nutrient) => {
    const value = fields[nutrient.field];
    return value != null && Number.isFinite(Number(value));
  });
}

/**
 * How much of a nutrient total is backed by recorded values. "unknown" = no line
 * recorded it (never shown as zero); "partial" = some lines recorded it, so the
 * total is a floor; "complete" = every line recorded it.
 */
export type NutrientCoverageState = "complete" | "partial" | "unknown";
export type NutrientCoverage = Record<NutrientKey, NutrientCoverageState>;

function allCoverage(state: NutrientCoverageState): NutrientCoverage {
  return Object.fromEntries(
    NUTRIENTS.map((nutrient) => [nutrient.key, state]),
  ) as NutrientCoverage;
}

function isRecorded(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function formatNutrient(
  value: number,
  descriptor: NutrientDescriptor,
): string {
  return `${value.toFixed(descriptor.precision)} ${descriptor.unit}`;
}

export interface ComponentNutritionLineInput {
  id: string;
  ingredientId: string;
  quantity: number;
  unit: UnitOfMeasure;
}

export interface ComponentNutritionIngredientInput extends IngredientNutritionFields {
  id: string;
  name: string;
  unit: UnitOfMeasure;
}

/** Map a raw Convex ingredient row into the aggregation input shape. */
export function toNutritionIngredient(
  row: { _id: string; name: string; unit: string } & IngredientNutritionFields,
): ComponentNutritionIngredientInput {
  return {
    id: row._id,
    name: row.name,
    unit: row.unit as UnitOfMeasure,
    caloriesPerUnit: row.caloriesPerUnit,
    proteinGramsPerUnit: row.proteinGramsPerUnit,
    carbsGramsPerUnit: row.carbsGramsPerUnit,
    fatGramsPerUnit: row.fatGramsPerUnit,
    fiberGramsPerUnit: row.fiberGramsPerUnit,
    sugarGramsPerUnit: row.sugarGramsPerUnit,
    sodiumMgPerUnit: row.sodiumMgPerUnit,
    calciumMgPerUnit: row.calciumMgPerUnit,
    ironMgPerUnit: row.ironMgPerUnit,
  };
}

export type ComponentNutritionLineStatus =
  "measured" | "missing_ingredient" | "incompatible_unit" | "no_nutrition";

export interface ComponentNutritionLineResult {
  lineId: string;
  ingredientId: string;
  ingredientName: string;
  status: ComponentNutritionLineStatus;
}

export interface ComponentNutritionSummary {
  batch: NutrientTotals;
  /** Per-guest values; null when servesPerYield is not a positive number. */
  perPortion: NutrientTotals | null;
  servesPerYield: number;
  measuredLineCount: number;
  totalLineCount: number;
  isComplete: boolean;
  /** Per nutrient: whether the total is recorded, partly recorded, or unknown. */
  coverage: NutrientCoverage;
  lines: ComponentNutritionLineResult[];
}

/**
 * Aggregate one component's ingredient lines into batch + per-portion nutrition.
 * Mirrors calculateComponentCost: quantities are converted into each ingredient's
 * catalog unit; lines whose unit is incompatible or whose ingredient has no
 * nutrition are surfaced (and contribute nothing) rather than silently dropped.
 * Per-portion divides the batch by servesPerYield (guests per yield batch),
 * matching the Component.liveCostPerGuest model. Batch multiplier is intentionally
 * excluded — it scales production, not per-guest nutrition.
 */
export function calculateComponentNutrition({
  lines,
  ingredients,
  servesPerYield,
}: {
  lines: ComponentNutritionLineInput[];
  ingredients: ComponentNutritionIngredientInput[];
  servesPerYield: number;
}): ComponentNutritionSummary {
  const ingredientsById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient]),
  );
  const batch = emptyTotals();
  let measuredLineCount = 0;
  const recordedLines = Object.fromEntries(
    NUTRIENTS.map((nutrient) => [nutrient.key, 0]),
  ) as Record<NutrientKey, number>;

  const resultLines = lines.map<ComponentNutritionLineResult>((line) => {
    const ingredient = ingredientsById.get(line.ingredientId);
    const base = {
      lineId: line.id,
      ingredientId: line.ingredientId,
      ingredientName: ingredient?.name ?? "Unavailable ingredient",
    };
    if (!ingredient) return { ...base, status: "missing_ingredient" };

    const quantity = convertComponentQuantity(
      Number(line.quantity),
      line.unit,
      ingredient.unit,
    );
    if (quantity === null) return { ...base, status: "incompatible_unit" };
    if (!hasNutrition(ingredient)) return { ...base, status: "no_nutrition" };

    for (const nutrient of NUTRIENTS) {
      const value = ingredient[nutrient.field];
      if (!isRecorded(value)) continue;
      recordedLines[nutrient.key] += 1;
      batch[nutrient.key] += quantity * Number(value);
    }
    measuredLineCount += 1;
    return { ...base, status: "measured" };
  });

  const perPortion =
    Number.isFinite(servesPerYield) && servesPerYield > 0
      ? (Object.fromEntries(
          NUTRIENTS.map((nutrient) => [
            nutrient.key,
            batch[nutrient.key] / servesPerYield,
          ]),
        ) as NutrientTotals)
      : null;

  const coverage = Object.fromEntries(
    NUTRIENTS.map((nutrient) => {
      const recorded = recordedLines[nutrient.key];
      const state: NutrientCoverageState =
        recorded === 0
          ? "unknown"
          : recorded === lines.length
            ? "complete"
            : "partial";
      return [nutrient.key, state];
    }),
  ) as NutrientCoverage;

  return {
    batch,
    perPortion,
    servesPerYield,
    measuredLineCount,
    totalLineCount: lines.length,
    isComplete: lines.length > 0 && measuredLineCount === lines.length,
    coverage,
    lines: resultLines,
  };
}

export interface AggregatedPerGuestNutrition {
  perGuest: NutrientTotals;
  componentCount: number;
  measuredComponentCount: number;
  isComplete: boolean;
  coverage: NutrientCoverage;
}

/**
 * Sum per-portion nutrition across a set of component summaries into a single
 * per-guest panel — used on menus and event sheets, where one guest receives one
 * portion of each composed component. This is an operational estimate: it does not
 * re-scale for dish-level component yields.
 */
export function sumPerGuestNutrition(
  summaries: readonly ComponentNutritionSummary[],
): AggregatedPerGuestNutrition {
  const perGuest = emptyTotals();
  let measuredComponentCount = 0;
  const coverage = allCoverage(summaries.length > 0 ? "complete" : "unknown");
  const anyRecorded = new Set<NutrientKey>();
  for (const summary of summaries) {
    const portion = summary.perPortion;
    for (const nutrient of NUTRIENTS) {
      const state =
        portion == null ? "unknown" : summary.coverage[nutrient.key];
      if (state !== "complete") coverage[nutrient.key] = "partial";
      if (portion == null || state === "unknown") continue;
      anyRecorded.add(nutrient.key);
      perGuest[nutrient.key] += portion[nutrient.key];
    }
    if (portion != null && summary.measuredLineCount > 0) {
      measuredComponentCount += 1;
    }
  }
  for (const nutrient of NUTRIENTS) {
    if (!anyRecorded.has(nutrient.key)) coverage[nutrient.key] = "unknown";
  }
  return {
    perGuest,
    componentCount: summaries.length,
    measuredComponentCount,
    isComplete:
      summaries.length > 0 && measuredComponentCount === summaries.length,
    coverage,
  };
}
