// AUTHOR-OWNED — USDA FoodData Central + Open Food Facts proxy for ingredient autofill.
// Keys stay on the Convex deployment (USDA_FDC_API_KEY); falls back to DEMO_KEY locally.
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import {
  fdcApiKey,
  fdcFetch,
  offFetchJson,
  safeLookupString,
} from "./lib/foodDatabaseClient";
import { requireKitchenAccess } from "./lib/kitchenAccessGate";
import { normalizeFdcCategory } from "./lib/fdcNutrientMapper";
import { offCategory } from "./lib/openFoodFactsMapper";
import { applyCatalogImageFromUrl } from "./lib/ingredientCatalogImageImport";
import {
  applyLookupCostToIngredient,
  resolveLookupCostForCreate,
} from "./lib/ingredientLookupApplyCost";
import {
  resolveLookupCostHint,
  type LookupCostHint,
} from "./lib/lookupCostFromOpenPrices";
import {
  loadOffAutofill,
  loadUsdaAutofill,
  type AutofillProfile,
} from "./lib/ingredientLookupAutofill";
import {
  mergeLookupNutrition,
  nutritionAppliedNote,
  nutritionSkippedReason as lookupNutritionSkippedReason,
  resolveLookupCatalogGrams,
  scaleLookupNutrition,
} from "./lib/ingredientLookupApplyNutrition";

function mergeAllergenCodes(
  existing: readonly string[] | null | undefined,
  incoming: readonly string[],
): string[] {
  if (incoming.length === 0) {
    return [...(existing ?? [])];
  }
  return [...new Set([...(existing ?? []), ...incoming])];
}

function resolveGlutenFree(
  existing: boolean | null | undefined,
  profileGlutenFree: boolean,
  mergedAllergens: readonly string[],
): boolean {
  if (profileGlutenFree) return true;
  if (mergedAllergens.includes("wheat")) return false;
  return Boolean(existing);
}

const OFF_SEARCH_BASE = "https://world.openfoodfacts.org/cgi/search.pl";

const lookupSource = v.union(
  v.literal("usda_fdc"),
  v.literal("open_food_facts"),
);

function requireKitchenStaff(auth: Awaited<ReturnType<typeof getAuthContext>>) {
  requireKitchenAccess(auth);
}

function searchUnavailableMessage(
  usdaError: unknown,
  offError: unknown,
): string {
  let message =
    "Food database search is unavailable right now — wait a moment and try again.";
  const usdaHint = convexErrorData(usdaError);
  if (
    usdaHint.includes("rate-limited") ||
    usdaHint.includes("API key is invalid")
  ) {
    message +=
      " USDA is on the shared demo key — add USDA_FDC_API_KEY on the Convex deployment.";
  } else if (offError && !usdaError) {
    message += " Open Food Facts did not respond.";
  }
  return message;
}

function convexErrorData(error: unknown): string {
  if (!(error instanceof ConvexError)) return "";
  return typeof error.data === "string" ? error.data : "";
}

type LookupSource = "usda_fdc" | "open_food_facts";

type SearchHit = {
  source: LookupSource;
  externalId: string;
  name: string;
  category?: string;
  brandOwner?: string;
};

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
      description?: unknown;
      foodCategory?: string | { description?: string | null };
      brandOwner?: unknown;
    }>;
  }>(`/foods/search?${params.toString()}`);

  const rows = Array.isArray(payload.foods) ? payload.foods : [];
  const hits: SearchHit[] = [];

  for (const row of rows) {
    const name = safeLookupString(row.description);
    if (row.fdcId == null || !name) continue;
    hits.push({
      source: "usda_fdc",
      externalId: String(row.fdcId),
      name,
      category: normalizeFdcCategory(row.foodCategory),
      brandOwner: safeLookupString(row.brandOwner),
    });
  }

  return hits;
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

  const payload = (await offFetchJson(
    `${OFF_SEARCH_BASE}?${params.toString()}`,
  )) as {
    products?: Array<{
      code?: unknown;
      product_name?: unknown;
      brands?: unknown;
      categories_tags?: unknown[];
    }>;
  };

  const rows = Array.isArray(payload.products) ? payload.products : [];
  const hits: SearchHit[] = [];

  for (const row of rows) {
    const externalId = safeLookupString(row.code);
    const name = safeLookupString(row.product_name);
    if (!externalId || !name) continue;
    hits.push({
      source: "open_food_facts",
      externalId,
      name,
      category: offCategory(row.categories_tags),
      brandOwner: safeLookupString(row.brands),
    });
  }

  return hits;
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
      throw new ConvexError(searchUnavailableMessage(usdaError, offError));
    }

    return hits;
  },
});

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
    if (!externalId) throw new ConvexError("Food record id is required");

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
      imageUrl: v.optional(v.string()),
      servingGramsPerUnit: v.optional(v.number()),
      gramsPerMl: v.optional(v.number()),
      densitySource: v.optional(
        v.union(
          v.literal("usda_portion"),
          v.literal("label_household"),
          v.literal("typical"),
          v.literal("water"),
        ),
      ),
      barcode: v.optional(v.string()),
      brandOwner: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    requireKitchenStaff(auth);

    let doc = await ctx.runQuery(api.queries.getIngredient, { id: args.docId });
    if (!doc) throw new Error("Ingredient not found");

    const incomingCategory = args.profile.category?.trim();
    await ctx.runMutation(api.mutations.Ingredient_updateDetails, {
      docId: args.docId,
      version: doc.version,
      name: args.profile.name,
      unit: doc.unit,
      category:
        incomingCategory ||
        (typeof doc.category === "string" ? doc.category : undefined),
    });

    doc = await ctx.runQuery(api.queries.getIngredient, { id: args.docId });
    if (!doc) throw new Error("Ingredient not found");

    const incomingAllergens = args.profile.allergens;
    const shouldUpdateAllergens =
      incomingAllergens.length > 0 || args.profile.isGlutenFree;
    if (shouldUpdateAllergens) {
      const mergedAllergens = mergeAllergenCodes(
        doc.allergens,
        incomingAllergens,
      );
      await ctx.runMutation(api.mutations.Ingredient_classifyAllergens, {
        docId: args.docId,
        version: doc.version,
        allergens: mergedAllergens,
        isGlutenFree: resolveGlutenFree(
          doc.isGlutenFree,
          args.profile.isGlutenFree,
          mergedAllergens,
        ),
      });
    }

    doc = await ctx.runQuery(api.queries.getIngredient, { id: args.docId });
    if (!doc) throw new Error("Ingredient not found");

    const nutritionEntries = Object.entries(args.profile.nutrition).filter(
      ([, value]) => value != null && Number(value) > 0,
    );
    let nutritionApplied = false;
    let nutritionSkippedReason: string | undefined;
    let nutritionAppliedNoteText: string | undefined;
    if (nutritionEntries.length > 0) {
      doc = await ctx.runQuery(api.queries.getIngredient, { id: args.docId });
      if (!doc) throw new Error("Ingredient not found");
      const catalogUnit = String(doc.unit);
      const catalogGrams = resolveLookupCatalogGrams(catalogUnit, {
        servingGramsPerEach: args.profile.servingGramsPerUnit,
        gramsPerMl: args.profile.gramsPerMl,
        foodName: args.profile.name,
      });
      const scaled = scaleLookupNutrition(
        args.profile.nutrition,
        catalogUnit,
        catalogGrams?.grams,
      );
      if (scaled) {
        const merged = mergeLookupNutrition(doc, scaled);
        await ctx.runMutation(api.mutations.Ingredient_setNutrition, {
          docId: args.docId,
          version: doc.version,
          ...merged,
        });
        nutritionApplied = true;
        nutritionAppliedNoteText = nutritionAppliedNote(
          catalogUnit,
          args.profile.densitySource,
          catalogGrams?.basis,
        );
      } else {
        nutritionSkippedReason = lookupNutritionSkippedReason(catalogUnit);
      }
    }

    let imageApplied = false;
    if (args.profile.imageUrl?.trim()) {
      imageApplied = await applyCatalogImageFromUrl(
        ctx,
        args.docId,
        args.profile.imageUrl.trim(),
      );
    }

    const costResult = await applyLookupCostToIngredient(
      ctx,
      auth,
      args.docId,
      {
        barcode: args.profile.barcode,
        productName: args.profile.name,
        brandOwner: args.profile.brandOwner,
        category:
          incomingCategory ||
          (typeof doc.category === "string" ? doc.category : undefined),
        catalogUnit: String(doc.unit),
        servingGramsPerUnit: args.profile.servingGramsPerUnit,
      },
    );

    return {
      nutritionApplied,
      nutritionSkippedReason,
      nutritionAppliedNote: nutritionAppliedNoteText,
      imageApplied,
      costApplied: costResult.costApplied,
      costNote: costResult.costNote,
      suggestedCostPerUnit: costResult.suggestedCostPerUnit,
    };
  },
});

/** Resolve lookup cost without writing (create flow + previews). */
export const resolveLookupCost = action({
  args: {
    barcode: v.optional(v.string()),
    productName: v.string(),
    brandOwner: v.optional(v.string()),
    category: v.optional(v.string()),
    catalogUnit: v.string(),
    servingGramsPerUnit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<LookupCostHint> => {
    const auth = await getAuthContext(ctx);
    requireKitchenStaff(auth);
    const tenantIngredients = (await ctx.runQuery(
      api.queries.listIngredient,
      {},
    )) as Array<{
      name?: string | null;
      category?: string | null;
      unit?: string | null;
      costPerUnit?: number | null;
    }>;
    return resolveLookupCostHint({
      barcode: args.barcode,
      productName: args.productName,
      brandOwner: args.brandOwner,
      category: args.category,
      catalogUnit: args.catalogUnit,
      servingGramsPerUnit: args.servingGramsPerUnit,
      tenantIngredients,
    });
  },
});

/** Resolve create-form cost from lookup metadata. */
export const resolveCreateLookupCost = action({
  args: {
    barcode: v.optional(v.string()),
    productName: v.string(),
    brandOwner: v.optional(v.string()),
    category: v.optional(v.string()),
    catalogUnit: v.string(),
    servingGramsPerUnit: v.optional(v.number()),
    formCost: v.number(),
    lookupUsed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    requireKitchenStaff(auth);
    return {
      costPerUnit: await resolveLookupCostForCreate(ctx, args),
    };
  },
});

/** Import crowd-sourced retail cost from Open Prices when a barcode exists. */
export const applyCostToIngredient = action({
  args: {
    docId: v.id("ingredients"),
    barcode: v.optional(v.string()),
    productName: v.string(),
    brandOwner: v.optional(v.string()),
    category: v.optional(v.string()),
    catalogUnit: v.string(),
    servingGramsPerUnit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    requireKitchenStaff(auth);
    return applyLookupCostToIngredient(ctx, auth, args.docId, args);
  },
});

/** Import only a lookup product photo onto an existing ingredient. */
export const applyImageToIngredient = action({
  args: {
    docId: v.id("ingredients"),
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    requireKitchenStaff(auth);

    const trimmed = args.imageUrl.trim();
    if (!trimmed) {
      return { imageApplied: false };
    }

    const imageApplied = await applyCatalogImageFromUrl(
      ctx,
      args.docId,
      trimmed,
    );
    return { imageApplied };
  },
});
