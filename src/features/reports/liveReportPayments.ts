/**
 * Project the Payment ledger onto invoices before the generic builder runs.
 * PaymentSettled is the only cash event: pending/processing/failed payments
 * have not been received, while refunded payments no longer count. The
 * invoice.amountPaid field is a command-maintained balance, useful as
 * evidence, but the live finance report's Collected KPI is sourced from these
 * payment rows rather than inferred from Invoice.total - Invoice.amountDue.
 */
export function rowsWithActualPayments(
  invoiceRows: readonly unknown[],
  paymentRows: readonly unknown[],
): readonly unknown[] {
  const paidByInvoice = new Map<string, number>();
  for (const payment of paymentRows) {
    if (!isRecord(payment) || payment.deletedAt != null) continue;
    if (payment.status !== "completed") continue;
    const invoiceId = String(payment.invoiceId ?? "");
    if (!invoiceId) continue;
    paidByInvoice.set(
      invoiceId,
      (paidByInvoice.get(invoiceId) ?? 0) + numberValue(payment.amount),
    );
  }
  return invoiceRows.map((invoice) => {
    if (!isRecord(invoice)) return invoice;
    const invoiceId = String(invoice._id ?? invoice.id ?? "");
    return {
      ...invoice,
      amountPaid: paidByInvoice.get(invoiceId) ?? 0,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
