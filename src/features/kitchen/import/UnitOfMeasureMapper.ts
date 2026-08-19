/** Closed UnitOfMeasure vocabulary from culinary/ingredient.manifest. */
export const UNIT_OF_MEASURE = [
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
  // Kept in step with the enum: the printed prep sheets use these and the
  // catalog units cannot express them.
  "serving",
  "batch",
  "melon",
  "bottle",
] as const;

export type UnitOfMeasure = (typeof UNIT_OF_MEASURE)[number];

/**
 * Units offered in manual unit pickers. "melon" stays in the closed
 * vocabulary so the prep-sheet importer and existing rows keep validating,
 * but it reads as leaked test data in a dropdown, so forms omit it.
 */
export const SELECTABLE_UNITS: readonly UnitOfMeasure[] =
  UNIT_OF_MEASURE.filter((unit) => unit !== "melon");

/** Picker options for an existing row: selectable units plus the row's current import-only unit. */
export function unitOptionsFor(
  current?: string | null,
): readonly UnitOfMeasure[] {
  if (!current || SELECTABLE_UNITS.includes(current as UnitOfMeasure)) {
    return SELECTABLE_UNITS;
  }
  return [...SELECTABLE_UNITS, current as UnitOfMeasure];
}

const ALIASES: Record<string, UnitOfMeasure> = {
  each: "each",
  ea: "each",
  piece: "each",
  pieces: "each",
  pc: "each",
  pcs: "each",
  clove: "each",
  cloves: "each",
  can: "each",
  cans: "each",
  bunch: "each",
  bunches: "each",
  small: "each",
  medium: "each",
  large: "each",
  g: "gram",
  gram: "gram",
  grams: "gram",
  kg: "kilogram",
  kilogram: "kilogram",
  kilograms: "kilogram",
  oz: "ounce",
  ounce: "ounce",
  ounces: "ounce",
  lb: "pound",
  lbs: "pound",
  pound: "pound",
  pounds: "pound",
  ml: "milliliter",
  milliliter: "milliliter",
  milliliters: "milliliter",
  l: "liter",
  liter: "liter",
  liters: "liter",
  tsp: "teaspoon",
  tsps: "teaspoon",
  teaspoon: "teaspoon",
  teaspoons: "teaspoon",
  tbsp: "tablespoon",
  tbsps: "tablespoon",
  tablespoon: "tablespoon",
  tablespoons: "tablespoon",
  t: "tablespoon",
  cup: "cup",
  cups: "cup",
  c: "cup",
  pt: "pint",
  pint: "pint",
  pints: "pint",
  pts: "pint",
  qt: "quart",
  qts: "quart",
  quart: "quart",
  quarts: "quart",
  gal: "gallon",
  gals: "gallon",
  gallon: "gallon",
  gallons: "gallon",
  portion: "portion",
  portions: "portion",
  // serving stays mapped to portion: this alias table is for the component/
  // ingredient importer, where "yields 6 servings" has to land on a unit that
  // costing can convert. `serving` itself is in the vocabulary for prep
  // templates, which are instructions and never costed.
  serving: "portion",
  servings: "portion",
  batch: "batch",
  batches: "batch",
  melon: "melon",
  melons: "melon",
  bottle: "bottle",
  bottles: "bottle",
};

export class UnitOfMeasureMapper {
  map(raw: string | undefined | null): UnitOfMeasure {
    const key = String(raw ?? "")
      .trim()
      .toLowerCase()
      .replace(/\.$/, "");
    if (!key) return "each";
    return ALIASES[key] ?? "each";
  }

  isKnownAlias(raw: string): boolean {
    const key = raw.trim().toLowerCase().replace(/\.$/, "");
    return key in ALIASES;
  }
}
