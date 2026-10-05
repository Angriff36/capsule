// Event food cost: estimate vs actual on one revenue basis (CF-10.3, BE-9.3).
//
// The estimate prices the SAME ingredient amounts the demand engine buys
// (guest count x menu x recipe yields x waste factors), each at the price in
// force on the event date (pricing.ts). It is a read: it never writes a quote,
// invoice, receipt cost or closeout amount. Unknown prices and unresolved menu
// items are counted, never priced at $0, so the estimate says when it is not
// complete and no food-cost % or margin built on it claims to be.

import type { Contribution } from "./demand";
import { ingredientPriceAt, type PriceObservationLike } from "./pricing";
import { convertQuantity, type ItemUnitMappingLike, type UnitCode } from "./units";

export interface FoodCostIngredient {
  id: string;
  name: string;
  unit: UnitCode;
  costPerUnit: number | null;
  observations?: readonly PriceObservationLike[];
}

export interface FoodCostLine {
  ingredientId: string;
  name: string;
  /** Known cost of this ingredient's priced amounts. */
  cost: number;
  /** Amount rows of this ingredient that could not be priced. */
  unknownRows: number;
  reason: string | null;
  priceSource: "receipt" | "catalog" | null;
  unitPrice: number | null;
  priceUnit: UnitCode | null;
  priceEffectiveAt: number | null;
  vendorId: string | null;
}

export type RevenueSource = "closeout" | "invoices" | "quote";

export interface EventFoodCostInput {
  contributions: readonly Contribution[];
  /** Menu items the demand engine could not turn into amounts (missing yield, recipe...). */
  unresolvedItems: number;
  ingredients: ReadonlyMap<string, FoodCostIngredient>;
  mappings: readonly ItemUnitMappingLike[];
  /** Event date (ms); prices in force then are used. */
  asOf: number | null;
  expectedHeadcount: number;
  revenue: { amount: number; source: RevenueSource } | null;
  actual: {
    /** Received ingredient purchases from the closeout. */
    ingredientCost: number;
    actualHeadcount: number;
    finalized: boolean;
  } | null;
  /** Kitchen-recorded waste for this event (quantity x unit cost, voids left out). */
  recordedWasteCost: number;
}

export interface EventFoodCost {
  asOf: number | null;
  estimated: {
    knownCost: number;
    complete: boolean;
    unknownRows: number;
    unresolvedItems: number;
    undatedRows: number;
    costPerGuest: number | null;
    lines: FoodCostLine[];
  };
  actual: {
    ingredientCost: number;
    wasteCost: number;
    total: number;
    costPerGuest: number | null;
    finalized: boolean;
  } | null;
  /** actual.total - estimated.knownCost; null until there is an actual. */
  variance: number | null;
  revenue: { amount: number; source: RevenueSource } | null;
  /** Food cost as a share of revenue; the estimate's is null unless complete. */
  estimatedFoodCostPercent: number | null;
  actualFoodCostPercent: number | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function eventFoodCost(input: EventFoodCostInput): EventFoodCost {
  const byIngredient = new Map<string, FoodCostLine>();
  let unknownRows = 0;
  let undatedRows = 0;
  let known = 0;
  for (const c of input.contributions) {
    const ingredient = input.ingredients.get(c.ingredientId);
    const line =
      byIngredient.get(c.ingredientId) ??
      ({
        ingredientId: c.ingredientId,
        name: ingredient?.name ?? c.ingredientName,
        cost: 0,
        unknownRows: 0,
        reason: null,
        priceSource: null,
        unitPrice: null,
        priceUnit: null,
        priceEffectiveAt: null,
        vendorId: null,
      } satisfies FoodCostLine);
    byIngredient.set(c.ingredientId, line);
    const miss = (reason: string) => {
      line.unknownRows += 1;
      line.reason = line.reason ?? reason;
      unknownRows += 1;
    };
    if (!ingredient) {
      miss("ingredient not found");
      continue;
    }
    if (!c.purchasable) {
      miss(c.unitStatus !== "resolved" ? c.unitStatus : c.basisStatus);
      continue;
    }
    const price = ingredientPriceAt(ingredient, ingredient.observations ?? [], input.asOf);
    if (price.status === "unknown") {
      miss(price.reason);
      continue;
    }
    const converted = convertQuantity(c.quantity, c.unit, price.unit, input.mappings, {
      itemKind: "ingredient",
      itemId: ingredient.id,
    });
    if (converted.status !== "resolved") {
      miss(`${c.unit} cannot be priced per ${price.unit}`);
      continue;
    }
    const cost = converted.quantity * price.unitPrice;
    line.cost += cost;
    known += cost;
    line.priceSource = price.source;
    line.unitPrice = price.unitPrice;
    line.priceUnit = price.unit;
    line.priceEffectiveAt = price.effectiveAt;
    line.vendorId = price.source === "receipt" ? price.vendorId : null;
    if (price.source === "catalog") undatedRows += 1;
  }
  const lines = [...byIngredient.values()]
    .map((l) => ({ ...l, cost: cents(l.cost) }))
    .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));
  const knownCost = cents(known);
  const complete =
    input.contributions.length > 0 && unknownRows === 0 && input.unresolvedItems === 0;
  const perGuest = (total: number, guests: number) => (guests > 0 ? cents(total / guests) : null);
  const actual = input.actual
    ? (() => {
        // Recorded kitchen waste is the itemised fact; it is added to the
        // received purchases so the actual is food bought plus food thrown out.
        const wasteCost = cents(input.recordedWasteCost);
        const total = cents(input.actual.ingredientCost + wasteCost);
        const guests =
          input.actual.actualHeadcount > 0 ? input.actual.actualHeadcount : input.expectedHeadcount;
        return {
          ingredientCost: cents(input.actual.ingredientCost),
          wasteCost,
          total,
          costPerGuest: perGuest(total, guests),
          finalized: input.actual.finalized,
        };
      })()
    : null;
  const revenue = input.revenue && input.revenue.amount > 0 ? input.revenue : null;
  const pct = (cost: number) => (revenue ? Math.round((cost / revenue.amount) * 1000) / 10 : null);
  return {
    asOf: input.asOf,
    estimated: {
      knownCost,
      complete,
      unknownRows,
      unresolvedItems: input.unresolvedItems,
      undatedRows,
      costPerGuest: complete ? perGuest(knownCost, input.expectedHeadcount) : null,
      lines,
    },
    actual,
    variance: actual ? cents(actual.total - knownCost) : null,
    revenue,
    estimatedFoodCostPercent: complete ? pct(knownCost) : null,
    actualFoodCostPercent: actual ? pct(actual.total) : null,
  };
}
