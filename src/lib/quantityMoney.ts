/**
 * Quantity conversion, line money, pack rounding, and coverage for the
 * authored event-menu / component-cost path. AC-406 / BE §6.4: conversion
 * happens only between compatible dimensions; count, package, and density
 * crossings need a recorded mapping — never a default to `each`, `1`, or a
 * priced $0; a missing cost is incomplete coverage. Pure module.
 */

import { LedgerMoney } from "./ledgerMoney";

export type RecordedUnitMapping = {
  ingredientId?: string | null;
  kind: "pack" | "density" | "portion" | "yield";
  unit: string;
  equalsQuantity: number;
  equalsUnit: string;
};

export type QuantityConvertResult =
  | { quantity: number; status: "resolved" }
  | {
      quantity: null;
      status: "unresolved_no_mapping" | "unresolved_no_density";
    };

export type PackRoundRecord = {
  required: number;
  packageSize: number;
  rounded: number;
  remainder: number;
};

type LineCostInput = {
  quantity: number | null;
  waste?: number;
  costPerUnit: number;
};

type PackRoundInput = { required: number; packageSize: number };
type CoverageInput = { pricedLineCount: number; incompleteLineCount: number };

/** Exact US customary factors; no density or count size lives here. */
const UNITS: Record<string, readonly [string, number]> = {
  gram: ["mass", 1],
  kilogram: ["mass", 1_000],
  ounce: ["mass", 28.349523125],
  pound: ["mass", 453.59237],
  milliliter: ["volume", 1],
  liter: ["volume", 1_000],
  teaspoon: ["volume", 4.92892159375],
  tablespoon: ["volume", 14.78676478125],
  cup: ["volume", 236.5882365],
  pint: ["volume", 473.176473],
  quart: ["volume", 946.352946],
  gallon: ["volume", 3_785.411784],
  fluid_ounce: ["volume", 29.5735295625],
};

/** Count labels never auto-convert to another unit. */
const COUNT_UNITS = new Set(
  "each portion serving batch melon bottle piece slice pizza package case can tub".split(
    " ",
  ),
);

const knownUnit = (unit: string) => COUNT_UNITS.has(unit) || unit in UNITS;

const unresolved = (
  status: "unresolved_no_mapping" | "unresolved_no_density",
): QuantityConvertResult => ({ quantity: null, status });

function sameDimensionRatio(from: string, to: string): number | null {
  if (from === to) return 1;
  const source = UNITS[from];
  const target = UNITS[to];
  return source && target && source[0] === target[0]
    ? source[1] / target[1]
    : null;
}

function usableMapping(mapping: RecordedUnitMapping): boolean {
  return Number.isFinite(mapping.equalsQuantity) && mapping.equalsQuantity > 0;
}

export class QuantityMoney {
  convert(input: {
    quantity: number;
    from: string;
    to: string;
    mappings?: readonly RecordedUnitMapping[];
    ingredientId?: string;
  }): QuantityConvertResult {
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity)) return unresolved("unresolved_no_mapping");
    if (input.from === input.to) return { quantity, status: "resolved" };
    if (!knownUnit(input.from) || !knownUnit(input.to)) {
      return unresolved("unresolved_no_mapping");
    }
    // Only the named ingredient's mappings apply; never steal another's.
    const scope = (input.mappings ?? []).filter((mapping) =>
      input.ingredientId == null
        ? mapping.ingredientId == null
        : mapping.ingredientId === input.ingredientId,
    );
    let value = quantity;
    let unit = input.from;
    if (COUNT_UNITS.has(unit)) {
      const mapping = this.packMapping(scope, unit);
      if (!mapping) return unresolved("unresolved_no_mapping");
      value *= mapping.equalsQuantity;
      unit = mapping.equalsUnit;
    }
    const toCount = COUNT_UNITS.has(input.to);
    const toPack = toCount ? this.packMapping(scope, input.to) : null;
    if (toCount && !toPack) return unresolved("unresolved_no_mapping");
    const target = toPack ? toPack.equalsUnit : input.to;
    const result = this.convertBase({ value, from: unit, to: target, scope });
    if (result.status !== "resolved") return result;
    if (!toPack) return result;
    const scaled = result.quantity / toPack.equalsQuantity;
    return { quantity: scaled, status: "resolved" };
  }

  /** Missing quantity or missing cost is incomplete coverage, not $0. */
  lineCost(input: LineCostInput): number | null {
    const quantity = input.quantity;
    if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }
    if (!Number.isFinite(input.costPerUnit) || input.costPerUnit <= 0) {
      return null;
    }
    const waste = input.waste;
    const wasteFactor =
      waste != null && Number.isFinite(waste) && waste > 0 ? waste : 1;
    return LedgerMoney.fromDollars(input.costPerUnit)
      .times(quantity * wasteFactor)
      .toDollars();
  }

  /** Pack rounding is explicit: need vs ordered, with the remainder. */
  packRound(input: PackRoundInput): PackRoundRecord | null {
    const { required, packageSize } = input;
    if (!Number.isFinite(required) || !Number.isFinite(packageSize)) {
      return null;
    }
    if (packageSize <= 0 || required < 0) return null;
    if (required === 0) {
      return { required: 0, packageSize, rounded: 0, remainder: 0 };
    }
    const rounded = Math.ceil(required / packageSize - 1e-9) * packageSize;
    return { required, packageSize, rounded, remainder: rounded - required };
  }

  /** Zero priced lines is not complete, even when the money is $0. */
  isCompleteCoverage(input: CoverageInput): boolean {
    return input.pricedLineCount > 0 && input.incompleteLineCount === 0;
  }

  private packMapping(scope: readonly RecordedUnitMapping[], unit: string) {
    return (
      scope.find(
        (mapping) =>
          usableMapping(mapping) &&
          (mapping.kind === "pack" || mapping.kind === "portion") &&
          mapping.unit === unit,
      ) ?? null
    );
  }

  private convertBase(step: {
    value: number;
    from: string;
    to: string;
    scope: readonly RecordedUnitMapping[];
  }): QuantityConvertResult {
    const direct = sameDimensionRatio(step.from, step.to);
    if (direct != null) {
      return { quantity: step.value * direct, status: "resolved" };
    }
    const density = step.scope.find(
      (mapping) =>
        mapping.kind === "density" &&
        usableMapping(mapping) &&
        (mapping.unit === step.from || mapping.unit === step.to),
    );
    if (!density) return unresolved("unresolved_no_density");
    if (density.unit === step.from) {
      const out = sameDimensionRatio(density.equalsUnit, step.to);
      if (out == null) return unresolved("unresolved_no_density");
      const crossed = step.value * density.equalsQuantity * out;
      return { quantity: crossed, status: "resolved" };
    }
    const into = sameDimensionRatio(step.from, density.equalsUnit);
    if (into == null) return unresolved("unresolved_no_density");
    const divided = (step.value * into) / density.equalsQuantity;
    return { quantity: divided, status: "resolved" };
  }
}
