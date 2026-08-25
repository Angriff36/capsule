/**
 * Maps the unit words TPP prints onto the Capsule measure enum.
 *
 * Capsule stores a fixed unit list. TPP prints plurals and qualified forms
 * such as "tsp - dry". An unmapped unit is reported, never silently coerced
 * into something the kitchen did not mean.
 */

export const CAPSULE_UNITS = [
  "each",
  "gram",
  "kilogram",
  "ounce",
  "pound",
  "milliliter",
  "liter",
  "teaspoon",
  "tablespoon",
  "cup",
  "pint",
  "quart",
  "gallon",
  "portion",
  "serving",
  "batch",
  "melon",
  "bottle",
] as const;

export type CapsuleUnit = (typeof CAPSULE_UNITS)[number];

const ALIASES: Record<string, CapsuleUnit> = {
  ea: "each",
  eaches: "each",
  g: "gram",
  grams: "gram",
  kg: "kilogram",
  kilograms: "kilogram",
  oz: "ounce",
  ounces: "ounce",
  lb: "pound",
  lbs: "pound",
  pounds: "pound",
  ml: "milliliter",
  milliliters: "milliliter",
  l: "liter",
  liters: "liter",
  tsp: "teaspoon",
  teaspoons: "teaspoon",
  tbsp: "tablespoon",
  tablespoons: "tablespoon",
  cups: "cup",
  pints: "pint",
  quarts: "quart",
  qt: "quart",
  gallons: "gallon",
  gal: "gallon",
  portions: "portion",
  servings: "serving",
  batches: "batch",
  melons: "melon",
  bottles: "bottle",
};

/**
 * Read a TPP unit word. Returns undefined when the unit has no Capsule
 * equivalent, for example the purchasing unit "Case".
 */
export function toCapsuleUnit(
  value: string | undefined,
): CapsuleUnit | undefined {
  if (value === undefined) return undefined;
  // "Oz - Fld" and "tsp - dry" qualify the unit after a dash.
  const base = value.split("-")[0]!.trim().toLowerCase().replace(/\.$/, "");
  if (base.length === 0) return undefined;
  if ((CAPSULE_UNITS as readonly string[]).includes(base)) {
    return base as CapsuleUnit;
  }
  return ALIASES[base];
}
