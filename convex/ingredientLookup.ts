// AUTHOR-OWNED — USDA FoodData Central + Open Food Facts proxy for ingredient autofill.
// Keys stay on the Convex deployment (USDA_FDC_API_KEY); falls back to DEMO_KEY locally.
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import {
  mapFdcNutrientsPerGram,
  normalizeFdcCategory,
  type FdcNutrientRow,
} from "./lib/fdcNutrientMapper";
import {
  parseAllergensFromIngredientsText,
  parseAllergensFromOffTags,
} from "./lib/ingredientAllergenParser";
import {
  mapOffNutrimentsPerGram,
  offCategory,
} from "./lib/openFoodFactsMapper";
import { scaleNutritionFromGramsToUnit } from "./lib/nutritionUnitScaler";

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";
const OFF_BASE = "https://world.openfoodfacts.org/api/v2";
const OFF_SEARCH_BASE = "https://world.openfoodfacts.org/cgi/search.pl";

const lookupSource = v.union(
  v.literal("usda_fdc"),
  v.literal("open_food_facts"),
);

function fdcApiKey(): string {
  return process.env.USDA_FDC_API_KEY?.trim() || "DEMO_KEY";
}

function requireKitchenStaff(auth: Awaited<ReturnType<typeof getAuthContext>>) {
  if (!auth.tenantId || auth.role === "anonymous") {
    throw new Error("Sign in to search the food database");
  }
}

type LookupSource = "usda_fdc" | "open_food_facts";

type SearchHit = {
  source: LookupSource;
  externalId: string;
  name: string;
  category?: string;
  brandOwner?: string;
};

type AutofillProfile = SearchHit & {
  unit: "gram";
  allergens: string[];
  isGlutenFree: boolean;
  nutrition: ReturnType<typeof mapFdcNutrientsPerGram>;
  nutritionNote: string;
  allergenNote: string;
  sourceLabel: string;
};

async function fdcFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${FDC_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Food database request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function offFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${OFF_BASE}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Capsule/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Open Food Facts request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function searchUsdaFoods(
  query: string,
  pageSize: number,
): Promise<SearchHit[]> {
  const params = new URLSearchParams({
    api_key: fdcApiKey(),
    query,
    pageSize: String(pageSize),
    dataType: "Foundation,SR Legacy,Branded",
  });

  const payload = await fdcFetch<{
    foods?: Array<{
      fdcId?: number;
      description?: string;
      foodCategory?: string;
      brandOwner?: string;
    }>;
  }>(`/foods/search?${params.toString()}`);

  return (payload.foods ?? [])
    .filter((row) => row.fdcId != null && row.description?.trim())
    .map((row) => ({
      source: "usda_fdc" as const,
      externalId: String(row.fdcId),
      name: row.description!.trim(),
      category: normalizeFdcCategory(row.foodCategory),
      brandOwner: row.brandOwner?.trim() || undefined,
    }));
}

async function searchOpenFoodFacts(
  query: string,
  pageSize: number,
): Promise<SearchHit[]> {
  const params = new URLSearchParams({
    action: "process",
    search_terms: query,
    json: "true",
    page_size: String(pageSize),
    fields: "code,product_name,brands,categories_tags",
  });

  const response = await fetch(`${OFF_SEARCH_BASE}?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": "Capsule/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Open Food Facts request failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    products?: Array<{
      code?: string;
      product_name?: string;
      brands?: string;
      categories_tags?: string[];
    }>;
  };

  return (payload.products ?? [])
    .filter((row) => row.code?.trim() && row.product_name?.trim())
    .map((row) => ({
      source: "open_food_facts" as const,
      externalId: row.code!.trim(),
      name: row.product_name!.trim(),
      category: offCategory(row.categories_tags),
      brandOwner: row.brands?.trim() || undefined,
    }));
}

/** Typeahead search against USDA FoodData Central and Open Food Facts. */
export const searchFoods = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SearchHit[]> => {
    const auth = await getAuthContext(ctx);
    requireKitchenStaff(auth);

    const query = args.query.trim();
    if (query.length < 2) return [];

    const pageSize = Math.min(Math.max(args.limit ?? 10, 1), 25);
    const perSource = Math.ceil(pageSize / 2);

    let usdaError: unknown;
    let offError: unknown;
    const [usda, off] = await Promise.all([
      searchUsdaFoods(query, perSource).catch((error) => {
        usdaError = error;
        return [] as SearchHit[];
      }),
      searchOpenFoodFacts(query, perSource).catch((error) => {
        offError = error;
        return [] as SearchHit[];
      }),
    ]);

    const hits = [...usda, ...off].slice(0, pageSize);
    if (hits.length === 0 && (usdaError || offError)) {
      throw new Error(
        "Food database search is unavailable right now — try again in a moment.",
      );
    }

    return hits;
  },
});

async function loadUsdaAutofill(externalId: string): Promise<AutofillProfile> {
  const params = new URLSearchParams({ api_key: fdcApiKey() });
  const food = await fdcFetch<{
    fdcId?: number;
    description?: string;
    foodCategory?: string;
    brandOwner?: string;
    foodNutrients?: FdcNutrientRow[];
    brandedFood?: { ingredients?: string };
    ingredients?: string;
  }>(`/food/${encodeURIComponent(externalId)}?${params.toString()}`);

  const name = food.description?.trim();
  if (!name) throw new Error("Food record has no description");

  const ingredientsText =
    food.brandedFood?.ingredients?.trim() || food.ingredients?.trim() || null;
  const allergenParse = parseAllergensFromIngredientsText(ingredientsText);

  const nutrition = mapFdcNutrientsPerGram(food.foodNutrients ?? []);
  const hasNutrition = Object.values(nutrition).some((value) => value > 0);

  return {
    source: "usda_fdc",
    externalId: String(food.fdcId ?? externalId),
    name,
    category: normalizeFdcCategory(food.foodCategory),
    brandOwner: food.brandOwner?.trim() || undefined,
    unit: "gram",
    allergens: allergenParse.allergens,
    isGlutenFree: allergenParse.isGlutenFree,
    nutrition,
    nutritionNote: hasNutrition
      ? "Nutrition converted from USDA per-100 g values into per-gram catalog units."
      : "No nutrition values on this USDA record — enter manually if needed.",
    allergenNote: allergenParse.allergenNote,
    sourceLabel: "USDA FoodData Central",
  };
}

async function loadOffAutofill(externalId: string): Promise<AutofillProfile> {
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
    };
  }>(
    `/product/${encodeURIComponent(barcode)}?fields=product_name,brands,categories_tags,allergens_tags,labels_tags,ingredients_text,nutriments`,
  );

  const product = payload.product;
  if (!product) throw new Error("Product not found in Open Food Facts");

  const name = product.product_name?.trim();
  if (!name) throw new Error("Product has no name in Open Food Facts");

  const allergenParse =
    (product.allergens_tags?.length ?? 0) > 0 ||
    (product.labels_tags?.length ?? 0) > 0
      ? parseAllergensFromOffTags(product.allergens_tags, product.labels_tags)
      : parseAllergensFromIngredientsText(product.ingredients_text);

  const nutrition = mapOffNutrimentsPerGram(product.nutriments);
  const hasNutrition = Object.values(nutrition).some((value) => value > 0);

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
    nutritionNote: hasNutrition
      ? "Nutrition converted from Open Food Facts per-100 g values into per-gram catalog units."
      : "No nutrition values on this product — enter manually if needed.",
    allergenNote: allergenParse.allergenNote,
    sourceLabel: "Open Food Facts",
  };
}

/** Load one food record and map nutrition + allergens for ingredient autofill. */
export const getFoodAutofill = action({
  args: {
    externalId: v.string(),
    source: v.optional(lookupSource),
  },
  handler: async (ctx, args): Promise<AutofillProfile> => {
    const auth = await getAuthContext(ctx);
    requireKitchenStaff(auth);

    const externalId = args.externalId.trim();
    if (!externalId) throw new Error("Food record id is required");

    const source = args.source ?? "usda_fdc";
    if (source === "open_food_facts") {
      return loadOffAutofill(externalId);
    }
    return loadUsdaAutofill(externalId);
  },
});

const autofillNutritionValidator = v.object({
  caloriesPerUnit: v.optional(v.number()),
  proteinGramsPerUnit: v.optional(v.number()),
  carbsGramsPerUnit: v.optional(v.number()),
  fatGramsPerUnit: v.optional(v.number()),
  fiberGramsPerUnit: v.optional(v.number()),
  sugarGramsPerUnit: v.optional(v.number()),
  sodiumMgPerUnit: v.optional(v.number()),
  calciumMgPerUnit: v.optional(v.number()),
  ironMgPerUnit: v.optional(v.number()),
});

/** Apply a lookup profile to an existing ingredient (sequential governed mutations). */
export const applyToIngredient = action({
  args: {
    docId: v.id("ingredients"),
    profile: v.object({
      name: v.string(),
      unit: v.string(),
      category: v.optional(v.string()),
      allergens: v.array(v.string()),
      isGlutenFree: v.boolean(),
      nutrition: autofillNutritionValidator,
    }),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    requireKitchenStaff(auth);

    let doc = await ctx.runQuery(api.queries.getIngredient, { id: args.docId });
    if (!doc) throw new Error("Ingredient not found");

    await ctx.runMutation(api.mutations.Ingredient_updateDetails, {
      docId: args.docId,
      version: doc.version,
      name: args.profile.name,
      unit: doc.unit,
      category: args.profile.category,
    });

    doc = await ctx.runQuery(api.queries.getIngredient, { id: args.docId });
    if (!doc) throw new Error("Ingredient not found");

    await ctx.runMutation(api.mutations.Ingredient_classifyAllergens, {
      docId: args.docId,
      version: doc.version,
      allergens: args.profile.allergens,
      isGlutenFree: args.profile.isGlutenFree,
    });

    const nutritionEntries = Object.entries(args.profile.nutrition).filter(
      ([, value]) => value != null && Number(value) > 0,
    );
    if (nutritionEntries.length > 0) {
      doc = await ctx.runQuery(api.queries.getIngredient, { id: args.docId });
      if (!doc) throw new Error("Ingredient not found");
      const scaled = scaleNutritionFromGramsToUnit(
        args.profile.nutrition,
        doc.unit,
      );
      if (scaled) {
        await ctx.runMutation(api.mutations.Ingredient_setNutrition, {
          docId: args.docId,
          version: doc.version,
          ...scaled,
        });
      }
    }
  },
});
