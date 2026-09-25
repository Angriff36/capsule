/**
 * Commercial money — integer-cent arithmetic for commissions and food cost.
 *
 * CF §2.3 and BE §6.4 forbid float accounting for commission and food-cost
 * money, and PR05-06 requires reconciliation to the smallest currency unit.
 * Every combination here runs in whole cents via `LedgerMoney`, so 0.1 + 0.2
 * style dollars never leave a float residue. Dollars in, dollars out — the
 * boundary conversion is the only rounding.
 *
 * PR11-04: no commission formula is invented here — `percent` and `fixed`
 * come from the stored basis the operator entered.
 *
 * Pure module — no I/O, no React, no Convex imports.
 */

import { LedgerMoney } from "./ledgerMoney";

export class CommercialMoney {
  /** Sum dollars in cents. Empty list → 0. */
  sum(amounts: readonly number[]): number {
    const cents = amounts.reduce(
      (sum, amount) => sum + LedgerMoney.fromDollars(amount).toCents(),
      0,
    );
    return LedgerMoney.fromCents(cents).toDollars();
  }

  /** `percent` is 0–100. Result is rounded to the nearest cent. */
  percentOf(base: number, percent: number): number {
    return LedgerMoney.fromDollars(base).percent(percent).toDollars();
  }

  /**
   * Apply-preview rule from RevenueAttributionDetailPage: a percent method
   * only applies against positive revenue; percent + $0 revenue still
   * returns the stored fixed amount, never an invented default.
   */
  allocate(input: {
    method: "percent" | "fixed";
    revenue: number;
    percent: number;
    fixed: number;
  }): number {
    if (
      input.method === "percent" &&
      LedgerMoney.fromDollars(input.revenue).toCents() > 0
    ) {
      return this.percentOf(input.revenue, input.percent);
    }
    return LedgerMoney.fromDollars(input.fixed).toDollars();
  }

  /**
   * Food-cost ratio as a percentage. `null` when revenue rounds to zero
   * cents — missing revenue is not a $0 margin.
   */
  foodCostPercent(foodCost: number, revenue: number): number | null {
    const foodCents = LedgerMoney.fromDollars(foodCost).toCents();
    const revenueCents = LedgerMoney.fromDollars(revenue).toCents();
    if (revenueCents <= 0) return null;
    return (foodCents / revenueCents) * 100;
  }
}
