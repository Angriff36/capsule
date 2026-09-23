/**
 * Ledger money — integer-cent arithmetic for stored and combined money.
 *
 * PR05-06 requires reconciliation to the smallest currency unit with no
 * undocumented tolerance, and backend spec §6.4 forbids float accounting.
 * Every sum that preview, invoice tax, and stored totals rely on is combined
 * here as whole cents, so two runs can never drift apart by a float ulp the
 * way `Math.round((n + Number.EPSILON) * 100) / 100` does.
 *
 * The dollar surface stays the existing 2-decimal USD contract: dollars in,
 * dollars out, `money(12,2)`-stable. Boundary conversion (`dollars → cents`)
 * is the only place rounding happens; everything after it is integer math.
 *
 * Pure module — no I/O, no React, no Convex imports.
 */

export class LedgerMoney {
  private constructor(private readonly cents: number) {}

  static fromCents(cents: number): LedgerMoney {
    if (!Number.isSafeInteger(cents)) {
      throw new Error("cents must be a safe integer");
    }
    return new LedgerMoney(cents);
  }

  static fromDollars(amount: number): LedgerMoney {
    if (!Number.isFinite(amount)) return new LedgerMoney(0);
    return new LedgerMoney(Math.round(amount * 100));
  }

  static zero(): LedgerMoney {
    return new LedgerMoney(0);
  }

  add(other: LedgerMoney): LedgerMoney {
    return new LedgerMoney(this.cents + other.cents);
  }

  subtract(other: LedgerMoney): LedgerMoney {
    return new LedgerMoney(this.cents - other.cents);
  }

  /** Multiply cents by a real factor (guest count / quantity). */
  times(factor: number): LedgerMoney {
    return new LedgerMoney(
      Number.isFinite(factor) ? Math.round(this.cents * factor) : 0,
    );
  }

  /** `percent` is 0–100. Result is rounded to the nearest cent. */
  percent(percent: number): LedgerMoney {
    return new LedgerMoney(
      Number.isFinite(percent) ? Math.round((this.cents * percent) / 100) : 0,
    );
  }

  maxZero(): LedgerMoney {
    return new LedgerMoney(Math.max(0, this.cents));
  }

  toCents(): number {
    return this.cents;
  }

  toDollars(): number {
    return this.cents / 100;
  }
}

export const dollarsToCents = (amount: number): number =>
  LedgerMoney.fromDollars(amount).toCents();

export const centsToDollars = (cents: number): number =>
  LedgerMoney.fromCents(cents).toDollars();

export const roundMoney = (amount: number): number =>
  LedgerMoney.fromDollars(amount).toDollars();
