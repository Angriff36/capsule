import {
  NUTRIENTS,
  type IngredientNutritionFields,
} from "../ComponentNutrition";

/** Read hidden nutrition_* fields posted from the ingredient create form. */
export function parseIngredientNutritionFromForm(
  data: FormData,
): Partial<IngredientNutritionFields> {
  const out: Partial<IngredientNutritionFields> = {};
  for (const nutrient of NUTRIENTS) {
    const raw = data.get(`nutrition_${nutrient.field}`);
    if (raw == null || String(raw).trim() === "") continue;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    out[nutrient.field] = parsed;
  }
  return out;
}
