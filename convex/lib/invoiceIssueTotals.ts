import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  calculateInvoiceTax,
  INVOICE_LINE_CATEGORIES,
  type InvoiceLineCategory,
  type InvoiceLineDraft,
} from "../../src/features/finance/invoiceTax";
import { LedgerMoney } from "../../src/lib/ledgerMoney";

/**
 * PL-AUTH (AC-372): an invoice issued with lines must carry the money the
 * server works out from those lines, not money the browser worked out.
 * Runs inside the Invoice.issue transaction (handleManifestEvent, first issue
 * only), so a mismatch rolls the issue back.
 *
 * What a person types stays theirs: each line's description, kind, quantity
 * and unit price, and the invoice discount. What is worked out is checked:
 * each line's subtotal, tax and total, the tax per rate, and the invoice
 * subtotal and tax - from the workspace's own tax rates and the client's
 * tax-exempt setting, with the same calculation the issue form shows
 * (src/features/finance/invoiceTax.ts). The generated command already holds
 * total = subtotal + tax - discount.
 *
 * An invoice with no lines is a single amount: the approval cascade copies the
 * event's quoted price, and an import copies the amount from the outside
 * record. Those are not checked here.
 */
export async function assertInvoiceIssueTotals(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
): Promise<void> {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice || invoice.deletedAt != null) return;
  const stored = invoice.lineItems as unknown;
  if (!Array.isArray(stored) || stored.length === 0) return;

  const drafts = stored.map(readDraft);
  const client = await ctx.db.get(invoice.clientId as Id<"clients">);
  const taxExempt =
    client?.tenantId === invoice.tenantId && client.taxExempt === true;
  const rates = await ctx.db
    .query("taxRates")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", invoice.tenantId))
    .collect();
  const worked = calculateInvoiceTax(drafts, rates, taxExempt);

  const matches =
    cents(invoice.subtotal) === cents(worked.subtotal) &&
    cents(invoice.taxAmount) === cents(worked.taxAmount) &&
    JSON.stringify(stored.map(lineShape)) ===
      JSON.stringify(worked.lineItems.map(lineShape)) &&
    JSON.stringify(asArray(invoice.taxBreakdown).map(rateShape)) ===
      JSON.stringify(worked.taxBreakdown.map(rateShape));
  if (!matches) {
    throw new Error(
      "The invoice lines and tax don't add up to the amounts sent. The tax rates may have changed while the form was open. Open the invoice form again and issue it.",
    );
  }
}

function readDraft(entry: unknown, index: number): InvoiceLineDraft {
  const line = isRecord(entry) ? entry : {};
  const category = line.category as InvoiceLineCategory;
  const quantity = Number(line.quantity);
  const unitPrice = Number(line.unitPrice);
  if (
    typeof line.description !== "string" ||
    !INVOICE_LINE_CATEGORIES.includes(category) ||
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    !Number.isFinite(unitPrice) ||
    unitPrice < 0
  ) {
    throw new Error(
      `Invoice line ${index + 1} needs a description, a kind (food, service or rental), and a quantity and price of zero or more.`,
    );
  }
  return {
    id: String(index),
    description: line.description,
    category,
    quantity,
    unitPrice,
  };
}

function lineShape(entry: unknown): unknown[] {
  const line = isRecord(entry) ? entry : {};
  return [
    String(line.description ?? "").trim(),
    line.category,
    Number(line.quantity),
    cents(line.unitPrice),
    cents(line.subtotal),
    cents(line.taxAmount),
    cents(line.total),
    asArray(line.appliedTaxRates).map(rateShape),
  ];
}

function rateShape(entry: unknown): unknown[] {
  const rate = isRecord(entry) ? entry : {};
  return [String(rate.taxRateId ?? ""), Number(rate.percentage), cents(rate.amount)];
}

function cents(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? LedgerMoney.fromDollars(parsed).toCents() : NaN;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
