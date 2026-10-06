// Revision-2 culinary model (2026-09-14) — units, conversions, basis.
//
// Units are NOT opaque labels. Mass and volume units convert automatically
// inside their dimension with the documented factors below (the same mass
// factors IngredientDemand.syncFromContributions already carries). Crossing a
// dimension needs a confirmed density on the item; count units (case, tub,
// slice, pizza, batch, serving) need an item-specific mapping. Anything else
// is UNRESOLVED and is reported, never guessed.

export type UnitCode =
  | "each"
  | "gram"
  | "kilogram"
  | "ounce"
  | "pound"
  | "milliliter"
  | "liter"
  | "teaspoon"
  | "tablespoon"
  | "cup"
  | "pint"
  | "quart"
  | "gallon"
  | "portion"
  | "serving"
  | "batch"
  | "melon"
  | "bottle"
  | "fluid_ounce"
  | "piece"
  | "slice"
  | "pizza"
  | "package"
  | "case"
  | "can"
  | "tub";

export type Dimension = "mass" | "volume" | "count";
export type MeasurementSystem = "us_customary" | "metric" | "none";

export interface UnitDefinition {
  dimension: Dimension;
  system: MeasurementSystem;
  /** grams for mass, milliliters for volume, 1 for count */
  toBase: number;
  label: string;
}

export const UNITS: Record<UnitCode, UnitDefinition> = {
  gram: { dimension: "mass", system: "metric", toBase: 1, label: "g" },
  kilogram: { dimension: "mass", system: "metric", toBase: 1000, label: "kg" },
  ounce: { dimension: "mass", system: "us_customary", toBase: 28.349523125, label: "oz" },
  pound: { dimension: "mass", system: "us_customary", toBase: 453.59237, label: "lb" },
  milliliter: { dimension: "volume", system: "metric", toBase: 1, label: "ml" },
  liter: { dimension: "volume", system: "metric", toBase: 1000, label: "L" },
  fluid_ounce: { dimension: "volume", system: "us_customary", toBase: 29.5735295625, label: "fl oz" },
  teaspoon: { dimension: "volume", system: "us_customary", toBase: 4.92892159375, label: "tsp" },
  tablespoon: { dimension: "volume", system: "us_customary", toBase: 14.78676478125, label: "tbsp" },
  cup: { dimension: "volume", system: "us_customary", toBase: 236.5882365, label: "cup" },
  pint: { dimension: "volume", system: "us_customary", toBase: 473.176473, label: "pt" },
  quart: { dimension: "volume", system: "us_customary", toBase: 946.352946, label: "qt" },
  gallon: { dimension: "volume", system: "us_customary", toBase: 3785.411784, label: "gal" },
  each: { dimension: "count", system: "none", toBase: 1, label: "each" },
  portion: { dimension: "count", system: "none", toBase: 1, label: "portion" },
  serving: { dimension: "count", system: "none", toBase: 1, label: "serving" },
  batch: { dimension: "count", system: "none", toBase: 1, label: "batch" },
  melon: { dimension: "count", system: "none", toBase: 1, label: "melon" },
  bottle: { dimension: "count", system: "none", toBase: 1, label: "bottle" },
  piece: { dimension: "count", system: "none", toBase: 1, label: "piece" },
  slice: { dimension: "count", system: "none", toBase: 1, label: "slice" },
  pizza: { dimension: "count", system: "none", toBase: 1, label: "pizza" },
  package: { dimension: "count", system: "none", toBase: 1, label: "package" },
  case: { dimension: "count", system: "none", toBase: 1, label: "case" },
  can: { dimension: "count", system: "none", toBase: 1, label: "can" },
  tub: { dimension: "count", system: "none", toBase: 1, label: "tub" },
};

export const isUnitCode = (value: unknown): value is UnitCode =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(UNITS, value);

export type QuantityInputResult =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "parsed"; quantity: number; unit: UnitCode };

export const ENTRY_UNIT_ALIASES: ReadonlyMap<string, UnitCode> = new Map([
  ["ea", "each"], ["each", "each"], ["ct", "each"], ["count", "each"],
  ["g", "gram"], ["gram", "gram"], ["grams", "gram"],
  ["kg", "kilogram"], ["kilogram", "kilogram"], ["kilograms", "kilogram"],
  ["oz", "ounce"], ["ounce", "ounce"], ["ounces", "ounce"],
  ["lb", "pound"], ["lbs", "pound"], ["pound", "pound"], ["pounds", "pound"], ["#", "pound"],
  ["ml", "milliliter"], ["milliliter", "milliliter"], ["milliliters", "milliliter"],
  ["l", "liter"], ["liter", "liter"], ["liters", "liter"],
  ["fl oz", "fluid_ounce"], ["fluid ounce", "fluid_ounce"], ["fluid ounces", "fluid_ounce"],
  ["tsp", "teaspoon"], ["tsps", "teaspoon"], ["teaspoon", "teaspoon"], ["teaspoons", "teaspoon"],
  ["tbsp", "tablespoon"], ["tbsps", "tablespoon"], ["tablespoon", "tablespoon"], ["tablespoons", "tablespoon"],
  ["cup", "cup"], ["cups", "cup"], ["pt", "pint"], ["pts", "pint"], ["pint", "pint"], ["pints", "pint"],
  ["qt", "quart"], ["qts", "quart"], ["quart", "quart"], ["quarts", "quart"],
  ["gal", "gallon"], ["gallon", "gallon"], ["gallons", "gallon"],
  ["portion", "portion"], ["portions", "portion"], ["serving", "serving"], ["servings", "serving"],
  ["batch", "batch"], ["batches", "batch"], ["bottle", "bottle"], ["bottles", "bottle"],
  ["piece", "piece"], ["pieces", "piece"], ["slice", "slice"], ["slices", "slice"],
  ["pizza", "pizza"], ["pizzas", "pizza"], ["package", "package"], ["packages", "package"],
  ["case", "case"], ["cases", "case"], ["can", "can"], ["cans", "can"], ["tub", "tub"], ["tubs", "tub"],
]);

const VULGAR_FRACTIONS: Record<string, string> = {
  "¼": " 1/4",
  "½": " 1/2",
  "¾": " 3/4",
  "⅓": " 1/3",
  "⅔": " 2/3",
  "⅛": " 1/8",
  "⅜": " 3/8",
  "⅝": " 5/8",
  "⅞": " 7/8",
};

function numberFromEntry(raw: string): number | null {
  const mixed = raw.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    return denominator === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / denominator;
  }
  const fraction = raw.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parse the compact quantity notation staff use at the bench. A bare number
 * retains the caller's current unit; known aliases normalize to UnitCode so
 * the same value can feed the demand engine without a second conversion map.
 */
export function parseQuantityInput(
  input: string,
  fallbackUnit: UnitCode,
  allowedUnits?: readonly UnitCode[],
): QuantityInputResult {
  const normalized = input
    .trim()
    .replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (fraction) => VULGAR_FRACTIONS[fraction] ?? fraction)
    .replace(/\s+/g, " ");
  if (!normalized) return { status: "empty" };
  const match = normalized.match(
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+)\s*(.*?)$/,
  );
  if (!match) {
    return { status: "invalid", message: "Enter a positive quantity, such as 2 lb or 500 g." };
  }
  const quantity = numberFromEntry(match[1]);
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) {
    return { status: "invalid", message: "Quantity must be greater than zero." };
  }
  const rawUnit = match[2].trim();
  if (!rawUnit) {
    return allowedUnits && !allowedUnits.includes(fallbackUnit)
      ? { status: "invalid", message: `"${fallbackUnit}" is not available for this recipe line.` }
      : { status: "parsed", quantity, unit: fallbackUnit };
  }
  // Kitchen shorthand distinguishes lowercase t (teaspoon) from uppercase T
  // (tablespoon) before the remaining aliases are normalized.
  const lowerUnit = rawUnit.toLowerCase();
  const unit = rawUnit === "t"
    ? "teaspoon"
    : rawUnit === "T"
      ? "tablespoon"
      : ENTRY_UNIT_ALIASES.get(lowerUnit) ??
        (isUnitCode(lowerUnit)
          ? lowerUnit
          : isUnitCode(lowerUnit.replaceAll("_", " "))
            ? lowerUnit.replaceAll("_", " ")
            : isUnitCode(lowerUnit.replaceAll(" ", "_"))
              ? lowerUnit.replaceAll(" ", "_")
              : undefined);
  if (!isUnitCode(unit)) {
    return { status: "invalid", message: `"${rawUnit}" is not a recognized kitchen unit.` };
  }
  if (allowedUnits && !allowedUnits.includes(unit)) {
    return { status: "invalid", message: `"${rawUnit}" is not available for this recipe line.` };
  }
  return { status: "parsed", quantity, unit };
}

export type QuantityBasis = "as_purchased" | "as_produced" | "raw" | "cooked" | "unknown";

export type UnitStatus =
  | "resolved"
  | "unresolved_no_mapping"
  | "unresolved_no_density"
  | "unresolved_ambiguous_source";

export type BasisStatus = "resolved" | "basis_unknown" | "yield_not_confirmed";

export type ItemUnitMappingKind = "pack" | "density" | "portion" | "yield";

/** Shape of an ItemUnitMapping row as the engine needs it (ids are opaque strings). */
export interface ItemUnitMappingLike {
  ingredientId?: string | null;
  componentId?: string | null;
  kind: ItemUnitMappingKind;
  unit: UnitCode;
  equalsQuantity: number;
  equalsUnit: UnitCode;
  fromBasis?: QuantityBasis | null;
  toBasis?: QuantityBasis | null;
}

export interface ConversionStep {
  from: UnitCode;
  to: UnitCode;
  factor: number;
  via: "dimension" | "pack" | "density";
}

export interface ConversionResult {
  quantity: number;
  unit: UnitCode;
  status: UnitStatus;
  steps: ConversionStep[];
}

export interface ItemScope {
  itemKind: "ingredient" | "component";
  itemId: string;
}

export type LineConversionDescription =
  | { status: "resolved"; quantity: number }
  | { status: "unresolved"; reason: string }
  | { status: "no-catalog-unit" };

/**
 * Describe the exact conversion culinary demand will use for a recipe line.
 * Catalog imports can retain TPP labels, so resolve those before attempting a
 * conversion instead of pretending they are already UnitCodes.
 */
export function describeLineConversion(
  quantity: number,
  unit: UnitCode,
  catalogUnit: string | null | undefined,
  mappings: readonly ItemUnitMappingLike[] = [],
  scope?: ItemScope,
): LineConversionDescription {
  if (!catalogUnit?.trim()) return { status: "no-catalog-unit" };
  const normalizedCatalogUnit = normalizeUnit(catalogUnit);
  if (!normalizedCatalogUnit) {
    return { status: "unresolved", reason: `This ingredient is stocked in "${catalogUnit}", which can't be converted. Enter it in ${catalogUnit}.` };
  }
  const conversion = convertQuantity(quantity, unit, normalizedCatalogUnit, mappings, scope);
  if (conversion.status === "resolved") {
    return { status: "resolved", quantity: conversion.quantity };
  }
  const reason = conversion.status === "unresolved_no_density"
    ? `Can't turn a volume into a weight for this ingredient yet. Enter it in ${normalizedCatalogUnit}, or add how much a cup weighs on the ingredient.`
    : conversion.status === "unresolved_no_mapping"
      ? `Can't turn this into ${normalizedCatalogUnit} yet. Enter it in ${normalizedCatalogUnit}, or add how much one piece or pack is on the ingredient.`
      : "That unit could mean more than one thing. Pick a clearer one, such as fl oz or oz.";
  return { status: "unresolved", reason };
}

const mappingsFor = (mappings: readonly ItemUnitMappingLike[], scope: ItemScope | undefined) =>
  scope
    ? mappings.filter((m) =>
        scope.itemKind === "ingredient" ? m.ingredientId === scope.itemId : m.componentId === scope.itemId,
      )
    : [];

const sameDimensionFactor = (from: UnitCode, to: UnitCode): number | null => {
  const a = UNITS[from];
  const b = UNITS[to];
  if (a.dimension !== b.dimension) return null;
  if (a.dimension === "count") return from === to ? 1 : null;
  return a.toBase / b.toBase;
};

/**
 * Convert a quantity between units for one item. Same unit is trivially
 * resolved. Same dimension converts with the documented factor. Crossing
 * dimensions or leaving a count unit needs an item mapping; without one the
 * result keeps the source quantity and unit with an unresolved status.
 */
export function convertQuantity(
  quantity: number,
  from: UnitCode,
  to: UnitCode,
  mappings: readonly ItemUnitMappingLike[] = [],
  scope?: ItemScope,
  depth = 0,
): ConversionResult {
  if (from === to) return { quantity, unit: to, status: "resolved", steps: [] };
  const direct = sameDimensionFactor(from, to);
  if (direct != null) {
    return {
      quantity: quantity * direct,
      unit: to,
      status: "resolved",
      steps: [{ from, to, factor: direct, via: "dimension" }],
    };
  }
  if (depth > 4) return { quantity, unit: from, status: "unresolved_no_mapping", steps: [] };
  const scoped = mappingsFor(mappings, scope);

  // Leaving a count unit: a pack mapping says what one <from> equals.
  if (UNITS[from].dimension === "count") {
    const pack = scoped.find((m) => (m.kind === "pack" || m.kind === "portion") && m.unit === from);
    if (pack) {
      const next = convertQuantity(quantity * pack.equalsQuantity, pack.equalsUnit, to, mappings, scope, depth + 1);
      return {
        ...next,
        steps: [{ from, to: pack.equalsUnit, factor: pack.equalsQuantity, via: "pack" }, ...next.steps],
      };
    }
    return { quantity, unit: from, status: "unresolved_no_mapping", steps: [] };
  }
  // Entering a count unit: invert a pack mapping declared on the target unit.
  if (UNITS[to].dimension === "count") {
    const pack = scoped.find((m) => (m.kind === "pack" || m.kind === "portion") && m.unit === to);
    if (pack) {
      const toPackUnit = convertQuantity(quantity, from, pack.equalsUnit, mappings, scope, depth + 1);
      if (toPackUnit.status !== "resolved") return { quantity, unit: from, status: toPackUnit.status, steps: [] };
      return {
        quantity: toPackUnit.quantity / pack.equalsQuantity,
        unit: to,
        status: "resolved",
        steps: [...toPackUnit.steps, { from: pack.equalsUnit, to, factor: 1 / pack.equalsQuantity, via: "pack" }],
      };
    }
    return { quantity, unit: from, status: "unresolved_no_mapping", steps: [] };
  }
  // mass <-> volume needs a density mapping on the item: <unit> equals <equalsQuantity equalsUnit>.
  const density = scoped.find(
    (m) => m.kind === "density" && UNITS[m.unit].dimension !== UNITS[m.equalsUnit].dimension,
  );
  if (!density) return { quantity, unit: from, status: "unresolved_no_density", steps: [] };
  const fromDim = UNITS[from].dimension;
  const densityFrom = UNITS[density.unit].dimension === fromDim ? density.unit : density.equalsUnit;
  const densityTo = densityFrom === density.unit ? density.equalsUnit : density.unit;
  const densityFactor = densityFrom === density.unit ? density.equalsQuantity : 1 / density.equalsQuantity;
  const first = convertQuantity(quantity, from, densityFrom, mappings, scope, depth + 1);
  if (first.status !== "resolved") return { quantity, unit: from, status: "unresolved_no_density", steps: [] };
  const crossed = first.quantity * densityFactor;
  const last = convertQuantity(crossed, densityTo, to, mappings, scope, depth + 1);
  if (last.status !== "resolved") return { quantity, unit: from, status: "unresolved_no_density", steps: [] };
  return {
    quantity: last.quantity,
    unit: to,
    status: "resolved",
    steps: [...first.steps, { from: densityFrom, to: densityTo, factor: densityFactor, via: "density" }, ...last.steps],
  };
}

export interface BasisResult {
  quantity: number;
  unit: UnitCode;
  status: BasisStatus;
  yieldFactor: number | null;
}

/**
 * Bring a stated quantity from its basis to the purchase basis. as_purchased
 * and as_produced need nothing. raw is the purchase state for a raw item.
 * cooked needs a CONFIRMED yield mapping (1 raw -> Y cooked) on the item;
 * without one the quantity is returned unchanged and flagged. unknown or
 * null basis is flagged and never converted.
 */
export function toPurchaseBasis(
  quantity: number,
  unit: UnitCode,
  basis: QuantityBasis | null | undefined,
  mappings: readonly ItemUnitMappingLike[] = [],
  scope?: ItemScope,
): BasisResult {
  if (basis === "as_purchased" || basis === "as_produced" || basis === "raw") {
    return { quantity, unit, status: "resolved", yieldFactor: null };
  }
  if (basis === "cooked") {
    const scoped = mappingsFor(mappings, scope).filter(
      (m) => m.kind === "yield" && m.toBasis === "cooked" && (m.fromBasis === "raw" || m.fromBasis === "as_purchased"),
    );
    // Mapping reads: equalsQuantity <equalsUnit> raw -> 1 <unit> cooked? No: declared as
    // 1 <unit> raw equals <equalsQuantity equalsUnit> cooked. Invert to get raw.
    const mapping = scoped[0];
    if (!mapping) return { quantity, unit, status: "yield_not_confirmed", yieldFactor: null };
    const cookedInMappingUnit = convertQuantity(quantity, unit, mapping.equalsUnit, mappings, scope);
    if (cookedInMappingUnit.status !== "resolved") return { quantity, unit, status: "yield_not_confirmed", yieldFactor: null };
    const rawInMappingUnit = cookedInMappingUnit.quantity / mapping.equalsQuantity;
    const back = convertQuantity(rawInMappingUnit, mapping.unit, unit, mappings, scope);
    if (back.status !== "resolved") return { quantity, unit, status: "yield_not_confirmed", yieldFactor: null };
    return { quantity: back.quantity, unit, status: "resolved", yieldFactor: mapping.equalsQuantity };
  }
  return { quantity, unit, status: "basis_unknown", yieldFactor: null };
}

/** TPP unit descriptions mapped to Capsule units; ambiguous sources stay null. */
export const TPP_UNIT_ALIASES: Record<string, UnitCode | null> = {
  Each: "each",
  Piece: "piece",
  Slice: "slice",
  Pizza: "pizza",
  Package: "package",
  Case: "case",
  Can: "can",
  Bottles: "bottle",
  Gram: "gram",
  Pound: "pound",
  "Oz - Dry": "ounce",
  "Oz - Fld": "fluid_ounce",
  "Cup - Fld": "cup",
  Cup: null,
  "Tblsp - Dry": "tablespoon",
  "Tblsp - Fld": "tablespoon",
  "Tsp - Dry": "teaspoon",
  "Tsp - Fld": "teaspoon",
  Pint: "pint",
  Quart: "quart",
  Gallon: "gallon",
  Liter: "liter",
  Milliliter: "milliliter",
  Serving: "serving",
  "Recipe Portion": "portion",
  Recipe: "batch",
  "Times Recipe": "batch",
  Melon: "melon",
};

export interface UnitAliasResult {
  unit: UnitCode | null;
  status: UnitStatus;
  sourceLabel: string;
}

export const resolveTppUnit = (label: string): UnitAliasResult => {
  const trimmed = label.trim();
  if (!Object.prototype.hasOwnProperty.call(TPP_UNIT_ALIASES, trimmed)) {
    return { unit: null, status: "unresolved_no_mapping", sourceLabel: trimmed };
  }
  const unit = TPP_UNIT_ALIASES[trimmed];
  return unit
    ? { unit, status: "resolved", sourceLabel: trimmed }
    : { unit: null, status: "unresolved_ambiguous_source", sourceLabel: trimmed };
};

/** Resolve either a stored UnitCode or a supported imported TPP unit label. */
export function normalizeUnit(raw: string | null | undefined): UnitCode | null {
  if (!raw) return null;
  return isUnitCode(raw) ? raw : resolveTppUnit(raw).unit;
}

/** Pick a valid default for an empty flexible quantity field. */
export function fallbackUnitFor(
  raw: string | null | undefined,
  allowedUnits: readonly UnitCode[],
  defaultUnit: UnitCode = "each",
): UnitCode {
  const normalized = normalizeUnit(raw);
  return normalized && allowedUnits.includes(normalized) ? normalized : defaultUnit;
}

/** Format persisted line values for editing without exponent notation. */
export function formatQuantityEntry(quantity: number, unit: string): string {
  const formattedQuantity = quantity.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
  return `${formattedQuantity} ${normalizeUnit(unit) ?? unit}`;
}

/**
 * Round for storage and display without losing tiny amounts: a pinch of
 * saffron in pounds keeps at least four significant digits instead of
 * rounding to zero.
 */
export const roundTo = (value: number, places = 4) => {
  if (!Number.isFinite(value) || value === 0) return value;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const f = 10 ** Math.min(15, Math.max(places, 3 - magnitude));
  return Math.round(value * f) / f;
};
