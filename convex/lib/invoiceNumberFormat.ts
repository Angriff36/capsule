const AUTO_INVOICE_NUMBER = /^INV-(\d+)$/;

/** The `<n>` of an auto-shaped `INV-<n>` number, or null for any other shape. */
export function parseAutoInvoiceNumber(
  number: string | null | undefined,
): number | null {
  const match = number?.match(AUTO_INVOICE_NUMBER);
  return match ? Number(match[1]) : null;
}

export function formatAutoInvoiceNumber(n: number): string {
  return `INV-${n}`;
}
