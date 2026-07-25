import { jsPDF } from "jspdf";
import { addPdfLogo, documentAddressLines } from "../admin/pdfBranding";
import {
  brandColorRgb,
  loadTenantBrandingForPdf,
  type TenantBranding,
} from "../admin/tenantBranding";

export interface ProposalPdfRecord {
  _id: string;
  proposalNumber?: string | null;
  title: string;
  eventDate?: number | null;
  eventType?: string | null;
  guestCount: number;
  venueName?: string | null;
  venueAddress?: string | null;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  expiresAt?: number | null;
  notes?: string | null;
  terms?: string | null;
  // Optional sections for timeline, logistics, enhancements
  timelineItems?: TimelineItem[];
  venueLogistics?: VenueLogistics;
  enhancements?: Enhancement[];
  // Acceptance URL for CTA
  acceptanceUrl?: string;
}

export interface TimelineItem {
  time: string;
  activity: string;
  description?: string;
}

export interface VenueLogistics {
  loadIn?: string;
  access?: string;
  restrictions?: string;
  notes?: string;
  contact?: string;
}

export interface Enhancement {
  name: string;
  description?: string;
  price?: number;
}

export interface ProposalPdfInput {
  proposal: ProposalPdfRecord;
  clientName: string;
  branding: TenantBranding;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = RIGHT - MARGIN;
const FOOTER_Y = PAGE_HEIGHT - 32;

const INK = [28, 32, 30] as const;
const MUTED = [101, 108, 104] as const;
const PAPER = [246, 244, 238] as const;

const usd = (value: unknown) =>
  Number(value ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

const dateText = (value: unknown) => {
  if (value == null || value === "") return "Not specified";
  const date = new Date(
    typeof value === "number" ? value : Number(value) || String(value),
  );
  return Number.isNaN(date.getTime())
    ? "Not specified"
    : date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
};

const cleanLabel = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function proposalPdfFileName(proposal: ProposalPdfRecord): string {
  const label =
    cleanLabel(proposal.proposalNumber) ||
    cleanLabel(proposal.title) ||
    cleanLabel(proposal._id) ||
    "draft";
  return `proposal-${label}.pdf`;
}

export function buildProposalPdf(input: ProposalPdfInput): jsPDF {
  const { proposal, clientName, branding } = input;
  const brand = brandColorRgb(branding.primaryColor);
  const accent = brandColorRgb(branding.accentColor);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = 58;

  const addPage = () => {
    doc.addPage();
    y = 54;
  };

  const ensureSpace = (height: number) => {
    if (y + height > FOOTER_Y - 18) addPage();
  };

  const sectionLabel = (label: string) => {
    ensureSpace(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...accent);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 18;
  };

  const writeParagraph = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    for (let index = 0; index < lines.length; index += 1) {
      ensureSpace(14);
      doc.text(lines[index], MARGIN, y);
      y += 14;
    }
  };

  // Masthead.
  doc.setFillColor(...brand);
  doc.rect(0, 0, PAGE_WIDTH, 126, "F");
  const hasLogo = addPdfLogo(doc, branding, {
    x: RIGHT - 96,
    y: 22,
    maxWidth: 96,
    maxHeight: 36,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(225, 230, 226);
  doc.text(branding.displayName, MARGIN, y);
  const address = documentAddressLines(branding);
  if (address.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(address.slice(0, 2), MARGIN, y + 12);
  }
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text("PROPOSAL", MARGIN, y + (address.length > 0 ? 48 : 36));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(225, 230, 226);
  doc.text(
    String(proposal.proposalNumber || "Draft proposal"),
    RIGHT,
    y + (hasLogo ? 50 : 36),
    { align: "right" },
  );
  y = 158;

  // Client and validity metadata.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...accent);
  doc.text("PREPARED FOR", MARGIN, y);
  doc.text("VALID THROUGH", RIGHT, y, { align: "right" });
  y += 18;
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(clientName || "Client", MARGIN, y);
  doc.setFontSize(11);
  doc.text(dateText(proposal.expiresAt), RIGHT, y, { align: "right" });
  y += 34;

  // Event overview card.
  const overview = [
    ["Event", String(proposal.title || "Catering event")],
    ["Date", dateText(proposal.eventDate)],
    ["Format", String(proposal.eventType || "To be confirmed")],
    ["Guests", String(Number(proposal.guestCount ?? 0) || "To be confirmed")],
    [
      "Venue",
      [proposal.venueName, proposal.venueAddress].filter(Boolean).join(" - ") ||
        "To be confirmed",
    ],
  ] as const;
  doc.setFillColor(...PAPER);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 112, 8, 8, "F");
  let overviewY = y + 22;
  for (const [label, value] of overview) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), MARGIN + 16, overviewY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(value, MARGIN + 94, overviewY, { maxWidth: CONTENT_WIDTH - 112 });
    overviewY += 19;
  }
  y += 140;

  // Menu and transparent per-person rate.
  const guestCount = Number(proposal.guestCount ?? 0);
  const perPerson =
    guestCount > 0 ? Number(proposal.subtotal ?? 0) / guestCount : null;
  const menuItems = String(proposal.notes ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const visibleMenuItems =
    menuItems.length > 0 ? menuItems : ["Menu details to be confirmed."];
  const menuLineCount = visibleMenuItems.reduce((count, item) => {
    return (
      count +
      (doc.splitTextToSize(item, CONTENT_WIDTH - 150) as string[]).length
    );
  }, 0);
  const menuHeight = Math.max(58, 28 + menuLineCount * 14);
  ensureSpace(menuHeight + 38);
  sectionLabel("Proposed menu");
  doc.setFillColor(251, 250, 247);
  doc.roundedRect(MARGIN, y - 8, CONTENT_WIDTH, menuHeight, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...brand);
  doc.text(
    perPerson == null ? "Custom pricing" : `${usd(perPerson)} / person`,
    RIGHT - 14,
    y + 12,
    { align: "right" },
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  let menuY = y + 12;
  for (const item of visibleMenuItems) {
    const lines = doc.splitTextToSize(item, CONTENT_WIDTH - 150) as string[];
    doc.text("-", MARGIN + 14, menuY);
    doc.text(lines, MARGIN + 28, menuY);
    menuY += lines.length * 14;
  }
  y += menuHeight + 16;

  // Venue logistics section (if provided).
  if (proposal.venueLogistics != null) {
    sectionLabel("Venue logistics");
    const logistics = [
      ["Load-in", proposal.venueLogistics.loadIn ?? ""],
      ["Access", proposal.venueLogistics.access ?? ""],
      ["Restrictions", proposal.venueLogistics.restrictions ?? ""],
      ["Special notes", proposal.venueLogistics.notes ?? ""],
      ["Contact", proposal.venueLogistics.contact ?? ""],
    ].filter(([, value]) => value.trim() !== "") as Array<[string, string]>;
    if (logistics.length > 0) {
      for (const [label, value] of logistics) {
        ensureSpace(20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(label.toUpperCase(), MARGIN, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        const lines = doc.splitTextToSize(
          value,
          CONTENT_WIDTH - 80,
        ) as string[];
        doc.text(lines, MARGIN + 80, y);
        y += lines.length * 14 + 6;
      }
      y += 8;
    }
  }

  // Timeline section (if provided).
  if (proposal.timelineItems != null && proposal.timelineItems.length > 0) {
    sectionLabel("Timeline");
    for (const item of proposal.timelineItems) {
      ensureSpace(32);
      doc.setFillColor(251, 250, 247);
      doc.roundedRect(MARGIN, y - 6, CONTENT_WIDTH, 24, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...brand);
      doc.text(item.time, MARGIN + 12, y + 10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(item.activity, MARGIN + 96, y + 10);
      if (item.description != null && item.description.trim() !== "") {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        const descLines = doc.splitTextToSize(
          item.description,
          CONTENT_WIDTH - 108,
        ) as string[];
        doc.text(descLines, MARGIN + 96, y + 22);
        y += Math.max(24, descLines.length * 12 + 12);
      } else {
        y += 24;
      }
    }
    y += 8;
  }

  // Enhancements section (if provided).
  if (proposal.enhancements != null && proposal.enhancements.length > 0) {
    sectionLabel("Enhancements & upgrades");
    for (const enhancement of proposal.enhancements) {
      ensureSpace(32);
      doc.setFillColor(251, 250, 247);
      doc.roundedRect(MARGIN, y - 6, CONTENT_WIDTH, 24, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      const nameWithPrice =
        enhancement.price != null
          ? `${enhancement.name} (+${usd(enhancement.price)})`
          : enhancement.name;
      doc.text(nameWithPrice, MARGIN + 12, y + 10);
      if (
        enhancement.description != null &&
        enhancement.description.trim() !== ""
      ) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        const descLines = doc.splitTextToSize(
          enhancement.description,
          CONTENT_WIDTH - 24,
        ) as string[];
        doc.text(descLines, MARGIN + 12, y + 22);
        y += Math.max(24, descLines.length * 12 + 12);
      } else {
        y += 24;
      }
    }
    y += 8;
  }

  // Estimate summary.
  sectionLabel("Estimate");
  const summaryRows: Array<[string, string, boolean?]> = [
    ["Catering subtotal", usd(proposal.subtotal)],
  ];
  if (Number(proposal.discountAmount ?? 0) > 0) {
    summaryRows.push(["Discount", `-${usd(proposal.discountAmount)}`]);
  }
  summaryRows.push(["Tax", usd(proposal.taxAmount)]);
  summaryRows.push(["Total estimate", usd(proposal.total), true]);
  for (const [label, value, bold] of summaryRows) {
    ensureSpace(20);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    const rowColor = bold ? brand : INK;
    doc.setTextColor(rowColor[0], rowColor[1], rowColor[2]);
    doc.text(label, RIGHT - 210, y);
    doc.text(value, RIGHT, y, { align: "right" });
    y += bold ? 24 : 18;
  }
  doc.setDrawColor(...accent);
  doc.setLineWidth(1.5);
  doc.line(RIGHT - 218, y - 18, RIGHT, y - 18);
  y += 12;

  // Terms.
  sectionLabel("Terms");
  const terms = String(proposal.terms ?? "").trim();
  writeParagraph(
    terms || "No additional terms were provided for this proposal.",
  );

  // Next steps / CTA section.
  if (proposal.acceptanceUrl != null) {
    sectionLabel("Next steps");
    ensureSpace(60);
    doc.setFillColor(251, 250, 247);
    doc.roundedRect(MARGIN, y - 6, CONTENT_WIDTH, 54, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...brand);
    doc.text("To accept this proposal:", MARGIN + 14, y + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    const steps = [
      "1. Review all details above",
      "2. Contact us with any questions",
      "3. Confirm your acceptance by phone or email",
    ];
    let stepY = y + 26;
    for (const step of steps) {
      doc.text(step, MARGIN + 14, stepY);
      stepY += 11;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      "We'll follow up to confirm your booking and finalize details.",
      MARGIN + 14,
      stepY + 4,
    );
    y += 66;
  } else {
    // Generic next steps when no URL provided.
    sectionLabel("Next steps");
    ensureSpace(40);
    doc.setFillColor(251, 250, 247);
    doc.roundedRect(MARGIN, y - 6, CONTENT_WIDTH, 34, 6, 6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(
      "To proceed with this proposal, please contact us to discuss details and confirm your booking.",
      MARGIN + 14,
      y + 10,
    );
    doc.text(
      "We look forward to working with you on your event!",
      MARGIN + 14,
      y + 22,
    );
    y += 46;
  }

  // Footer on every page, including pages introduced by long menu/terms copy.
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(220, 221, 218);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, FOOTER_Y - 12, RIGHT, FOOTER_Y - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      [branding.displayName, ...address, `Prepared ${dateText(Date.now())}`]
        .filter(Boolean)
        .join(" | "),
      MARGIN,
      FOOTER_Y,
    );
    doc.text(`${page} / ${pageCount}`, RIGHT, FOOTER_Y, { align: "right" });
  }

  return doc;
}

export async function downloadProposalPdf(
  input: ProposalPdfInput,
): Promise<void> {
  const branding = await loadTenantBrandingForPdf(input.branding);
  buildProposalPdf({ ...input, branding }).save(
    proposalPdfFileName(input.proposal),
  );
}
