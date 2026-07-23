import { jsPDF } from "jspdf";

export interface InvoiceReminderPdfInput {
  invoiceNumber: string;
  issuedAt?: number | null;
  dueDate: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  clientName: string;
  clientEmail: string;
  eventTitle?: string | null;
  companyName: string;
  companyAddress?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
}

const MARGIN = 54;
const PAGE_WIDTH = 612;
const RIGHT = PAGE_WIDTH - MARGIN;

const usd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const dateText = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" });

function colorRgb(value: string | null | undefined, fallback: string) {
  const normalized = /^#[0-9a-f]{6}$/iu.test(value?.trim() ?? "")
    ? String(value).trim()
    : fallback;
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ] as const;
}

export function invoiceReminderPdfFileName(invoiceNumber: string): string {
  return `invoice-${invoiceNumber.replace(/[^A-Za-z0-9_-]+/gu, "-")}.pdf`;
}

export function buildInvoiceReminderPdf(
  input: InvoiceReminderPdfInput,
): Uint8Array {
  const primary = colorRgb(input.primaryColor, "#233E35");
  const accent = colorRgb(input.accentColor, "#BE773F");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = 66;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...primary);
  doc.text(input.companyName, MARGIN, y);
  doc.setFontSize(22);
  doc.setTextColor(...accent);
  doc.text("INVOICE", RIGHT, y, { align: "right" });
  y += 18;
  if (input.companyAddress?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(
      doc.splitTextToSize(input.companyAddress.trim(), 260) as string[],
      MARGIN,
      y,
    );
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(input.invoiceNumber, RIGHT, y, { align: "right" });
  y += 28;
  doc.setDrawColor(...primary);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, RIGHT, y);
  y += 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("BILL TO", MARGIN, y);
  doc.text("INVOICE DETAILS", RIGHT - 170, y);
  y += 16;
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(input.clientName, MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Issued ${dateText(input.issuedAt)}`, RIGHT, y, { align: "right" });
  y += 15;
  doc.text(input.clientEmail, MARGIN, y);
  doc.text(`Due ${dateText(input.dueDate)}`, RIGHT, y, { align: "right" });
  y += 36;

  doc.setFillColor(245, 245, 245);
  doc.rect(MARGIN, y - 12, RIGHT - MARGIN, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("DESCRIPTION", MARGIN + 8, y);
  doc.text("AMOUNT", RIGHT - 8, y, { align: "right" });
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(
    input.eventTitle?.trim()
      ? `Catering services — ${input.eventTitle.trim()}`
      : "Catering services",
    MARGIN + 8,
    y,
  );
  doc.text(usd(input.subtotal), RIGHT - 8, y, { align: "right" });
  y += 28;

  const summaryRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 10);
    doc.setTextColor(20, 20, 20);
    doc.text(label, RIGHT - 170, y);
    doc.text(value, RIGHT - 8, y, { align: "right" });
    y += bold ? 21 : 16;
  };
  summaryRow("Subtotal", usd(input.subtotal));
  if (input.discountAmount > 0)
    summaryRow("Discount", `-${usd(input.discountAmount)}`);
  summaryRow("Tax", usd(input.taxAmount));
  summaryRow("Total", usd(input.total), true);
  summaryRow("Amount paid", usd(input.amountPaid));
  doc.setDrawColor(20, 20, 20);
  doc.line(RIGHT - 178, y - 8, RIGHT, y - 8);
  y += 4;
  summaryRow("Balance due", usd(input.amountDue), true);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `${input.companyName} · Invoice ${input.invoiceNumber} · Generated ${dateText(Date.now())}`,
    MARGIN,
    758,
  );

  return new Uint8Array(doc.output("arraybuffer"));
}

