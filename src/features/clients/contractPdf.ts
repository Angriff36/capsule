import { jsPDF } from "jspdf";
import { addPdfLogo, documentAddressLines } from "../admin/pdfBranding";
import {
  brandColorRgb,
  loadTenantBrandingForPdf,
  type TenantBranding,
} from "../admin/tenantBranding";

export interface ContractPdfRecord {
  _id: string;
  contractNumber?: string | null;
  title: string;
  expiresAt?: number | null;
  signedAt?: number | null;
  signedBy?: string | null;
  notes?: string | null;
}

export interface ContractPdfClient {
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
  paymentTermsDays?: number | null;
  taxExempt?: boolean;
}

export interface ContractPdfEvent {
  title: string;
  startsAt?: number | null;
  endsAt?: number | null;
  expectedHeadcount: number;
  venueName?: string | null;
  venueAddress?: string | null;
  quotedPrice?: number | null;
  serviceRequirements?: string | null;
  operationalRequirements?: string | null;
}

export interface ContractPdfInput {
  contract: ContractPdfRecord;
  client: ContractPdfClient;
  event: ContractPdfEvent;
  branding: TenantBranding;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = RIGHT - MARGIN;
const FOOTER_Y = PAGE_HEIGHT - 34;

const money = (value: unknown) =>
  Number(value ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

const dateText = (value: unknown) =>
  value == null
    ? "Not specified"
    : new Date(Number(value)).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

const dateTimeText = (value: unknown) =>
  value == null
    ? "To be confirmed"
    : new Date(Number(value)).toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

const clientName = (client: ContractPdfClient) => {
  if (client.clientType === "company" && client.companyName) {
    return client.companyName;
  }
  return (
    [client.givenName, client.familyName].filter(Boolean).join(" ") ||
    client.companyName ||
    "Client"
  );
};

const cleanLabel = (value: unknown) =>
  String(value ?? "contract")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "contract";

export function contractPdfFileName(contract: ContractPdfRecord): string {
  return `contract-${cleanLabel(contract.contractNumber || contract._id)}.pdf`;
}

export function buildContractPdf(input: ContractPdfInput): jsPDF {
  const { contract, client, event, branding } = input;
  const primary = brandColorRgb(branding.primaryColor);
  const accent = brandColorRgb(branding.accentColor);
  const address = documentAddressLines(branding);
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  doc.setFillColor(...primary);
  doc.rect(0, 0, PAGE_WIDTH, 128, "F");
  const hasLogo = addPdfLogo(doc, branding, {
    x: MARGIN,
    y: 24,
    maxWidth: 94,
    maxHeight: 30,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(hasLogo ? 9 : 13);
  doc.setTextColor(255, 255, 255);
  doc.text(branding.displayName, MARGIN, hasLogo ? 68 : 40);
  if (address.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(221, 230, 225);
    doc.text(address.slice(0, 2), MARGIN, hasLogo ? 82 : 55);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("CATERING AGREEMENT", RIGHT, 44, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(221, 230, 225);
  doc.text(`SIGNED · ${contract.contractNumber || contract._id}`, RIGHT, 63, {
    align: "right",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(contract.title, RIGHT, 94, { align: "right", maxWidth: 300 });

  let y = 160;
  const sectionLabel = (label: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...accent);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 18;
  };
  const detailRow = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(104, 110, 107);
    doc.text(label.toUpperCase(), MARGIN + 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(28, 32, 30);
    doc.text(value, MARGIN + 126, y, { maxWidth: CONTENT_WIDTH - 144 });
    y += 19;
  };

  sectionLabel("Agreement parties");
  doc.setFillColor(247, 247, 243);
  doc.roundedRect(MARGIN, y - 10, CONTENT_WIDTH, 68, 5, 5, "F");
  detailRow("Client", clientName(client));
  detailRow(
    "Billing address",
    [
      client.addressLine1,
      client.addressLine2,
      [client.city, client.region, client.postalCode]
        .filter(Boolean)
        .join(", "),
      client.countryCode,
    ]
      .filter(Boolean)
      .join(" · ") || "Not recorded",
  );
  detailRow("Provider", branding.displayName);
  y += 22;

  sectionLabel("Event and service");
  const eventRows = [
    ["Event", event.title],
    ["Starts", dateTimeText(event.startsAt)],
    ["Ends", dateTimeText(event.endsAt)],
    ["Guests", `${event.expectedHeadcount} expected`],
    [
      "Venue",
      [event.venueName, event.venueAddress].filter(Boolean).join(" · ") ||
        "To be confirmed",
    ],
    ["Service", event.serviceRequirements || "As agreed with the client"],
  ] as const;
  doc.setFillColor(251, 250, 247);
  doc.roundedRect(MARGIN, y - 10, CONTENT_WIDTH, 126, 5, 5, "F");
  for (const [label, value] of eventRows) detailRow(label, String(value));
  y += 18;

  sectionLabel("Commercial terms");
  detailRow("Agreement total", money(event.quotedPrice));
  detailRow(
    "Payment terms",
    `Net ${Number(client.paymentTermsDays ?? 30)} days from invoice`,
  );
  if (client.taxExempt) detailRow("Tax status", "Tax exempt");
  const notes = String(contract.notes ?? "").trim();
  if (notes) {
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(75, 80, 77);
    doc.text(doc.splitTextToSize(notes, CONTENT_WIDTH), MARGIN, y);
    y += Math.min(
      54,
      (doc.splitTextToSize(notes, CONTENT_WIDTH) as string[]).length * 12,
    );
  }
  if (contract.expiresAt != null) {
    detailRow("Offer valid through", dateText(contract.expiresAt));
  }

  y = Math.max(y + 18, 610);
  doc.setDrawColor(...primary);
  doc.setLineWidth(1);
  doc.line(MARGIN, y, MARGIN + 220, y);
  doc.line(RIGHT - 220, y, RIGHT, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text(contract.signedBy || "Client", MARGIN, y + 18);
  doc.text(branding.displayName, RIGHT - 220, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(102, 108, 105);
  doc.text(
    `Client signature recorded ${dateText(contract.signedAt)}`,
    MARGIN,
    y + 31,
  );
  doc.text("Catering provider", RIGHT - 220, y + 31);

  doc.setDrawColor(220, 221, 218);
  doc.line(MARGIN, FOOTER_Y - 10, RIGHT, FOOTER_Y - 10);
  doc.setFontSize(7.5);
  doc.setTextColor(110, 115, 112);
  doc.text(
    `${branding.displayName} · Signed catering agreement`,
    MARGIN,
    FOOTER_Y,
  );
  doc.text("1 / 1", RIGHT, FOOTER_Y, { align: "right" });
  return doc;
}

export async function downloadContractPdf(
  input: ContractPdfInput,
): Promise<void> {
  const branding = await loadTenantBrandingForPdf(input.branding);
  buildContractPdf({ ...input, branding }).save(
    contractPdfFileName(input.contract),
  );
}
