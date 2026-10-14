export const FINANCE_SECTIONS = [
  { key: "invoices", label: "Invoices", path: "/finance/invoices" },
  { key: "payments", label: "Payments", path: "/finance/payments" },
  { key: "closeout", label: "Closeout", path: "/finance/closeout" },
  { key: "payroll", label: "Payroll", path: "/finance/payroll" },
] as const;

export type FinanceSection = (typeof FINANCE_SECTIONS)[number]["key"];

export type InvoiceIssuePrefill = {
  clientId?: string;
  eventId?: string;
};

const INVOICES_PATH = "/finance/invoices";

/** Builds /finance/invoices?issue=1&clientId=&eventId= deep links. */
export class InvoiceIssueLinkBuilder {
  build(prefill: InvoiceIssuePrefill = {}): string {
    const params = new URLSearchParams();
    params.set("issue", "1");
    if (prefill.clientId) params.set("clientId", prefill.clientId);
    if (prefill.eventId) params.set("eventId", prefill.eventId);
    return `${INVOICES_PATH}?${params.toString()}`;
  }
}

export const invoiceIssueLinkBuilder = new InvoiceIssueLinkBuilder();

export const FINANCE_ROUTES = {
  root: "/finance/invoices",
  invoices: INVOICES_PATH,
  invoiceDetail: (id: string) => `${INVOICES_PATH}/${id}`,
  issueInvoice: (prefill: InvoiceIssuePrefill = {}) =>
    invoiceIssueLinkBuilder.build(prefill),
  taxes: "/finance/taxes",
  payments: "/finance/payments",
  paymentMethods: "/finance/payments#payment-methods",
  revenue: "/finance/revenue",
  foodCost: "/finance/revenue#food-cost",
  profitMargins: "/finance/revenue#profit-margins",
  reconciliation: "/admin/parallel-run#payments",
  closeout: "/finance/closeout",
  donations: "/finance/donations",
  payroll: "/finance/payroll",
  tips: "/finance/tips",
  venueCommissionTerms: "/finance/attribution#commission-terms",
  revenueAttribution: "/finance/attribution",
  revenueAttributionDetail: (id: string, mode?: string) =>
    mode ? `/finance/attribution/${id}/${mode}` : `/finance/attribution/${id}`,
  salesDashboard: "/reports/sales",
  timsKpis: "/reports/tims-kpis",
  scorecard: "/eos/l10#scorecard",
  l10: "/eos/l10",
  avgEventValue: "/reports/sales#avg-event-value",
  compMaster: "/finance/attribution#comp-master",
  mangia: "/reports/mangia",
} as const;
