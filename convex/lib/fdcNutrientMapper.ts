/** Maps USDA FoodData Central nutrient ids → Capsule ingredient nutrition fields. */

export type FdcNutrientRow = {
  nutrient?: { id?: number; name?: string; unitName?: string };
  amount?: number;
};

const NUTRIENT = {
  calories: 1008,
  caloriesAtwater: 2047,
  caloriesLabel: 2048,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  fiber: 1079,
  sugar: 2000,
  sodium: 1093,
  calcium: 1087,
  iron: 1089,
} as const;

function energyPer100g(byId: Map<number, number>) {
  return (
    byId.get(NUTRIENT.calories) ??
    byId.get(NUTRIENT.caloriesAtwater) ??
    byId.get(NUTRIENT.caloriesLabel) ??
    0
  );
}

/** FDC reports per 100 g; Capsule stores per one catalog unit (default gram). */
export function mapFdcNutrientsPerGram(nutrients: readonly FdcNutrientRow[]) {
  const byId = new Map<number, number>();
  for (const row of nutrients) {
    const id = row.nutrient?.id;
    if (id == null || row.amount == null || !Number.isFinite(row.amount)) {
      continue;
    }
    byId.set(id, row.amount);
  }
  const perGram = (nutrientId: number) => (byId.get(nutrientId) ?? 0) / 100;

  return {
    caloriesPerUnit: energyPer100g(byId) / 100,
    proteinGramsPerUnit: perGram(NUTRIENT.protein),
    fatGramsPerUnit: perGram(NUTRIENT.fat),
    carbsGramsPerUnit: perGram(NUTRIENT.carbs),
    fiberGramsPerUnit: perGram(NUTRIENT.fiber),
    sugarGramsPerUnit: perGram(NUTRIENT.sugar),
    sodiumMgPerUnit: perGram(NUTRIENT.sodium),
    calciumMgPerUnit: perGram(NUTRIENT.calcium),
    ironMgPerUnit: perGram(NUTRIENT.iron),
  };
}

export function normalizeFdcCategory(
  raw?: string | { description?: string | null } | null,
): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "object") {
    return normalizeFdcCategory(raw.description ?? undefined);
  }
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\s+/g, " ");
}
