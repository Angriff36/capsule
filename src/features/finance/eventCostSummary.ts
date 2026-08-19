import { isBilledInvoice, isDraftInvoice } from "./invoiceBilling";

type DateValue = Date | number | string | null | undefined;

export type EventCostSummaryEvent = {
  _id: string;
  title?: string | null;
  eventType?: string | null;
  startsAt?: DateValue;
  endsAt?: DateValue;
  expectedHeadcount?: number | null;
};

export type EventCostSummaryCloseout = {
  _id?: string;
  eventId: string;
  status?: string | null;
  capturedAt?: DateValue;
  finalizedAt?: DateValue;
  actualRevenue?: number | null;
  actualIngredientCost?: number | null;
  actualWasteCost?: number | null;
  actualLaborCost?: number | null;
  actualVendorCost?: number | null;
  totalActualCost?: number | null;
  actualHeadcount?: number | null;
  expectedHeadcount?: number | null;
  unresolvedIssues?: string | null;
  performanceNotes?: string | null;
  notes?: string | null;
};

export type EventCostSummaryInvoice = {
  _id?: string;
  eventId?: string | null;
  invoiceNumber?: string | null;
  total?: number | null;
  amountPaid?: number | null;
  status?: string | null;
  issuedAt?: DateValue;
  createdAt?: DateValue;
  deletedAt?: DateValue;
};

export type EventCostBucket = {
  key: "ingredient" | "labor" | "equipment" | "miscellaneous";
  label: string;
  amount: number;
  source: string;
};

export type EventCostSummary = {
  event: EventCostSummaryEvent;
  status: string;
  asOf: DateValue;
  buckets: EventCostBucket[];
  totalCost: number;
  /** Total across invoices actually billed (sent through paid) — not drafts. */
  invoicedRevenue: number;
  reconciledRevenue: number;
  margin: number;
  marginPercent: number | null;
  invoiceCount: number;
  invoiceNumbers: string[];
  /** Money written into draft invoices that were never sent. */
  draftInvoiceTotal: number;
  draftInvoiceCount: number;
  /** Cash already collected against billed invoices. */
  collectedTotal: number;
  /**
   * True while the closeout is still a draft. Capture may stamp billed
   * revenue onto a draft; that is not reconciliation. Finalize is.
   */
  unreconciled: boolean;
  /**
   * True while the closeout is unreconciled AND every cost bucket is still
   * the cascade-seeded $0. There is no cost truth yet, so "Total event cost
   * $0.00" and a 100% margin must never be printed as reconciled fact.
   */
  costsPending: boolean;
  headcount: {
    actual: number;
    expected: number;
  };
  notes: string[];
};

function amount(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A draft closeout is still waiting on truth — billed-prefill revenue and
 * cascade-seeded $0 costs must never be presented as a reconciled 100% margin.
 * Finalize is what turns captured numbers into folio fact.
 */
export function isUnreconciledCloseout(closeout: {
  status?: string | null;
  actualRevenue?: number | null;
}): boolean {
  return String(closeout.status ?? "draft") === "draft";
}

/**
 * Builds the printable event folio from the governed closeout snapshot and
 * linked invoices. Raw checkout and expense ledgers are not modeled yet, so
 * the existing vendor and waste closeout buckets remain explicitly labelled.
 */
export function buildEventCostSummary({
  event,
  closeout,
  invoices,
}: {
  event: EventCostSummaryEvent;
  closeout: EventCostSummaryCloseout;
  invoices: readonly EventCostSummaryInvoice[];
}): EventCostSummary {
  const eventInvoices = invoices.filter(
    (invoice) => String(invoice.eventId ?? "") === String(event._id),
  );
  // Billed = sent through paid. Drafts are reported separately — folding
  // them into revenue pretends unsent paperwork is money.
  const includedInvoices = eventInvoices.filter(isBilledInvoice);
  const draftInvoices = eventInvoices.filter(isDraftInvoice);

  const unreconciled = isUnreconciledCloseout(closeout);
  const costSource = (reconciledLabel: string) =>
    unreconciled ? "awaiting reconciliation" : reconciledLabel;

  const buckets: EventCostBucket[] = [
    {
      key: "ingredient",
      label: "Ingredient purchases",
      amount: amount(closeout.actualIngredientCost),
      source: `Received purchases · ${costSource("reconciled at closeout")}`,
    },
    {
      key: "labor",
      label: "Approved labor",
      amount: amount(closeout.actualLaborCost),
      source: `Approved time · ${costSource("reconciled at closeout")}`,
    },
    {
      key: "equipment",
      label: "Equipment & vendor hire",
      amount: amount(closeout.actualVendorCost),
      source: `Equipment and hire · ${costSource("reconciled vendor bucket")}`,
    },
    {
      key: "miscellaneous",
      label: "Miscellaneous & waste",
      amount: amount(closeout.actualWasteCost),
      source: `Other event spend · ${costSource("reconciled waste bucket")}`,
    },
  ];

  const totalCost = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
  const invoicedRevenue = includedInvoices.reduce(
    (sum, invoice) => sum + amount(invoice.total),
    0,
  );
  const margin = invoicedRevenue - totalCost;
  // Cascade-seeded drafts carry $0 in every bucket. Until finance reconciles,
  // that zero is a placeholder — margin against it would be a fake 100%.
  const costsPending = unreconciled && totalCost === 0;

  return {
    event,
    status: String(closeout.status ?? "draft"),
    asOf: closeout.finalizedAt ?? closeout.capturedAt,
    buckets,
    totalCost,
    invoicedRevenue,
    reconciledRevenue: amount(closeout.actualRevenue),
    margin,
    marginPercent:
      costsPending || invoicedRevenue === 0
        ? null
        : (margin / invoicedRevenue) * 100,
    invoiceCount: includedInvoices.length,
    invoiceNumbers: includedInvoices
      .map((invoice) => String(invoice.invoiceNumber ?? "").trim())
      .filter(Boolean),
    draftInvoiceTotal: draftInvoices.reduce(
      (sum, invoice) => sum + amount(invoice.total),
      0,
    ),
    draftInvoiceCount: draftInvoices.length,
    collectedTotal: includedInvoices.reduce(
      (sum, invoice) => sum + amount(invoice.amountPaid),
      0,
    ),
    unreconciled,
    costsPending,
    headcount: {
      actual: amount(closeout.actualHeadcount),
      // Cascade-seeded closeouts carry 0 — the event's planned headcount is
      // the honest expected figure until finance reconciles.
      expected:
        amount(closeout.expectedHeadcount) > 0
          ? amount(closeout.expectedHeadcount)
          : amount(event.expectedHeadcount),
    },
    notes: [
      closeout.unresolvedIssues
        ? `Unresolved: ${closeout.unresolvedIssues}`
        : "",
      closeout.performanceNotes
        ? `Performance: ${closeout.performanceNotes}`
        : "",
      closeout.notes ? String(closeout.notes) : "",
    ].filter(Boolean),
  };
}
