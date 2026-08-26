/** Infer Capsule AllergenCode values from label ingredients text or OFF tags. */

export type ParsedAllergens = {
  allergens: string[];
  isGlutenFree: boolean;
  allergenNote: string;
};

const ALLERGEN_PATTERNS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: "milk", pattern: /\b(milk|dairy|cream|cheese|whey|casein|lactose|butter)\b/i },
  { code: "eggs", pattern: /\b(eggs?|albumin|mayonnaise|meringue)\b/i },
  { code: "fish", pattern: /\b(fish|anchov(?:y|ies)|cod|salmon|tuna|tilapia|sardine)\b/i },
  {
    code: "crustacean_shellfish",
    pattern: /\b(shrimp|crab|lobster|crayfish|prawn|shellfish|crustacean)\b/i,
  },
  {
    code: "tree_nuts",
    pattern: /\b(almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|tree\s*nuts?)\b/i,
  },
  { code: "peanuts", pattern: /\b(peanuts?|groundnut)\b/i },
  {
    code: "wheat",
    pattern: /\b(wheat|gluten|semolina|durum|bulgur|spelt|farina)\b/i,
  },
  { code: "soybeans", pattern: /\b(soy|soya|soybean|tofu|edamame|lecithin)\b/i },
  { code: "sesame", pattern: /\b(sesame|tahini)\b/i },
];

const OFF_TAG_TO_CODE: Record<string, string> = {
  "en:milk": "milk",
  "en:eggs": "eggs",
  "en:fish": "fish",
  "en:crustaceans": "crustacean_shellfish",
  "en:nuts": "tree_nuts",
  "en:tree-nuts": "tree_nuts",
  "en:peanuts": "peanuts",
  "en:gluten": "wheat",
  "en:soybeans": "soybeans",
  "en:sesame-seeds": "sesame",
  "en:sesame": "sesame",
};

function unique(codes: string[]) {
  return [...new Set(codes)];
}

export function parseAllergensFromIngredientsText(
  ingredientsText?: string | null,
): ParsedAllergens {
  const text = ingredientsText?.trim() ?? "";
  if (!text) {
    return {
      allergens: [],
      isGlutenFree: false,
      allergenNote: "No ingredient label text — set allergens manually.",
    };
  }

  const declaresGlutenFree = /\bgluten[\s-]*free\b/i.test(text);
  const found = ALLERGEN_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ code }) => code,
  );
  let allergens = unique(found);
  if (declaresGlutenFree) {
    allergens = allergens.filter((code) => code !== "wheat");
  }

  return {
    allergens,
    isGlutenFree: declaresGlutenFree,
    allergenNote: allergens.length
      ? "Allergens inferred from the product ingredient list — verify before service."
      : declaresGlutenFree
        ? "Marked gluten-free on the label; no other allergens detected in text."
        : "No allergens detected in ingredient text — verify manually.",
  };
}

export function parseAllergensFromOffTags(
  tags?: readonly string[] | null,
  labelTags?: readonly string[] | null,
): ParsedAllergens {
  const tagList = tags ?? [];
  const labelList = labelTags ?? [];
  if (tagList.length === 0 && labelList.length === 0) {
    return {
      allergens: [],
      isGlutenFree: false,
      allergenNote: "No allergens listed in Open Food Facts — verify manually.",
    };
  }

  const allergens = unique(
    tagList
      .map((tag) => OFF_TAG_TO_CODE[tag.toLowerCase()] ?? OFF_TAG_TO_CODE[tag])
      .filter(Boolean) as string[],
  );
  const declaresGlutenFree = [...tagList, ...labelList].some((tag) =>
    /gluten-free|no-gluten/i.test(tag),
  );
  const isGlutenFree = declaresGlutenFree && !allergens.includes("wheat");
  return {
    allergens,
    isGlutenFree,
    allergenNote: allergens.length
      ? "Allergens from Open Food Facts label data — verify before service."
      : "No allergens listed in Open Food Facts — verify manually.",
  };
}
