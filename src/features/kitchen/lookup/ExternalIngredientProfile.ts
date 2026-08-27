import type { IngredientNutritionFields } from "../ComponentNutrition";
import type { CulinaryAllergenCode } from "../CulinaryAllergenVocabulary";
import type { UnitOfMeasure } from "../import/UnitOfMeasureMapper";

export type IngredientLookupSource = "usda_fdc" | "open_food_facts";

/** Normalized autofill payload from `ingredientLookup.getFoodAutofill`. */
export type IngredientLookupApplyResult = {
  nutritionApplied: boolean;
  nutritionSkippedReason?: string;
  nutritionAppliedNote?: string;
  imageApplied?: boolean;
  costApplied?: boolean;
  costNote?: string;
  suggestedCostPerUnit?: number;
};

export type IngredientAutofillProfile = {
  source: IngredientLookupSource;
  externalId: string;
  name: string;
  category?: string;
  brandOwner?: string;
  unit: UnitOfMeasure;
  allergens: CulinaryAllergenCode[];
  isGlutenFree: boolean;
  nutrition: Partial<IngredientNutritionFields>;
  nutritionNote: string;
  allergenNote: string;
  sourceLabel: string;
  imageUrl?: string;
  imageNote: string;
  servingGramsPerUnit?: number;
  gramsPerMl?: number;
  densitySource?: "usda_portion" | "label_household" | "typical" | "water";
  barcode?: string;
  costNote: string;
};

export type IngredientLookupHit = {
  source: IngredientLookupSource;
  externalId: string;
  name: string;
  category?: string;
  brandOwner?: string;
};
