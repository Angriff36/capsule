// Single source of truth for which invoices count as billed money.
//
// The Invoice domain (src/sales/invoice-core.manifest) keeps an invoice in
// "draft" until finance sends it — issue() stamps issuedAt and a number, but
// the client has not been billed until send(). Finance surfaces must agree:
// drafts are intent, not revenue; voided / written-off / deleted rows are
// dead money.

/** Statuses with money still owed — the hub's "needs attention" pool. */
export const OPEN_INVOICE_STATUSES = [
  "sent",
  "viewed",
  "overdue",
  "partial",
] as const;

/** Statuses where the client has actually been billed (open or settled). */
export const BILLED_INVOICE_STATUSES = [
  ...OPEN_INVOICE_STATUSES,
  "paid",
] as const;

export type BillingInvoice = {
  eventId?: string | null;
  status?: string | null;
  total?: number | null;
  amountPaid?: number | null;
  deletedAt?: Date | number | string | null;
};

const BILLED = new Set<string>(BILLED_INVOICE_STATUSES);

function moneyAmount(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** True when the invoice represents money actually billed to a client. */
export function isBilledInvoice(invoice: BillingInvoice): boolean {
  return invoice.deletedAt == null && BILLED.has(String(invoice.status));
}

/** True when the invoice is a live draft — written but never sent. */
export function isDraftInvoice(invoice: BillingInvoice): boolean {
  return invoice.deletedAt == null && String(invoice.status) === "draft";
}

export type EventBillingRollup = {
  /** Total of invoices actually billed (sent through paid). */
  billedTotal: number;
  billedCount: number;
  /** Cash already collected against billed invoices. */
  collectedTotal: number;
  /** Total sitting in unsent draft invoices. */
  draftTotal: number;
  draftCount: number;
};

/** Folds an event's invoices into billed / collected / drafted truth. */
export function rollupEventBilling(
  invoices: readonly BillingInvoice[],
  eventId: string,
): EventBillingRollup {
  const rollup: EventBillingRollup = {
    billedTotal: 0,
    billedCount: 0,
    collectedTotal: 0,
    draftTotal: 0,
    draftCount: 0,
  };
  for (const invoice of invoices) {
    if (String(invoice.eventId ?? "") !== eventId) continue;
    if (isBilledInvoice(invoice)) {
      rollup.billedTotal += moneyAmount(invoice.total);
      rollup.collectedTotal += moneyAmount(invoice.amountPaid);
      rollup.billedCount += 1;
    } else if (isDraftInvoice(invoice)) {
      rollup.draftTotal += moneyAmount(invoice.total);
      rollup.draftCount += 1;
    }
  }
  return rollup;
}
