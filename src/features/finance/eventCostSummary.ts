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
  invoicedRevenue: number;
  reconciledRevenue: number;
  margin: number;
  marginPercent: number | null;
  invoiceCount: number;
  invoiceNumbers: string[];
  headcount: {
    actual: number;
    expected: number;
  };
  notes: string[];
};

const EXCLUDED_INVOICE_STATUSES = new Set(["voided", "written_off"]);

function amount(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
  const includedInvoices = invoices.filter(
    (invoice) =>
      invoice.deletedAt == null &&
      String(invoice.eventId ?? "") === String(event._id) &&
      !EXCLUDED_INVOICE_STATUSES.has(String(invoice.status)),
  );

  const buckets: EventCostBucket[] = [
    {
      key: "ingredient",
      label: "Ingredient purchases",
      amount: amount(closeout.actualIngredientCost),
      source: "Received purchases · reconciled at closeout",
    },
    {
      key: "labor",
      label: "Approved labor",
      amount: amount(closeout.actualLaborCost),
      source: "Approved time · reconciled at closeout",
    },
    {
      key: "equipment",
      label: "Equipment & vendor hire",
      amount: amount(closeout.actualVendorCost),
      source: "Equipment and hire · reconciled vendor bucket",
    },
    {
      key: "miscellaneous",
      label: "Miscellaneous & waste",
      amount: amount(closeout.actualWasteCost),
      source: "Other event spend · reconciled waste bucket",
    },
  ];

  const totalCost = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
  const invoicedRevenue = includedInvoices.reduce(
    (sum, invoice) => sum + amount(invoice.total),
    0,
  );
  const margin = invoicedRevenue - totalCost;

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
      invoicedRevenue === 0 ? null : (margin / invoicedRevenue) * 100,
    invoiceCount: includedInvoices.length,
    invoiceNumbers: includedInvoices
      .map((invoice) => String(invoice.invoiceNumber ?? "").trim())
      .filter(Boolean),
    headcount: {
      actual: amount(closeout.actualHeadcount),
      expected: amount(closeout.expectedHeadcount ?? event.expectedHeadcount),
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
