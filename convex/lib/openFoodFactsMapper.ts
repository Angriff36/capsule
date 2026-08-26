import { mapFdcNutrientsPerGram, type FdcNutrientRow } from "./fdcNutrientMapper";

/** Map OFF nutriments (per 100g) into Capsule per-gram nutrition fields. */
export function mapOffNutrimentsPerGram(nutriments?: Record<string, number | undefined>) {
  if (!nutriments) {
    return mapFdcNutrientsPerGram([]);
  }
  const rows: FdcNutrientRow[] = [
    { nutrient: { id: 1008 }, amount: nutriments["energy-kcal_100g"] },
    { nutrient: { id: 1003 }, amount: nutriments.proteins_100g },
    { nutrient: { id: 1004 }, amount: nutriments.fat_100g },
    { nutrient: { id: 1005 }, amount: nutriments.carbohydrates_100g },
    { nutrient: { id: 1079 }, amount: nutriments.fiber_100g },
    { nutrient: { id: 2000 }, amount: nutriments.sugars_100g },
    { nutrient: { id: 1093 }, amount: nutriments.sodium_100g },
    { nutrient: { id: 1087 }, amount: nutriments.calcium_100g },
    { nutrient: { id: 1089 }, amount: nutriments.iron_100g },
  ];
  return mapFdcNutrientsPerGram(rows);
}

export function offCategory(tags?: string[]): string | undefined {
  const tag = (tags ?? []).find((value) => value.startsWith("en:"));
  if (!tag) return undefined;
  return tag
    .replace(/^en:/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
