export const INVOICE_LINE_CATEGORIES = ["food", "service", "rental"] as const;

export type InvoiceLineCategory = (typeof INVOICE_LINE_CATEGORIES)[number];

export type TaxRateRecord = {
  _id: string;
  name?: unknown;
  percentage?: unknown;
  appliesToFood?: unknown;
  appliesToService?: unknown;
  appliesToRental?: unknown;
  active?: unknown;
  deletedAt?: unknown;
};

export type InvoiceLineDraft = {
  id: string;
  description: string;
  category: InvoiceLineCategory;
  quantity: number;
  unitPrice: number;
};

export type AppliedTaxRateSnapshot = {
  taxRateId: string;
  name: string;
  percentage: number;
  amount: number;
};

export type InvoiceLineSnapshot = {
  description: string;
  category: InvoiceLineCategory;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  appliedTaxRates: AppliedTaxRateSnapshot[];
};

export type TaxBreakdownSnapshot = AppliedTaxRateSnapshot;

export type InvoiceTaxCalculation = {
  lineItems: InvoiceLineSnapshot[];
  taxBreakdown: TaxBreakdownSnapshot[];
  subtotal: number;
  taxAmount: number;
  total: number;
};

export type TaxRemittanceRow = TaxBreakdownSnapshot & {
  assessedAmount: number;
  collectedAmount: number;
  invoiceCount: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finite = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const taxRateApplies = (
  rate: TaxRateRecord,
  category: InvoiceLineCategory,
) => {
  if (rate.active !== true || rate.deletedAt != null) return false;
  if (category === "food") return rate.appliesToFood === true;
  if (category === "service") return rate.appliesToService === true;
  return rate.appliesToRental === true;
};

export function calculateInvoiceTax(
  lines: InvoiceLineDraft[],
  taxRates: TaxRateRecord[],
  taxExempt = false,
): InvoiceTaxCalculation {
  const lineItems = lines.map<InvoiceLineSnapshot>((line) => {
    const quantity = Math.max(0, finite(line.quantity));
    const unitPrice = Math.max(0, finite(line.unitPrice));
    const subtotal = roundMoney(quantity * unitPrice);
    const appliedTaxRates = taxExempt
      ? []
      : taxRates
          .filter((rate) => taxRateApplies(rate, line.category))
          .map<AppliedTaxRateSnapshot>((rate) => {
            const percentage = finite(rate.percentage);
            return {
              taxRateId: String(rate._id),
              name: String(rate.name ?? "Tax rate"),
              percentage,
              amount: roundMoney((subtotal * percentage) / 100),
            };
          });
    const taxAmount = roundMoney(
      appliedTaxRates.reduce((sum, rate) => sum + rate.amount, 0),
    );

    return {
      description: line.description.trim(),
      category: line.category,
      quantity,
      unitPrice,
      subtotal,
      taxAmount,
      total: roundMoney(subtotal + taxAmount),
      appliedTaxRates,
    };
  });

  const taxByRate = new Map<string, TaxBreakdownSnapshot>();
  for (const line of lineItems) {
    for (const rate of line.appliedTaxRates) {
      const current = taxByRate.get(rate.taxRateId);
      taxByRate.set(rate.taxRateId, {
        ...rate,
        amount: roundMoney((current?.amount ?? 0) + rate.amount),
      });
    }
  }

  const subtotal = roundMoney(
    lineItems.reduce((sum, line) => sum + line.subtotal, 0),
  );
  const taxBreakdown = [...taxByRate.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const taxAmount = roundMoney(
    taxBreakdown.reduce((sum, rate) => sum + rate.amount, 0),
  );

  return {
    lineItems,
    taxBreakdown,
    subtotal,
    taxAmount,
    total: roundMoney(subtotal + taxAmount),
  };
}

export function readInvoiceLineItems(value: unknown): InvoiceLineSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const category = INVOICE_LINE_CATEGORIES.includes(
      entry.category as InvoiceLineCategory,
    )
      ? (entry.category as InvoiceLineCategory)
      : "service";
    return [
      {
        description: String(entry.description ?? "Invoice line"),
        category,
        quantity: finite(entry.quantity),
        unitPrice: finite(entry.unitPrice),
        subtotal: finite(entry.subtotal),
        taxAmount: finite(entry.taxAmount),
        total: finite(entry.total),
        appliedTaxRates: readTaxBreakdown(entry.appliedTaxRates),
      },
    ];
  });
}

export function readTaxBreakdown(value: unknown): TaxBreakdownSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const taxRateId = String(entry.taxRateId ?? "").trim();
    const name = String(entry.name ?? "Tax rate").trim();
    if (!taxRateId && !name) return [];
    return [
      {
        taxRateId: taxRateId || name,
        name: name || "Tax rate",
        percentage: finite(entry.percentage),
        amount: finite(entry.amount),
      },
    ];
  });
}

export function calculateTaxRemittance(
  invoices: Array<Record<string, unknown>>,
): TaxRemittanceRow[] {
  const grouped = new Map<
    string,
    TaxRemittanceRow & { invoiceIds: Set<string> }
  >();

  for (const invoice of invoices) {
    if (invoice.deletedAt != null || invoice.status === "voided") continue;
    const total = finite(invoice.total);
    const paid = finite(invoice.amountPaid);
    const collectedFraction =
      total > 0 ? Math.max(0, Math.min(1, paid / total)) : 0;
    for (const tax of readTaxBreakdown(invoice.taxBreakdown)) {
      const key = tax.taxRateId || `${tax.name}:${tax.percentage}`;
      const current = grouped.get(key) ?? {
        ...tax,
        assessedAmount: 0,
        collectedAmount: 0,
        invoiceCount: 0,
        invoiceIds: new Set<string>(),
      };
      current.assessedAmount = roundMoney(current.assessedAmount + tax.amount);
      current.collectedAmount = roundMoney(
        current.collectedAmount + roundMoney(tax.amount * collectedFraction),
      );
      current.invoiceIds.add(String(invoice._id ?? invoice.id ?? ""));
      current.invoiceCount = current.invoiceIds.size;
      grouped.set(key, current);
    }
  }

  return [...grouped.values()]
    .map(({ invoiceIds: _invoiceIds, ...row }) => row)
    .sort(
      (a, b) =>
        b.collectedAmount - a.collectedAmount || a.name.localeCompare(b.name),
    );
}
