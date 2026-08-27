/** Client-side mirror of convex/lib/nutritionUnitScaler for create forms. */

const GRAMS_PER_UNIT: Readonly<Record<string, number>> = {
  gram: 1,
  kilogram: 1000,
  ounce: 28.3495,
  pound: 453.592,
};

export type NutritionFields = {
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

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function scaleNutritionFromGramsToUnit(
  nutrition: NutritionFields,
  unit: string,
): NutritionFields | null {
  const factor = GRAMS_PER_UNIT[unit];
  if (!factor) return null;

  const scaled: NutritionFields = {};
  for (const [key, value] of Object.entries(nutrition) as Array<
    [keyof NutritionFields, number | undefined]
  >) {
    if (value != null && value > 0) {
      scaled[key] = round(value * factor, 2);
    }
  }
  return Object.keys(scaled).length > 0 ? scaled : null;
}

export function canScaleNutritionToUnit(unit: string): boolean {
  return GRAMS_PER_UNIT[unit] != null;
}
