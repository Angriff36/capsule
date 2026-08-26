/** Maps USDA FoodData Central nutrient ids → Capsule ingredient nutrition fields. */

export type FdcNutrientRow = {
  nutrient?: { id?: number; name?: string; unitName?: string };
  amount?: number;
};

const NUTRIENT = {
  calories: 1008,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  fiber: 1079,
  sugar: 2000,
  sodium: 1093,
  calcium: 1087,
  iron: 1089,
} as const;

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** FDC reports per 100 g; Capsule stores per one catalog unit (default gram). */
export function mapFdcNutrientsPerGram(nutrients: readonly FdcNutrientRow[]) {
  const byId = new Map<number, number>();
  for (const row of nutrients) {
    const id = row.nutrient?.id;
    if (id == null || row.amount == null || !Number.isFinite(row.amount)) continue;
    byId.set(id, row.amount);
  }
  const perGram = (nutrientId: number) => (byId.get(nutrientId) ?? 0) / 100;

  return {
    caloriesPerUnit: round(perGram(NUTRIENT.calories), 2),
    proteinGramsPerUnit: round(perGram(NUTRIENT.protein), 2),
    fatGramsPerUnit: round(perGram(NUTRIENT.fat), 2),
    carbsGramsPerUnit: round(perGram(NUTRIENT.carbs), 2),
    fiberGramsPerUnit: round(perGram(NUTRIENT.fiber), 2),
    sugarGramsPerUnit: round(perGram(NUTRIENT.sugar), 2),
    sodiumMgPerUnit: round(perGram(NUTRIENT.sodium), 2),
    calciumMgPerUnit: round(perGram(NUTRIENT.calcium), 2),
    ironMgPerUnit: round(perGram(NUTRIENT.iron), 2),
  };
}

export function normalizeFdcCategory(raw?: string | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\s+/g, " ");
}
