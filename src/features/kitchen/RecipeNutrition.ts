import { convertRecipeQuantity } from "./RecipeCostCalculator";
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

export function formatNutrient(
  value: number,
  descriptor: NutrientDescriptor,
): string {
  return `${value.toFixed(descriptor.precision)} ${descriptor.unit}`;
}

export interface RecipeNutritionLineInput {
  id: string;
  ingredientId: string;
  quantity: number;
  unit: UnitOfMeasure;
}

export interface RecipeNutritionIngredientInput extends IngredientNutritionFields {
  id: string;
  name: string;
  unit: UnitOfMeasure;
}

/** Map a raw Convex ingredient row into the aggregation input shape. */
export function toNutritionIngredient(
  row: { _id: string; name: string; unit: string } & IngredientNutritionFields,
): RecipeNutritionIngredientInput {
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

export type RecipeNutritionLineStatus =
  "measured" | "missing_ingredient" | "incompatible_unit" | "no_nutrition";

export interface RecipeNutritionLineResult {
  lineId: string;
  ingredientId: string;
  ingredientName: string;
  status: RecipeNutritionLineStatus;
}

export interface RecipeNutritionSummary {
  batch: NutrientTotals;
  /** Per-guest values; null when servesPerYield is not a positive number. */
  perPortion: NutrientTotals | null;
  servesPerYield: number;
  measuredLineCount: number;
  totalLineCount: number;
  isComplete: boolean;
  lines: RecipeNutritionLineResult[];
}

/**
 * Aggregate one recipe's ingredient lines into batch + per-portion nutrition.
 * Mirrors calculateRecipeCost: quantities are converted into each ingredient's
 * catalog unit; lines whose unit is incompatible or whose ingredient has no
 * nutrition are surfaced (and contribute nothing) rather than silently dropped.
 * Per-portion divides the batch by servesPerYield (guests per yield batch),
 * matching the Recipe.liveCostPerGuest model. Batch multiplier is intentionally
 * excluded — it scales production, not per-guest nutrition.
 */
export function calculateRecipeNutrition({
  lines,
  ingredients,
  servesPerYield,
}: {
  lines: RecipeNutritionLineInput[];
  ingredients: RecipeNutritionIngredientInput[];
  servesPerYield: number;
}): RecipeNutritionSummary {
  const ingredientsById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient]),
  );
  const batch = emptyTotals();
  let measuredLineCount = 0;

  const resultLines = lines.map<RecipeNutritionLineResult>((line) => {
    const ingredient = ingredientsById.get(line.ingredientId);
    const base = {
      lineId: line.id,
      ingredientId: line.ingredientId,
      ingredientName: ingredient?.name ?? "Unavailable ingredient",
    };
    if (!ingredient) return { ...base, status: "missing_ingredient" };

    const quantity = convertRecipeQuantity(
      Number(line.quantity),
      line.unit,
      ingredient.unit,
    );
    if (quantity === null) return { ...base, status: "incompatible_unit" };
    if (!hasNutrition(ingredient)) return { ...base, status: "no_nutrition" };

    for (const nutrient of NUTRIENTS) {
      const perUnit = Number(ingredient[nutrient.field] ?? 0);
      if (Number.isFinite(perUnit) && perUnit > 0) {
        batch[nutrient.key] += quantity * perUnit;
      }
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

  return {
    batch,
    perPortion,
    servesPerYield,
    measuredLineCount,
    totalLineCount: lines.length,
    isComplete: lines.length > 0 && measuredLineCount === lines.length,
    lines: resultLines,
  };
}

export interface AggregatedPerGuestNutrition {
  perGuest: NutrientTotals;
  recipeCount: number;
  measuredRecipeCount: number;
  isComplete: boolean;
}

/**
 * Sum per-portion nutrition across a set of recipe summaries into a single
 * per-guest panel — used on menus and event sheets, where one guest receives one
 * portion of each composed recipe. This is an operational estimate: it does not
 * re-scale for dish-level recipe yields.
 */
export function sumPerGuestNutrition(
  summaries: readonly RecipeNutritionSummary[],
): AggregatedPerGuestNutrition {
  const perGuest = emptyTotals();
  let measuredRecipeCount = 0;
  for (const summary of summaries) {
    if (summary.perPortion == null) continue;
    for (const nutrient of NUTRIENTS) {
      perGuest[nutrient.key] += summary.perPortion[nutrient.key];
    }
    if (summary.measuredLineCount > 0) measuredRecipeCount += 1;
  }
  return {
    perGuest,
    recipeCount: summaries.length,
    measuredRecipeCount,
    isComplete:
      summaries.length > 0 && measuredRecipeCount === summaries.length,
  };
}
