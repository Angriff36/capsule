// One rule for "what did this ingredient cost on a date" (PR03-06, BE-9.6).
//
// A receipt price (IngredientPriceObservation) is dated and names its vendor
// and order; the latest one effective on or before the costing date wins.
// Without one, the catalog price is used but marked undated. A $0 price, a
// missing price and a price in a unit the line cannot convert to are all
// "unknown" — never a free ingredient, so a total built on them can never be
// reported as complete.

import type { UnitCode } from "./units";

export interface PriceObservationLike {
  id: string;
  ingredientId: string;
  vendorId: string | null;
  vendorOrderId: string | null;
  unit: UnitCode;
  unitPrice: number;
  /** Receipt time; null = not yet recorded. */
  observedAt: number | null;
}

export interface CatalogPriceLike {
  unit: UnitCode;
  costPerUnit: number | null;
}

export type PriceAt =
  | {
      status: "known";
      source: "receipt";
      unitPrice: number;
      unit: UnitCode;
      effectiveAt: number;
      vendorId: string | null;
      vendorOrderId: string | null;
      observationId: string;
    }
  | {
      status: "known";
      source: "catalog";
      unitPrice: number;
      unit: UnitCode;
      /** The catalog price carries no date. */
      effectiveAt: null;
    }
  | { status: "unknown"; reason: "no price" | "priced at $0" };

const positive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Price of one ingredient on `asOf` (ms). `asOf` null = today: the newest
 * receipt. Receipts after `asOf` are ignored, so an old event keeps the
 * price it was bought at.
 */
export function ingredientPriceAt(
  catalog: CatalogPriceLike,
  observations: readonly PriceObservationLike[],
  asOf: number | null,
): PriceAt {
  let best: PriceObservationLike | null = null;
  let sawZero = false;
  for (const o of observations) {
    if (o.observedAt == null) continue;
    if (asOf != null && o.observedAt > asOf) continue;
    if (!positive(o.unitPrice)) {
      sawZero = true;
      continue;
    }
    if (
      !best ||
      o.observedAt > (best.observedAt ?? 0) ||
      (o.observedAt === best.observedAt && o.id > best.id)
    )
      best = o;
  }
  if (best)
    return {
      status: "known",
      source: "receipt",
      unitPrice: best.unitPrice,
      unit: best.unit,
      effectiveAt: best.observedAt ?? 0,
      vendorId: best.vendorId,
      vendorOrderId: best.vendorOrderId,
      observationId: best.id,
    };
  if (positive(catalog.costPerUnit))
    return {
      status: "known",
      source: "catalog",
      unitPrice: catalog.costPerUnit,
      unit: catalog.unit,
      effectiveAt: null,
    };
  return {
    status: "unknown",
    reason: sawZero || catalog.costPerUnit === 0 ? "priced at $0" : "no price",
  };
}

/** Group observation rows by ingredient for the lookups. */
export function observationsByIngredient(
  rows: readonly PriceObservationLike[],
): Map<string, PriceObservationLike[]> {
  const out = new Map<string, PriceObservationLike[]>();
  for (const row of rows) {
    const list = out.get(row.ingredientId) ?? [];
    list.push(row);
    out.set(row.ingredientId, list);
  }
  return out;
}
