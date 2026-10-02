/**
 * The record sets every dashboard counts with (dashboardMetrics.ts says the
 * same thing in words). Unknown stays unknown: a share or percent with
 * nothing to divide by is null, and the page shows NOT_KNOWN, never 0%.
 */

export const NOT_KNOWN = "Not known yet";

interface PricedEvent {
  readonly stage?: string | null;
  readonly quotedPrice?: number | null;
}

interface CloseoutFigures {
  readonly grossProfit?: number | null;
  readonly actualIngredientCost?: number | null;
  readonly budgetedCost?: number | null;
}

/** Approved or later (the client said yes), cancelled never. */
export const BOOKED_STAGES: readonly string[] = [
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "closed_out",
];

/** The event has happened: completed, or completed and closed out. */
export const COMPLETED_STAGES: readonly string[] = ["completed", "closed_out"];

/** Approved or later, with a quoted price. */
export function isBookedEvent(event: PricedEvent): boolean {
  return event.quotedPrice != null && BOOKED_STAGES.includes(event.stage ?? "");
}

/** Completed or closed out, with a quoted price above $0. */
export function isCompletedEvent(event: PricedEvent): boolean {
  return (
    COMPLETED_STAGES.includes(event.stage ?? "") &&
    event.quotedPrice != null &&
    event.quotedPrice > 0
  );
}

export const QUALIFIED_LEAD_STAGES: readonly string[] = [
  "qualified",
  "proposalSent",
  "negotiating",
  "converted",
];

export function isQualifiedLead(lead: { readonly stage?: string | null }) {
  return QUALIFIED_LEAD_STAGES.includes(lead.stage ?? "");
}

/** top / bottom as a percent, or null when there is nothing to divide by. */
export function percentOf(top: number, bottom: number): number | null {
  return bottom > 0 ? (top / bottom) * 100 : null;
}

/** Closeout revenue = profit + food cost, as the closeout records it. */
export function closeoutRevenue(closeout: CloseoutFigures): number {
  return (closeout.grossProfit ?? 0) + (closeout.actualIngredientCost ?? 0);
}

function sumBy<T>(rows: readonly T[], value: (row: T) => number): number {
  return rows.reduce((total, row) => total + value(row), 0);
}

export function foodCostPercent(
  closeouts: readonly CloseoutFigures[],
): number | null {
  return percentOf(
    sumBy(closeouts, (c) => c.actualIngredientCost ?? 0),
    sumBy(closeouts, closeoutRevenue),
  );
}

export function budgetedFoodCostPercent(
  closeouts: readonly CloseoutFigures[],
): number | null {
  return percentOf(
    sumBy(closeouts, (c) => c.budgetedCost ?? 0),
    sumBy(closeouts, closeoutRevenue),
  );
}

export function profitMarginPercent(
  closeouts: readonly CloseoutFigures[],
): number | null {
  return percentOf(
    sumBy(closeouts, (c) => c.grossProfit ?? 0),
    sumBy(closeouts, closeoutRevenue),
  );
}

/** A percent for a StatCard: one decimal, or NOT_KNOWN when null. */
export function percentText(value: number | null, empty = NOT_KNOWN): string {
  return value == null ? empty : `${value.toFixed(1)}%`;
}
