import { jsPDF } from "jspdf";
import { addPdfLogo, documentAddressLines } from "../admin/pdfBranding";
import {
  brandColorRgb,
  loadTenantBrandingForPdf,
  type TenantBranding,
} from "../admin/tenantBranding";

export interface InvoicePdfRecord {
  _id: string;
  invoiceNumber?: string | null;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  paymentTermsDays: number;
  depositAmount?: number | null;
  depositPaidAt?: number | null;
  dueDate?: number | null;
  notes?: string | null;
  status: string;
  issuedAt?: number | null;
  createdAt?: number | null;
  currencyCode?: string | null;
}

export interface InvoicePdfClient {
  clientType: string;
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  email?: string | null;
  taxId?: string | null;
}

export interface InvoicePdfEvent {
  title: string;
}

/** Everything the PDF needs; caller resolves records so this stays pure. */
export interface InvoicePdfInput {
  invoice: InvoicePdfRecord;
  client: InvoicePdfClient | undefined;
  event: InvoicePdfEvent | undefined;
  branding: TenantBranding;
}

const PAGE_WIDTH = 612; // letter, pt
const MARGIN = 54;
const RIGHT = PAGE_WIDTH - MARGIN;

const usd = (value: unknown) =>
  Number(value ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

const moneyFmt = (currencyCode?: string | null) => {
  const code = String(currencyCode ?? "")
    .trim()
    .toUpperCase();
  const safeCode = code.length === 3 ? code : "USD";
  return (value: unknown) =>
    Number(value ?? 0).toLocaleString("en-US", {
      style: "currency",
      currency: safeCode,
    });
};

const dateText = (value: unknown) =>
  value == null ? "—" : new Date(Number(value)).toLocaleDateString("en-US");

function clientNameOf(client: InvoicePdfClient | undefined): string {
  if (!client) return "Client";
  if (client.clientType === "company" && client.companyName)
    return client.companyName;
  const person = [client.givenName, client.familyName]
    .filter(Boolean)
    .join(" ");
  return person || client.companyName || "Client";
}

export function invoicePdfFileName(invoice: InvoicePdfRecord): string {
  const label = String(invoice.invoiceNumber || invoice._id).replace(
    /[^A-Za-z0-9_-]+/g,
    "-",
  );
  return `invoice-${label}.pdf`;
}

/** Build the tenant-branded invoice PDF. Returns the jsPDF document so
 * callers can save it, or serialize it for email attachment later. */
export function buildInvoicePdf(input: InvoicePdfInput): jsPDF {
  const { invoice, client, event, branding } = input;
  const brand = brandColorRgb(branding.primaryColor);
  const accent = brandColorRgb(branding.accentColor);
  const format = moneyFmt(invoice.currencyCode);
  const address = documentAddressLines(branding);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = 64;

  // Masthead: tenant brand left, document title right.
  const hasLogo = addPdfLogo(doc, branding, {
    x: MARGIN,
    y: 34,
    maxWidth: 92,
    maxHeight: 30,
  });
  if (hasLogo) y += 38;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...brand);
  doc.text(branding.displayName, MARGIN, y);
  if (address.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(address.slice(0, 3), MARGIN, y + 12);
  }
  doc.setFontSize(22);
  doc.setTextColor(...accent);
  doc.text("INVOICE", RIGHT, y, { align: "right" });
  y += Math.max(20, address.length * 10 + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(String(invoice.invoiceNumber || "Draft"), RIGHT, y, {
    align: "right",
  });
  y += 14;
  doc.setDrawColor(...brand);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, RIGHT, y);
  y += 28;

  // Bill-to block (left) and invoice metadata (right).
  const blockTop = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("BILL TO", MARGIN, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(clientNameOf(client), MARGIN, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const billLines = [
    client?.addressLine1,
    client?.addressLine2,
    [client?.city, client?.region, client?.postalCode]
      .filter(Boolean)
      .join(", "),
    client?.countryCode,
    client?.email,
    client?.taxId ? `Tax ID: ${client.taxId}` : null,
  ].filter((line): line is string => Boolean(line));
  for (const line of billLines) {
    doc.text(line, MARGIN, y);
    y += 13;
  }

  let metaY = blockTop;
  const metaRow = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(label, RIGHT - 170, metaY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(value, RIGHT, metaY, { align: "right" });
    metaY += 16;
  };
  metaRow("STATUS", String(invoice.status).replace("_", " ").toUpperCase());
  metaRow("ISSUED", dateText(invoice.issuedAt ?? invoice.createdAt));
  metaRow("DUE", dateText(invoice.dueDate));
  metaRow("TERMS", `Net ${Number(invoice.paymentTermsDays ?? 30)} days`);
  y = Math.max(y, metaY) + 24;

  // Charges. Line items are not itemized on the invoice record yet
  // (deferred OD040), so render one service line plus the summary.
  doc.setFillColor(245, 245, 245);
  doc.rect(MARGIN, y - 12, RIGHT - MARGIN, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("DESCRIPTION", MARGIN + 8, y);
  doc.text("AMOUNT", RIGHT - 8, y, { align: "right" });
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  const serviceLabel = event?.title
    ? `Catering services — ${String(event.title)}`
    : "Catering services";
  doc.text(serviceLabel, MARGIN + 8, y);
  doc.text(usd(invoice.subtotal), RIGHT - 8, y, { align: "right" });
  y += 10;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, RIGHT, y);
  y += 18;

  const summaryRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 10);
    doc.setTextColor(bold ? 20 : 60, bold ? 20 : 60, bold ? 20 : 60);
    doc.text(label, RIGHT - 170, y);
    doc.text(value, RIGHT - 8, y, { align: "right" });
    y += bold ? 20 : 16;
  };
  summaryRow("Subtotal", usd(invoice.subtotal));
  if (Number(invoice.discountAmount ?? 0) > 0)
    summaryRow("Discount", `-${usd(invoice.discountAmount)}`);
  summaryRow("Tax", usd(invoice.taxAmount));
  summaryRow("Total", usd(invoice.total), true);
  summaryRow("Amount paid", usd(invoice.amountPaid));
  if (Number(invoice.depositAmount ?? 0) > 0)
    summaryRow(
      invoice.depositPaidAt != null
        ? `Deposit (paid ${dateText(invoice.depositPaidAt)})`
        : "Deposit due",
      usd(invoice.depositAmount),
    );
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(1);
  doc.line(RIGHT - 178, y - 8, RIGHT, y - 8);
  y += 4;
  summaryRow("Balance due", usd(invoice.amountDue), true);
  y += 16;

  // Payment terms & instructions.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("PAYMENT TERMS & INSTRUCTIONS", MARGIN, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const instructions = [
    `Payment is due within ${Number(invoice.paymentTermsDays ?? 30)} days of the issue date${
      invoice.dueDate != null ? `, by ${dateText(invoice.dueDate)}` : ""
    }.`,
    `Please reference ${String(invoice.invoiceNumber || "this invoice")} with your payment${
      branding.displayName ? `, payable to ${branding.displayName}` : ""
    }.`,
    ...(invoice.notes ? [String(invoice.notes)] : []),
  ];
  for (const paragraph of instructions) {
    const wrapped = doc.splitTextToSize(paragraph, RIGHT - MARGIN) as string[];
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 13 + 4;
  }

  // Footer.
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    [
      branding.displayName,
      address[0],
      `Generated ${new Date().toLocaleDateString("en-US")}`,
    ]
      .filter(Boolean)
      .join(" · "),
    MARGIN,
    758,
  );
  return doc;
}

export async function downloadInvoicePdf(
  input: InvoicePdfInput,
): Promise<void> {
  const branding = await loadTenantBrandingForPdf(input.branding);
  buildInvoicePdf({ ...input, branding }).save(
    invoicePdfFileName(input.invoice),
  );
}
