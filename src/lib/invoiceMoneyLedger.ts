/**
 * Invoice money ledger — integer-cent allocation, statement, aging, and
 * reporting sums for receivables.
 *
 * AC-089 (PR05-06): statement balances, payment allocation, dashboard aging,
 * and finance report KPIs used to add dollars with `+=` / `reduce`, which is
 * float accounting. Every combination here runs in whole cents via
 * `LedgerMoney`, so 0.1 + 0.2 style dollars can never leave a float residue.
 * Dollars in, dollars out — the boundary conversion is the only rounding.
 *
 * Pure module — no I/O, no React, no Convex imports.
 */

import { LedgerMoney } from "./ledgerMoney";

const DAY_MS = 86_400_000;

/** One invoice with money still owed. Status is not used for aging buckets. */
export type OpenReceivable = {
  amountDue: number;
  dueDate?: number | null;
};

/** Dashboard aging buckets, in dollars, summed in cents. */
export type AgingTotals = {
  current: number;
  days1to30: number;
  days31to60: number;
  days61plus: number;
  /** Sum of all four buckets. */
  outstanding: number;
  /** Sum of the three non-current buckets. */
  overdue: number;
};

export type PaymentApplication = {
  /** Portion of the payment consumed by this due. */
  applied: number;
  /** Due left after the payment lands. */
  nextDue: number;
  /** Unused payment left over. */
  remainder: number;
};

export class InvoiceMoneyLedger {
  /** `total − paid − credited` in cents. Overpay/credit stays exact — no clamp. */
  statementDue(total: number, paid: number, credited = 0): number {
    const dueCents =
      LedgerMoney.fromDollars(total).toCents() -
      LedgerMoney.fromDollars(paid).toCents() -
      LedgerMoney.fromDollars(credited).toCents();
    return LedgerMoney.fromCents(dueCents).toDollars();
  }

  /** Apply `min(due, payment)` in cents; remainder is unused payment. */
  applyPayment(due: number, payment: number): PaymentApplication {
    const dueCents = LedgerMoney.fromDollars(due).toCents();
    const paymentCents = LedgerMoney.fromDollars(payment).toCents();
    const appliedCents = Math.min(dueCents, paymentCents);
    return {
      applied: LedgerMoney.fromCents(appliedCents).toDollars(),
      nextDue: LedgerMoney.fromCents(dueCents - appliedCents).toDollars(),
      remainder: LedgerMoney.fromCents(paymentCents - appliedCents).toDollars(),
    };
  }

  /** Waterfall one payment across dues in order using `applyPayment`. */
  allocateAcross(
    dues: readonly number[],
    payment: number,
  ): { applied: number[]; remainder: number } {
    let remainder = payment;
    const applied = dues.map((due) => {
      const step = this.applyPayment(due, remainder);
      remainder = step.remainder;
      return step.applied;
    });
    return { applied, remainder };
  }

  /** Sum dollars in cents. Empty list → 0. */
  sum(amounts: readonly number[]): number {
    const cents = amounts.reduce(
      (sum, amount) => sum + LedgerMoney.fromDollars(amount).toCents(),
      0,
    );
    return LedgerMoney.fromCents(cents).toDollars();
  }

  /**
   * Dashboard aging buckets — same rules as the widget policy: skip
   * `amountDue <= 0`; null/future due dates are current; otherwise bucket by
   * whole days past due.
   */
  ageOpenBalances(
    invoices: readonly OpenReceivable[],
    asOf: number,
  ): AgingTotals {
    const buckets = [0, 0, 0, 0];
    for (const invoice of invoices) {
      const amountDue = LedgerMoney.fromDollars(invoice.amountDue).toCents();
      if (amountDue <= 0) continue;
      const dueDate = invoice.dueDate;
      if (dueDate == null || dueDate >= asOf) {
        buckets[0] += amountDue;
        continue;
      }
      const age = Math.floor((asOf - dueDate) / DAY_MS);
      if (age <= 30) buckets[1] += amountDue;
      else if (age <= 60) buckets[2] += amountDue;
      else buckets[3] += amountDue;
    }
    const toDollars = (cents: number) =>
      LedgerMoney.fromCents(cents).toDollars();
    return {
      current: toDollars(buckets[0]),
      days1to30: toDollars(buckets[1]),
      days31to60: toDollars(buckets[2]),
      days61plus: toDollars(buckets[3]),
      outstanding: toDollars(buckets[0] + buckets[1] + buckets[2] + buckets[3]),
      overdue: toDollars(buckets[1] + buckets[2] + buckets[3]),
    };
  }
}
