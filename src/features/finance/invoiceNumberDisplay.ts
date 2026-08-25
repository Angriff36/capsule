/**
 * Display formatting for invoice numbers.
 *
 * Some invoices carry a raw Convex document id in `invoiceNumber` (the
 * EventApproved cascade seeds `invoiceNumber: payload.eventId` — see
 * src/sales/invoice.manifest). A 32-char id is not a usable invoice number
 * and overflows page titles, so displays fall back to a short reference
 * derived from the invoice's own document id (e.g. `INV-8BD5QP`).
 */

/** Lowercase alphanumeric with no separators at id-like length — not human. */
const RAW_DOCUMENT_ID_PATTERN = /^[a-z0-9]{24,}$/i;

export class InvoiceNumberFormatter {
  isRawDocumentId(value: string): boolean {
    return RAW_DOCUMENT_ID_PATTERN.test(value);
  }

  /**
   * Human display number, or null when the invoice has no number yet
   * (callers keep their own draft/untitled fallback copy).
   */
  format(invoiceNumber: unknown, invoiceId: unknown): string | null {
    const stored =
      typeof invoiceNumber === "string" ? invoiceNumber.trim() : "";
    if (stored.length === 0) return null;
    if (!this.isRawDocumentId(stored)) return stored;
    return this.shortReference(String(invoiceId ?? stored));
  }

  private shortReference(invoiceId: string): string {
    return `INV-${invoiceId.slice(-6).toUpperCase()}`;
  }
}

export const invoiceNumberFormatter = new InvoiceNumberFormatter();

export function formatInvoiceNumber(
  invoiceNumber: unknown,
  invoiceId: unknown,
): string | null {
  return invoiceNumberFormatter.format(invoiceNumber, invoiceId);
}
