import { UnitOfMeasureMapper } from "../features/kitchen/import/UnitOfMeasureMapper";
import { recipeUnitDimension, recipeUnitRatio } from "./recipeUnitConversion";

/** Short suffix a cook reads beside a number. */
const SHORT: Record<string, string> = {
  gram: "g",
  kilogram: "kg",
  ounce: "oz",
  pound: "lb",
  milliliter: "ml",
  liter: "l",
  fluid_ounce: "fl oz",
  teaspoon: "tsp",
  tablespoon: "tbsp",
  cup: "cup",
  pint: "pt",
  quart: "qt",
  gallon: "gal",
};

/** Equivalents shown under a quantity, in reading order per dimension. */
const EQUIVALENTS: Record<string, readonly string[]> = {
  mass: ["ounce", "pound", "gram", "kilogram"],
  volume: ["cup", "fluid_ounce", "quart", "milliliter", "liter"],
};

const ALL_UNITS: Record<string, readonly string[]> = {
  mass: ["gram", "kilogram", "ounce", "pound"],
  volume: [
    "teaspoon",
    "tablespoon",
    "fluid_ounce",
    "cup",
    "pint",
    "quart",
    "gallon",
    "milliliter",
    "liter",
  ],
};

const mapper = new UnitOfMeasureMapper();

export function unitLabel(unit: string): string {
  return SHORT[unit] ?? unit.replace(/_/g, " ");
}

/** Units the stored unit converts to exactly; just itself for counts. */
export function convertibleUnits(storeUnit: string): readonly string[] {
  const dimension = recipeUnitDimension(storeUnit);
  return dimension ? ALL_UNITS[dimension]! : [storeUnit];
}

/**
 * Reads "2", "1.5", "1/2", "1 1/2" and an optional unit word ("2 lb",
 * "3cups"). Returns null when the number is missing or the word is unknown.
 */
export function parseQuantityText(
  text: string,
): { amount: number; unit: string | null } | null {
  const match = text
    .trim()
    .match(/^(\d+(?:\.\d+)?|\.\d+)(?:\s+(\d+)\/(\d+)|\/(\d+))?\s*(.*)$/);
  if (!match) return null;
  const [, whole, mixedTop, mixedBottom, fractionBottom, word] = match;
  let amount = Number(whole);
  if (mixedTop && mixedBottom) amount += Number(mixedTop) / Number(mixedBottom);
  if (fractionBottom) amount /= Number(fractionBottom);
  if (!Number.isFinite(amount)) return null;
  const rawUnit = (word ?? "").trim();
  if (!rawUnit) return { amount, unit: null };
  const unit = mapper.resolve(rawUnit);
  return unit ? { amount, unit } : null;
}

export function convertQuantity(
  amount: number,
  from: string,
  to: string,
): number | null {
  const ratio = recipeUnitRatio(from, to);
  return ratio == null ? null : amount * ratio;
}

export function formatQuantity(amount: number): string {
  const digits = Math.abs(amount) >= 100 ? 0 : Math.abs(amount) >= 10 ? 1 : 2;
  return String(Number(amount.toFixed(digits)));
}

/** "32 oz / 907 g": the stored unit first, then the common kitchen units. */
export function quantityEquivalents(
  amount: number,
  unit: string,
  storeUnit?: string,
): string[] {
  const dimension = recipeUnitDimension(unit);
  if (!dimension || !Number.isFinite(amount) || amount <= 0) return [];
  const targets = [
    ...(storeUnit && storeUnit !== unit ? [storeUnit] : []),
    ...EQUIVALENTS[dimension]!.filter(
      (target) => target !== unit && target !== storeUnit,
    ),
  ];
  const parts: string[] = [];
  for (const target of targets) {
    const converted = convertQuantity(amount, unit, target);
    if (converted == null || converted < 0.01 || converted >= 100000) continue;
    parts.push(`${formatQuantity(converted)} ${unitLabel(target)}`);
    if (parts.length === 3) break;
  }
  return parts;
}
