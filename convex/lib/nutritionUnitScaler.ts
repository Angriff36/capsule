/** Scale per-gram nutrition values to the ingredient catalog unit. */

const GRAMS_PER_UNIT: Readonly<Record<string, number>> = {
  gram: 1,
  kilogram: 1000,
  ounce: 28.3495,
  pound: 453.592,
};

export type ScaledNutrition = {
  caloriesPerUnit?: number;
  proteinGramsPerUnit?: number;
  carbsGramsPerUnit?: number;
  fatGramsPerUnit?: number;
  fiberGramsPerUnit?: number;
  sugarGramsPerUnit?: number;
  sodiumMgPerUnit?: number;
  calciumMgPerUnit?: number;
  ironMgPerUnit?: number;
};

export const NUTRITION_FIELD_KEYS = [
  "caloriesPerUnit",
  "proteinGramsPerUnit",
  "carbsGramsPerUnit",
  "fatGramsPerUnit",
  "fiberGramsPerUnit",
  "sugarGramsPerUnit",
  "sodiumMgPerUnit",
  "calciumMgPerUnit",
  "ironMgPerUnit",
] as const satisfies readonly (keyof ScaledNutrition)[];

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function scaleNutritionFromGramsToUnit(
  nutrition: ScaledNutrition,
  unit: string,
): ScaledNutrition | null {
  const factor = GRAMS_PER_UNIT[unit];
  if (!factor) return null;

  const scaled: ScaledNutrition = {};
  for (const [key, value] of Object.entries(nutrition) as Array<
    [keyof ScaledNutrition, number | undefined]
  >) {
    if (value != null && value > 0) {
      scaled[key] = round(value * factor, 2);
    }
  }
  return Object.keys(scaled).length > 0 ? scaled : null;
}

export function mergeScaledNutritionWithExisting(
  existing: Record<string, unknown>,
  scaled: ScaledNutrition,
): ScaledNutrition {
  const merged: ScaledNutrition = {};
  for (const key of NUTRITION_FIELD_KEYS) {
    const incoming = scaled[key];
    if (incoming != null && incoming > 0) {
      merged[key] = incoming;
      continue;
    }
    const current = existing[key];
    if (typeof current === "number" && current >= 0) {
      merged[key] = current;
    }
  }
  return merged;
}
