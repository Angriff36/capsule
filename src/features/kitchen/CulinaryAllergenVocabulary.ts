/**
 * Closed AllergenCode vocabulary from culinary/ingredient.manifest
 * (US major food allergens + sesame per the FASTER Act).
 */
export const CULINARY_ALLERGENS = [
  { code: "milk", label: "Milk" },
  { code: "eggs", label: "Eggs" },
  { code: "fish", label: "Fish" },
  { code: "crustacean_shellfish", label: "Crustacean shellfish" },
  { code: "tree_nuts", label: "Tree nuts" },
  { code: "peanuts", label: "Peanuts" },
  { code: "wheat", label: "Wheat" },
  { code: "soybeans", label: "Soybeans" },
  { code: "sesame", label: "Sesame" },
] as const;

export type CulinaryAllergenCode = (typeof CULINARY_ALLERGENS)[number]["code"];

export const CULINARY_ALLERGEN_CODES = CULINARY_ALLERGENS.map(
  (allergen) => allergen.code,
);
