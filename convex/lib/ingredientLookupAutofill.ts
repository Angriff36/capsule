import { ConvexError } from "convex/values";
import { fdcApiKey, fdcFetch, offFetchJson } from "./foodDatabaseClient";
import {
  mapFdcNutrientsPerGram,
  normalizeFdcCategory,
  type FdcNutrientRow,
} from "./fdcNutrientMapper";
import {
  parseAllergensFromIngredientsText,
  parseAllergensFromOffTags,
} from "./ingredientAllergenParser";
import { mapOffNutrimentsPerGram, offCategory } from "./openFoodFactsMapper";
import { resolveOffImageByBarcode, pickOffImageUrl } from "./foodDatabaseImage";
import {
  offServingGramsPerEach,
  parseGramsFromServingText,
  usdaServingGramsPerEach,
} from "./servingWeightGrams";
import {
  LookupFoodDensity,
  type DensitySource,
  type FdcFoodPortion,
} from "./foodDensityFromLookup";

const OFF_BASE = "https://world.openfoodfacts.org/api/v2";

export type LookupSource = "usda_fdc" | "open_food_facts";

export type AutofillProfile = {
  source: LookupSource;
  externalId: string;
  name: string;
  category?: string;
  brandOwner?: string;
  unit: "gram";
  allergens: string[];
  isGlutenFree: boolean;
  nutrition: ReturnType<typeof mapFdcNutrientsPerGram>;
  nutritionNote: string;
  allergenNote: string;
  sourceLabel: string;
  imageUrl?: string;
  imageNote: string;
  servingGramsPerUnit?: number;
  gramsPerMl?: number;
  densitySource?: DensitySource;
  barcode?: string;
  costNote: string;
};

function nutritionImportNote(
  sourceLabel: string,
  hasNutrition: boolean,
  density?: { gramsPerMl: number; source: DensitySource },
): string {
  if (!hasNutrition) {
    return `No nutrition values on this ${sourceLabel} record — enter manually if needed.`;
  }
  if (density?.source === "typical") {
    return `Nutrition imported from ${sourceLabel} and scaled to this ingredient's unit using typical kitchen density.`;
  }
  if (density?.source === "water") {
    return `Nutrition imported from ${sourceLabel} and scaled to this ingredient's unit using a water-like density — verify oils, flours, and similar items.`;
  }
  return `Nutrition imported from ${sourceLabel} and scaled to this ingredient's unit.`;
}

function rawUsdaServingGrams(food: {
  servingSize?: number;
  servingSizeUnit?: string;
}): number | undefined {
  return usdaServingGramsPerEach({
    servingSize: food.servingSize,
    servingSizeUnit: food.servingSizeUnit,
  });
}

function firstPortionGrams(
  portions?: readonly FdcFoodPortion[] | null,
): number | undefined {
  if (!portions?.length) return undefined;
  for (const portion of portions) {
    const amount = portion.amount;
    const gramWeight = portion.gramWeight;
    if (
      amount != null &&
      gramWeight != null &&
      amount > 0 &&
      gramWeight > 0
    ) {
      return gramWeight / amount;
    }
  }
  return undefined;
}

export async function loadUsdaAutofill(
  externalId: string,
): Promise<AutofillProfile> {
  const params = new URLSearchParams({ api_key: fdcApiKey() });
  const food = await fdcFetch<{
    fdcId?: number;
    description?: string;
    foodCategory?: string | { description?: string | null };
    brandedFoodCategory?: string;
    brandOwner?: string;
    gtinUpc?: string;
    servingSize?: number;
    servingSizeUnit?: string;
    householdServingFullText?: string;
    foodNutrients?: FdcNutrientRow[];
    foodPortions?: FdcFoodPortion[];
    brandedFood?: {
      ingredients?: string;
      brandedFoodCategory?: string;
      servingSize?: number;
      servingSizeUnit?: string;
      householdServingFullText?: string;
    };
    ingredients?: string;
  }>(`/food/${encodeURIComponent(externalId)}?${params.toString()}`);

  const name = food.description?.trim();
  if (!name) throw new ConvexError("Food record has no description");

  const ingredientsText =
    food.brandedFood?.ingredients?.trim() || food.ingredients?.trim() || null;
  const allergenParse = parseAllergensFromIngredientsText(ingredientsText);

  const nutrition = mapFdcNutrientsPerGram(food.foodNutrients ?? []);
  const hasNutrition = Object.values(nutrition).some((value) => value > 0);
  const imageUrl = food.gtinUpc
    ? await resolveOffImageByBarcode(food.gtinUpc)
    : undefined;
  const servingSize = food.servingSize ?? food.brandedFood?.servingSize;
  const servingSizeUnit =
    food.servingSizeUnit ?? food.brandedFood?.servingSizeUnit;
  const householdServingFullText =
    food.householdServingFullText ??
    food.brandedFood?.householdServingFullText;
  const servingGramsPerUnit =
    usdaServingGramsPerEach({
      servingSize,
      servingSizeUnit,
      householdServingFullText,
    }) ?? firstPortionGrams(food.foodPortions);
  const density = new LookupFoodDensity().resolve({
    foodPortions: food.foodPortions,
    servingGrams: rawUsdaServingGrams({ servingSize, servingSizeUnit }),
    householdServingText: householdServingFullText,
    productName: name,
  });
  const normalizedBarcode = String(food.gtinUpc ?? "").replace(/\D/g, "");
  const barcode = normalizedBarcode.length >= 8 ? normalizedBarcode : undefined;

  return {
    source: "usda_fdc",
    externalId: String(food.fdcId ?? externalId),
    name,
    category: normalizeFdcCategory(
      food.brandedFoodCategory ??
        food.brandedFood?.brandedFoodCategory ??
        food.foodCategory,
    ),
    brandOwner: food.brandOwner?.trim() || undefined,
    unit: "gram",
    allergens: allergenParse.allergens,
    isGlutenFree: allergenParse.isGlutenFree,
    nutrition,
    nutritionNote: nutritionImportNote(
      "USDA FoodData Central",
      hasNutrition,
      density,
    ),
    allergenNote: allergenParse.allergenNote,
    sourceLabel: "USDA FoodData Central",
    imageUrl,
    imageNote: imageUrl
      ? "Product photo imported from Open Food Facts when a barcode match exists."
      : "USDA does not host product photos — no barcode match in Open Food Facts.",
    servingGramsPerUnit,
    gramsPerMl: density?.gramsPerMl,
    densitySource: density?.source,
    barcode,
    costNote: barcode
      ? "Cost imports automatically from Open Prices or similar items in your catalog."
      : "Cost imports from similar items in your catalog when available.",
  };
}

async function offFetch<T>(path: string): Promise<T> {
  const body = await offFetchJson(`${OFF_BASE}${path}`);
  return body as T;
}

export async function loadOffAutofill(
  externalId: string,
): Promise<AutofillProfile> {
  const barcode = externalId.trim();
  const payload = await offFetch<{
    product?: {
      product_name?: string;
      brands?: string;
      categories_tags?: string[];
      allergens_tags?: string[];
      labels_tags?: string[];
      ingredients_text?: string;
      nutriments?: Record<string, number | undefined>;
      image_front_url?: unknown;
      image_url?: unknown;
      serving_size?: string | number;
      serving_quantity?: number;
    };
  }>(
    `/product/${encodeURIComponent(barcode)}?fields=product_name,brands,categories_tags,allergens_tags,labels_tags,ingredients_text,nutriments,image_front_url,image_url,serving_size,serving_quantity`,
  );

  const product = payload.product;
  if (!product) throw new ConvexError("Product not found in Open Food Facts");

  const name = product.product_name?.trim();
  if (!name) throw new ConvexError("Product has no name in Open Food Facts");

  const allergenParse =
    (product.allergens_tags?.length ?? 0) > 0
      ? parseAllergensFromOffTags(product.allergens_tags, product.labels_tags)
      : (() => {
          const fromText = parseAllergensFromIngredientsText(
            product.ingredients_text,
          );
          const fromLabels = parseAllergensFromOffTags([], product.labels_tags);
          return {
            ...fromText,
            isGlutenFree: fromText.isGlutenFree || fromLabels.isGlutenFree,
          };
        })();

  const nutrition = mapOffNutrimentsPerGram(product.nutriments);
  const hasNutrition = Object.values(nutrition).some((value) => value > 0);
  const imageUrl = pickOffImageUrl(product);
  const servingGramsPerUnit = offServingGramsPerEach(product);
  const servingGrams =
    product.serving_quantity != null &&
    Number.isFinite(product.serving_quantity) &&
    product.serving_quantity > 0
      ? product.serving_quantity
      : parseGramsFromServingText(product.serving_size);
  const householdServingText =
    typeof product.serving_size === "string" ? product.serving_size : undefined;
  const density = new LookupFoodDensity().resolve({
    servingGrams,
    householdServingText,
    productName: name,
  });

  return {
    source: "open_food_facts" as const,
    externalId: barcode,
    name,
    category: offCategory(product.categories_tags),
    brandOwner: product.brands?.trim() || undefined,
    unit: "gram",
    allergens: allergenParse.allergens,
    isGlutenFree: allergenParse.isGlutenFree,
    nutrition,
    nutritionNote: nutritionImportNote("Open Food Facts", hasNutrition, density),
    allergenNote: allergenParse.allergenNote,
    sourceLabel: "Open Food Facts",
    imageUrl,
    imageNote: imageUrl
      ? "Product photo will import from Open Food Facts when applied."
      : "No product photo on this Open Food Facts record.",
    servingGramsPerUnit,
    gramsPerMl: density?.gramsPerMl,
    densitySource: density?.source,
    barcode,
    costNote:
      "Cost imports automatically from Open Prices or similar items in your catalog.",
  };
}
