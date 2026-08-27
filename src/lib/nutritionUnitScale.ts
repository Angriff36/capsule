/** Client-side mirror of convex/lib/nutritionUnitScaler for create forms. */

import { CatalogUnitGrams } from "./catalogUnitGrams";

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
  servingGramsPerEach?: number,
  hints?: { gramsPerMl?: number; foodName?: string },
): NutritionFields | null {
  const factor = CatalogUnitGrams.resolve(unit, {
    servingGramsPerEach,
    gramsPerMl: hints?.gramsPerMl,
    foodName: hints?.foodName,
  });
  if (factor == null) return null;

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
  return CatalogUnitGrams.canScale(unit);
}
