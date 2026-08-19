import { formatMoneyExact } from "../../lib/format";

export interface PaymentLedgerRow {
  status: unknown;
  amount?: unknown;
}

export interface SettledSummary {
  hiddenCount: number;
  completedCount: number;
  completedTotal: number;
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Presents the Payments ledger's open/settled split honestly. The default
 * (open-only) view must never claim "0 payments" while settled money sits
 * hidden behind the "Show settled" toggle — the count and empty state have
 * to name the filter and put the settled rows one click away.
 */
export class PaymentsLedgerPresenter {
  private static readonly terminalStatuses = new Set([
    "completed",
    "failed",
    "refunded",
  ]);

  isTerminal(status: unknown): boolean {
    return PaymentsLedgerPresenter.terminalStatuses.has(String(status));
  }

  openRows<T extends PaymentLedgerRow>(rows: readonly T[]): T[] {
    return rows.filter((row) => !this.isTerminal(row.status));
  }

  settledSummary(rows: readonly PaymentLedgerRow[]): SettledSummary {
    const settled = rows.filter((row) => this.isTerminal(row.status));
    const completed = settled.filter(
      (row) => String(row.status) === "completed",
    );
    return {
      hiddenCount: settled.length,
      completedCount: completed.length,
      completedTotal: completed.reduce(
        (sum, row) => sum + (Number(row.amount) || 0),
        0,
      ),
    };
  }

  /** Ledger heading count — never a bare "0" while settled rows are hidden. */
  countLabel(
    visibleCount: number,
    hiddenCount: number,
    showTerminal: boolean,
  ): string {
    if (!showTerminal && hiddenCount > 0) {
      return `${visibleCount} open · ${hiddenCount} settled`;
    }
    return plural(visibleCount, "payment");
  }

  /** Empty-state detail naming the filter and the money it hides. */
  hiddenSettledNotice(summary: SettledSummary): string | null {
    if (summary.hiddenCount === 0) return null;
    const verb = summary.hiddenCount === 1 ? "is" : "are";
    const scope = `${verb} hidden by the open-payments view`;
    if (summary.completedCount === summary.hiddenCount) {
      return `${plural(summary.completedCount, "completed payment")} totaling ${formatMoneyExact(summary.completedTotal)} ${scope}.`;
    }
    if (summary.completedCount > 0) {
      return `${plural(summary.hiddenCount, "settled payment")} ${scope}, including ${plural(summary.completedCount, "completed payment")} totaling ${formatMoneyExact(summary.completedTotal)}.`;
    }
    return `${plural(summary.hiddenCount, "settled payment")} (failed or refunded) ${scope}.`;
  }

  /** One-click reveal with an honest count. */
  showSettledLabel(summary: SettledSummary): string {
    return `Show ${plural(summary.hiddenCount, "settled payment")}`;
  }
}
