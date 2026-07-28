import { jsPDF } from "jspdf";
import { formatTime } from "../../lib/format";
import { addPdfLogo, documentAddressLines } from "../admin/pdfBranding";
import {
  brandColorRgb,
  loadTenantBrandingForPdf,
  type TenantBranding,
} from "../admin/tenantBranding";

export interface BeoEventRecord {
  _id: string;
  stage: string;
  title: string;
  primaryContactName?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  expectedHeadcount: number;
  eventType: string;
  venueName?: string | null;
  venueAddress?: string | null;
  quotedPrice?: number | null;
  serviceRequirements?: string | null;
  operationalRequirements?: string | null;
  accessibilityNeeds?: string[] | null;
}

export interface BeoDishLine {
  selection: {
    course?: string | null;
    quantityServings: number;
    serviceStyle?: string | null;
    specialInstructions?: string | null;
  };
  dish:
    | {
        course?: string | null;
        name: string;
      }
    | undefined;
}

export interface BeoStaffLine {
  assignment: {
    role: string;
    startsAt?: number | null;
    endsAt?: number | null;
    notes?: string | null;
    status: string;
  };
  person:
    | {
        givenName: string;
        familyName: string;
      }
    | null
    | undefined;
}

export interface BeoPdfInput {
  event: BeoEventRecord;
  clientName: string;
  dishes: BeoDishLine[];
  timeline: Array<{
    name: string;
    startsAt?: number | null;
    endsAt?: number | null;
    responsibleParty?: string | null;
    notes?: string | null;
  }>;
  staff: BeoStaffLine[];
  branding: TenantBranding;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 36;
const RIGHT = PAGE_WIDTH - MARGIN;
const FOOTER_Y = PAGE_HEIGHT - 28;

interface BeoBlock {
  primary: string;
  secondary?: string;
}

const dateTime = (value: unknown) => {
  if (value == null) return "Not scheduled";
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime())
    ? "Not scheduled"
    : date.toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};

const cleanLabel = (value: unknown) =>
  String(value ?? "event")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "event";

export function beoPdfFileName(event: BeoEventRecord): string {
  return `beo-${cleanLabel(event.title)}.pdf`;
}

const plain = (value: unknown, fallback = "Not recorded") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const joinDetails = (values: unknown[]) =>
  values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" | ");

const clockTime = (value: unknown) => {
  if (value == null) return "Time not set";
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime())
    ? "Time not set"
    : formatTime(date.getTime());
};

const clockRange = (startsAt: unknown, endsAt: unknown) =>
  endsAt == null
    ? clockTime(startsAt)
    : `${clockTime(startsAt)} - ${clockTime(endsAt)}`;

const personName = (line: BeoStaffLine) =>
  line.person
    ? `${line.person.givenName} ${line.person.familyName}`.trim()
    : "Unresolved staff member";

const statusLabel = (value: unknown) =>
  plain(value, "assigned").replaceAll("_", " ");

const wrappedLines = (
  doc: jsPDF,
  text: string,
  width: number,
  fontSize: number,
  weight: "bold" | "normal",
) => {
  doc.setFont("helvetica", weight);
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(text, width) as string[];
};

const blockHeight = (
  doc: jsPDF,
  block: BeoBlock,
  width: number,
  fontSize: number,
) => {
  const primary = wrappedLines(doc, block.primary, width, fontSize, "bold");
  const secondary = block.secondary
    ? wrappedLines(doc, block.secondary, width, fontSize * 0.88, "normal")
    : [];
  return (
    primary.length * fontSize * 1.22 + secondary.length * fontSize * 1.08 + 7
  );
};

const fittedFontSize = (
  doc: jsPDF,
  blocks: BeoBlock[],
  width: number,
  maxHeight: number,
) => {
  const totalAt = (fontSize: number) =>
    blocks.reduce(
      (total, block) => total + blockHeight(doc, block, width, fontSize),
      0,
    );
  for (let size = 8.5; size >= 4; size -= 0.5) {
    if (totalAt(size) <= maxHeight) return size;
  }
  const smallestHeight = totalAt(4);
  return Math.max(2.75, 4 * (maxHeight / smallestHeight));
};

export function buildBeoPdf(input: BeoPdfInput): jsPDF {
  const { event, clientName, dishes, branding } = input;
  const primary = brandColorRgb(branding.primaryColor);
  const accent = brandColorRgb(branding.accentColor);
  const address = documentAddressLines(branding);
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  doc.setFillColor(...primary);
  doc.rect(0, 0, PAGE_WIDTH, 104, "F");
  const hasLogo = addPdfLogo(doc, branding, {
    x: MARGIN,
    y: 20,
    maxWidth: 96,
    maxHeight: 28,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(hasLogo ? 9 : 12);
  doc.setTextColor(255, 255, 255);
  doc.text(branding.displayName, MARGIN, hasLogo ? 63 : 34);
  if (address.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(224, 230, 226);
    doc.text(address.slice(0, 2), MARGIN, hasLogo ? 76 : 49);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("BANQUET EVENT ORDER", RIGHT, 38, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(224, 230, 226);
  doc.text(
    `${String(event.stage).replaceAll("_", " ").toUpperCase()} | ${event._id}`,
    RIGHT,
    55,
    { align: "right" },
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(plain(event.title, "Catering event"), RIGHT, 84, {
    align: "right",
    maxWidth: 360,
  });

  const overviewY = 120;
  const overviewWidth = RIGHT - MARGIN;
  const overviewGap = 9;
  const overviewColumnWidth = (overviewWidth - overviewGap * 3) / 4;
  const overview = [
    {
      label: "Client",
      primary: plain(clientName),
      secondary: plain(event.primaryContactName, "No primary contact"),
    },
    {
      label: "Date and time",
      primary: dateTime(event.startsAt),
      secondary: `Ends ${dateTime(event.endsAt)}`,
    },
    {
      label: "Guest count",
      primary: `${event.expectedHeadcount ?? 0} guests`,
      secondary: plain(event.eventType, "Event type not recorded"),
    },
    {
      label: "Venue",
      primary: plain(event.venueName, "Venue not assigned"),
      secondary: plain(event.venueAddress, "Address not recorded"),
    },
  ];

  overview.forEach((item, index) => {
    const x = MARGIN + index * (overviewColumnWidth + overviewGap);
    doc.setFillColor(245, 246, 243);
    doc.roundedRect(x, overviewY, overviewColumnWidth, 92, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...accent);
    doc.text(item.label.toUpperCase(), x + 10, overviewY + 16);
    const mainLines = wrappedLines(
      doc,
      item.primary,
      overviewColumnWidth - 20,
      9,
      "bold",
    ).slice(0, 3);
    doc.setTextColor(28, 32, 30);
    doc.text(mainLines, x + 10, overviewY + 33);
    const secondaryY = overviewY + 40 + mainLines.length * 10;
    const secondaryLines = wrappedLines(
      doc,
      item.secondary,
      overviewColumnWidth - 20,
      6.5,
      "normal",
    ).slice(0, 3);
    doc.setTextColor(103, 108, 105);
    doc.text(secondaryLines, x + 10, secondaryY);
  });

  const timeline = input.timeline
    .slice()
    .sort(
      (left, right) => Number(left.startsAt ?? 0) - Number(right.startsAt ?? 0),
    );

  const menuBlocks: BeoBlock[] =
    dishes.length === 0
      ? [{ primary: "No menu selections recorded" }]
      : dishes.map(({ selection, dish }) => ({
          primary: `${plain(selection.course || dish?.course, "Dish")} - ${plain(dish?.name, "Unnamed dish")}`,
          secondary: joinDetails([
            `${Number(selection.quantityServings ?? 0)} servings`,
            selection.serviceStyle,
            selection.specialInstructions,
          ]),
        }));
  const timelineBlocks: BeoBlock[] =
    timeline.length === 0
      ? [{ primary: "No timeline activities recorded" }]
      : timeline.map((activity) => ({
          primary: `${clockRange(activity.startsAt, activity.endsAt)} - ${plain(activity.name, "Unnamed activity")}`,
          secondary: joinDetails([activity.responsibleParty, activity.notes]),
        }));
  const staffBlocks: BeoBlock[] =
    input.staff.length === 0
      ? [{ primary: "No staff assignments recorded" }]
      : input.staff
          .slice()
          .sort(
            (left, right) =>
              Number(left.assignment.startsAt ?? 0) -
                Number(right.assignment.startsAt ?? 0) ||
              personName(left).localeCompare(personName(right)),
          )
          .map((line) => ({
            primary: `${personName(line)} - ${plain(line.assignment.role, "Role not set")}`,
            secondary: joinDetails([
              line.assignment.startsAt == null
                ? null
                : clockRange(line.assignment.startsAt, line.assignment.endsAt),
              statusLabel(line.assignment.status),
              line.assignment.notes,
            ]),
          }));

  const collectionY = 230;
  const collectionHeight = 326;
  const collectionGap = 12;
  const collectionWidth = (RIGHT - MARGIN - collectionGap * 2) / 3;
  const drawCollection = (x: number, title: string, blocks: BeoBlock[]) => {
    doc.setFillColor(249, 249, 247);
    doc.roundedRect(
      x,
      collectionY,
      collectionWidth,
      collectionHeight,
      3,
      3,
      "F",
    );
    doc.setDrawColor(...accent);
    doc.setLineWidth(2);
    doc.line(x, collectionY, x + collectionWidth, collectionY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...primary);
    doc.text(title.toUpperCase(), x + 10, collectionY + 19);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(112, 117, 114);
    doc.text(
      String(blocks.length),
      x + collectionWidth - 10,
      collectionY + 19,
      {
        align: "right",
      },
    );

    const textX = x + 10;
    const textWidth = collectionWidth - 20;
    const textTop = collectionY + 32;
    const textHeight = collectionHeight - 40;
    const fontSize = fittedFontSize(doc, blocks, textWidth, textHeight);
    let cursor = textTop;
    blocks.forEach((block, index) => {
      if (index > 0) {
        doc.setDrawColor(225, 227, 223);
        doc.setLineWidth(0.5);
        doc.line(textX, cursor - 3.5, textX + textWidth, cursor - 3.5);
      }
      const primaryLines = wrappedLines(
        doc,
        block.primary,
        textWidth,
        fontSize,
        "bold",
      );
      doc.setTextColor(31, 35, 33);
      doc.text(primaryLines, textX, cursor);
      cursor += primaryLines.length * fontSize * 1.22;
      if (block.secondary) {
        const secondarySize = fontSize * 0.88;
        const secondaryLines = wrappedLines(
          doc,
          block.secondary,
          textWidth,
          secondarySize,
          "normal",
        );
        doc.setTextColor(101, 106, 103);
        doc.text(secondaryLines, textX, cursor + 1);
        cursor += secondaryLines.length * fontSize * 1.08;
      }
      cursor += 7;
    });
  };

  drawCollection(MARGIN, "Menu and service", menuBlocks);
  drawCollection(
    MARGIN + collectionWidth + collectionGap,
    "Day-of timeline",
    timelineBlocks,
  );
  drawCollection(
    MARGIN + (collectionWidth + collectionGap) * 2,
    "Staff assignments",
    staffBlocks,
  );

  const notesY = 574;
  const notesHeight = 160;
  doc.setFillColor(...primary);
  doc.roundedRect(MARGIN, notesY, RIGHT - MARGIN, notesHeight, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("SPECIAL INSTRUCTIONS", MARGIN + 12, notesY + 20);

  const noteBlocks = [
    {
      label: "Service",
      value: plain(event.serviceRequirements, "No service notes recorded."),
    },
    {
      label: "Operations",
      value: plain(
        event.operationalRequirements,
        "No operational notes recorded.",
      ),
    },
    {
      label: "Accessibility",
      value:
        Array.isArray(event.accessibilityNeeds) &&
        event.accessibilityNeeds.length > 0
          ? event.accessibilityNeeds.join(", ")
          : "No accessibility notes recorded.",
    },
  ];
  const noteGap = 16;
  const noteWidth = (RIGHT - MARGIN - 24 - noteGap * 2) / 3;
  noteBlocks.forEach((note, index) => {
    const x = MARGIN + 12 + index * (noteWidth + noteGap);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(205, 224, 210);
    doc.text(note.label.toUpperCase(), x, notesY + 40);
    const availableHeight = notesHeight - 55;
    const block = { primary: note.value };
    const fontSize = Math.min(
      8,
      fittedFontSize(doc, [block], noteWidth, availableHeight),
    );
    const lines = wrappedLines(doc, note.value, noteWidth, fontSize, "normal");
    doc.setTextColor(255, 255, 255);
    doc.text(lines, x, notesY + 55);
  });

  doc.setDrawColor(220, 221, 218);
  doc.line(MARGIN, FOOTER_Y - 10, RIGHT, FOOTER_Y - 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110, 115, 112);
  doc.text(
    `${branding.displayName} | BEO | Live event record`,
    MARGIN,
    FOOTER_Y,
  );
  doc.text("1 / 1", RIGHT, FOOTER_Y, { align: "right" });
  return doc;
}

export async function downloadBeoPdf(input: BeoPdfInput): Promise<void> {
  const branding = await loadTenantBrandingForPdf(input.branding);
  buildBeoPdf({ ...input, branding }).save(beoPdfFileName(input.event));
}
