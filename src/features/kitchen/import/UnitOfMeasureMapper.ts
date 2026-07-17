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
] as const;

export type UnitOfMeasure = (typeof UNIT_OF_MEASURE)[number];

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
  cup: "cup",
  cups: "cup",
  pt: "pint",
  pint: "pint",
  pints: "pint",
  qt: "quart",
  quart: "quart",
  quarts: "quart",
  gal: "gallon",
  gallon: "gallon",
  gallons: "gallon",
  portion: "portion",
  portions: "portion",
  serving: "portion",
  servings: "portion",
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
