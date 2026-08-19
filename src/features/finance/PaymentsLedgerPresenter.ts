import { formatMoneyExact } from "../../lib/format";

export interface PaymentLedgerRow {
  status: unknown;
  amount?: unknown;
  settledAt?: unknown;
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
 * hidden behind the "Show settled" toggle — the count and a visible status
 * line have to name the filter and put the settled rows one click away.
 */
export class PaymentsLedgerPresenter {
  private static readonly terminalStatuses = new Set([
    "completed",
    "failed",
    "refunded",
  ]);

  normalizeStatus(status: unknown): string {
    return String(status ?? "")
      .trim()
      .toLowerCase();
  }

  private hasSettledAt(row?: Pick<PaymentLedgerRow, "settledAt">): boolean {
    return row?.settledAt != null && row.settledAt !== "";
  }

  isTerminal(
    status: unknown,
    row?: Pick<PaymentLedgerRow, "settledAt">,
  ): boolean {
    const normalized = this.normalizeStatus(status);
    if (PaymentsLedgerPresenter.terminalStatuses.has(normalized)) return true;
    return this.hasSettledAt(row);
  }

  openRows<T extends PaymentLedgerRow>(rows: readonly T[]): T[] {
    return rows.filter((row) => !this.isTerminal(row.status, row));
  }

  settledSummary(rows: readonly PaymentLedgerRow[]): SettledSummary {
    const settled = rows.filter((row) => this.isTerminal(row.status, row));
    const completed = settled.filter((row) => {
      const status = this.normalizeStatus(row.status);
      if (status === "completed") return true;
      return (
        this.hasSettledAt(row) && status !== "failed" && status !== "refunded"
      );
    });
    return {
      hiddenCount: settled.length,
      completedCount: completed.length,
      completedTotal: completed.reduce(
        (sum, row) => sum + (Number(row.amount) || 0),
        0,
      ),
    };
  }

  /**
   * Ledger heading count from the live row set so the badge cannot desync
   * from the filter. Never a bare "0 payments" while settled rows exist.
   */
  headingCount(
    rows: readonly PaymentLedgerRow[],
    showTerminal: boolean,
  ): string {
    const summary = this.settledSummary(rows);
    const visible = showTerminal ? rows.length : this.openRows(rows).length;
    return this.countLabel(
      visible,
      showTerminal ? 0 : summary.hiddenCount,
      showTerminal,
    );
  }

  /** Ledger heading count — never a bare "0" while settled rows are hidden. */
  countLabel(
    visibleCount: number,
    hiddenCount: number,
    showTerminal: boolean,
  ): string {
    if (!showTerminal && hiddenCount > 0) {
      // QA 176 PASS: "0 OPEN · 2 SETTLED" is the signed-off badge. Do not
      // rephrase it to "2 settled hidden".
      return `${visibleCount} open · ${hiddenCount} settled`;
    }
    return plural(visibleCount, "payment");
  }

  /** Status-line copy naming the filter and the money it hides. */
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

  /**
   * Masthead toggle — same honest count as the in-card button. A generic
   * "Show settled" next to an honest in-card label is the leftover QA
   * called out after 176 PASS.
   */
  mastheadSettledLabel(summary: SettledSummary, showTerminal: boolean): string {
    if (showTerminal) return "Hide settled";
    if (summary.hiddenCount > 0) return this.showSettledLabel(summary);
    return "Show settled";
  }
}
