import { jsPDF } from "jspdf";
import { formatCountNoun, formatTime } from "../../lib/format";
import { addPdfLogo, documentAddressLines } from "../admin/pdfBranding";
import {
  brandColorRgb,
  loadTenantBrandingForPdf,
  type TenantBranding,
} from "../admin/tenantBranding";
import { displayEventMenuNotes } from "./eventMenuLineFields";
import type { StaffingRosterEntry } from "./eventTimelineStaffRoster";

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
  staff: Array<BeoStaffLine | StaffingRosterEntry>;
  branding: TenantBranding;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 36;
const RIGHT = PAGE_WIDTH - MARGIN;
const FOOTER_Y = PAGE_HEIGHT - 28;
// DESIGN.md's 15px body / 13px metadata floors, expressed in PDF points.
const BODY_FONT_SIZE = 11.25;
const DETAIL_FONT_SIZE = 9.75;
const CONTENT_BOTTOM = FOOTER_Y - 24;

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

// Client portal payloads still carry assignment/person pairs. Event detail
// supplies the canonical roster, including filled requests and manual shifts.
type BeoRosterEntry = Omit<StaffingRosterEntry, "key" | "personId">;

const staffEntry = (
  line: BeoStaffLine | StaffingRosterEntry,
): BeoRosterEntry | null => {
  if (!("assignment" in line)) return line;
  if (
    line.assignment.status === "unassigned" ||
    line.assignment.status === "cancelled"
  )
    return null;
  return {
    label: line.person
      ? `${line.person.givenName} ${line.person.familyName}`.trim()
      : "Unresolved staff member",
    role: line.assignment.role,
    status: line.assignment.status,
    source: "assignment",
    plannedWindows: [line.assignment],
    startsAt: line.assignment.startsAt,
    endsAt: line.assignment.endsAt,
    notes: line.assignment.notes ? [line.assignment.notes] : [],
  };
};

const staffingSourceLabels: Record<StaffingRosterEntry["source"], string> = {
  assignment: "Assignment",
  filled_need: "Filled staffing request",
  shift: "Shift",
};

const staffDetails = (entry: BeoRosterEntry) => {
  const windows = entry.shiftWindows?.length
    ? entry.shiftWindows
    : (entry.plannedWindows ?? [entry]);
  return joinDetails([
    [...new Set(entry.sources ?? [entry.source])]
      .map((source) => staffingSourceLabels[source])
      .join(" + "),
    ...windows.map(
      (window) =>
        `${entry.shiftWindows?.length ? "" : "Planned: "}${dateTime(window.startsAt)} - ${dateTime(window.endsAt)}`,
    ),
    statusLabel(entry.status),
    ...new Set(entry.notes ?? []),
  ]);
};

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

export function buildBeoPdf(input: BeoPdfInput): jsPDF {
  const { event, clientName, dishes, branding } = input;
  const primary = brandColorRgb(branding.primaryColor);
  const accent = brandColorRgb(branding.accentColor);
  const address = documentAddressLines(branding);
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  // Leave room for differences between PDF readers' built-in font metrics.
  const textWidth = RIGHT - MARGIN - 12;
  const contentTop = 118;
  let cursor = contentTop;

  const drawPageHeader = () => {
    doc.setFillColor(...primary);
    doc.rect(0, 0, PAGE_WIDTH, 96, "F");
    addPdfLogo(doc, branding, {
      x: MARGIN,
      y: 18,
      maxWidth: 96,
      maxHeight: 24,
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("BANQUET EVENT ORDER", RIGHT, 36, { align: "right" });
    // The full title is in Event details. Keep the repeated header bounded
    // even when a title is longer than a page; the event ID stays unabridged.
    const titleLines = wrappedLines(
      doc,
      plain(event.title, "Catering event"),
      textWidth - 16,
      BODY_FONT_SIZE,
      "bold",
    );
    doc.text(
      `${titleLines[0]}${titleLines.length > 1 ? "..." : ""}`,
      MARGIN,
      62,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(DETAIL_FONT_SIZE);
    doc.text(`Event ${event._id}`, MARGIN, 80);
    cursor = contentTop;
  };

  const nextPage = () => {
    doc.addPage();
    drawPageHeader();
  };

  const drawSection = (title: string, blocks: BeoBlock[]) => {
    const headingHeight = 26;
    const drawHeading = (continued = false) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(BODY_FONT_SIZE);
      doc.setTextColor(...primary);
      doc.text(
        `${title.toUpperCase()}${continued ? " (CONTINUED)" : ""}`,
        MARGIN,
        cursor,
      );
      doc.setDrawColor(...accent);
      doc.setLineWidth(0.75);
      doc.line(MARGIN, cursor + 7, RIGHT, cursor + 7);
      cursor += headingHeight;
    };
    // Keep a heading with at least the beginning of its first entry.
    if (cursor + headingHeight + BODY_FONT_SIZE * 2.6 > CONTENT_BOTTOM)
      nextPage();
    drawHeading();
    blocks.forEach((block) => {
      const lines = [
        ...wrappedLines(
          doc,
          block.primary,
          textWidth,
          BODY_FONT_SIZE,
          "bold",
        ).map((text) => ({
          text,
          size: BODY_FONT_SIZE,
          weight: "bold" as const,
        })),
        ...(block.secondary
          ? wrappedLines(
              doc,
              block.secondary,
              textWidth,
              DETAIL_FONT_SIZE,
              "normal",
            ).map((text) => ({
              text,
              size: DETAIL_FONT_SIZE,
              weight: "normal" as const,
            }))
          : []),
      ];
      const height = lines.reduce((sum, line) => sum + line.size * 1.3, 0);
      // Keep normal entries together. An entry taller than a page is split
      // line by line, so even a very long service note remains complete.
      if (
        height <= CONTENT_BOTTOM - contentTop - headingHeight &&
        cursor + height > CONTENT_BOTTOM
      ) {
        nextPage();
        drawHeading(true);
      }
      for (const [lineIndex, line] of lines.entries()) {
        if (cursor + line.size * 1.3 > CONTENT_BOTTOM) {
          nextPage();
          drawHeading(true);
          if (lineIndex > 0) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(BODY_FONT_SIZE);
            doc.setTextColor(15, 15, 17);
            doc.text("Entry continued:", MARGIN, cursor);
            cursor += BODY_FONT_SIZE * 1.3 + 2;
          }
        }
        doc.setFont("helvetica", line.weight);
        doc.setFontSize(line.size);
        if (line.weight === "bold") doc.setTextColor(15, 15, 17);
        else doc.setTextColor(59, 62, 69);
        doc.text(line.text, MARGIN, cursor);
        cursor += line.size * 1.3;
      }
      cursor += 9;
    });
    cursor += 12;
  };

  drawPageHeader();
  drawSection("Event details", [
    {
      primary: plain(event.title, "Catering event"),
      secondary: statusLabel(event.stage),
    },
    { primary: branding.displayName, secondary: address.join("\n") },
    {
      primary: `Client: ${plain(clientName)}`,
      secondary: plain(event.primaryContactName, "No primary contact"),
    },
    {
      primary: `Date and time: ${dateTime(event.startsAt)}`,
      secondary: `Ends ${dateTime(event.endsAt)}`,
    },
    {
      primary: formatCountNoun(event.expectedHeadcount ?? 0, "guest"),
      secondary: plain(event.eventType, "Event type not recorded"),
    },
    {
      primary: `Venue: ${plain(event.venueName, "Venue not assigned")}`,
      secondary: plain(event.venueAddress, "Address not recorded"),
    },
  ]);

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
            displayEventMenuNotes(selection.specialInstructions),
          ]),
        }));
  const timelineBlocks: BeoBlock[] =
    timeline.length === 0
      ? [{ primary: "No timeline activities recorded" }]
      : timeline.map((activity) => ({
          primary: `${clockRange(activity.startsAt, activity.endsAt)} - ${plain(activity.name, "Unnamed activity")}`,
          secondary: joinDetails([activity.responsibleParty, activity.notes]),
        }));
  const staff = input.staff
    .map(staffEntry)
    .filter((entry): entry is BeoRosterEntry => entry !== null);
  const staffBlocks: BeoBlock[] =
    staff.length === 0
      ? [{ primary: "No staff coverage recorded" }]
      : staff
          .sort(
            (left, right) =>
              Number(left.startsAt ?? 0) - Number(right.startsAt ?? 0) ||
              left.label.localeCompare(right.label),
          )
          .map((line) => ({
            primary: `${line.label} - ${plain(line.role, "Role not set")}`,
            secondary: staffDetails(line),
          }));

  drawSection("Menu and service", menuBlocks);
  drawSection("Day-of timeline", timelineBlocks);
  drawSection("Staff coverage", staffBlocks);
  drawSection("Special instructions", [
    {
      primary: "Service",
      secondary: plain(event.serviceRequirements, "No service notes recorded."),
    },
    {
      primary: "Operations",
      secondary: plain(
        event.operationalRequirements,
        "No operational notes recorded.",
      ),
    },
    {
      primary: "Accessibility",
      secondary: event.accessibilityNeeds?.length
        ? event.accessibilityNeeds.join(", ")
        : "No accessibility notes recorded.",
    },
  ]);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(217, 220, 225);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, FOOTER_Y - 14, RIGHT, FOOTER_Y - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(DETAIL_FONT_SIZE);
    doc.setTextColor(59, 62, 69);
    doc.text("BEO | Live event record", MARGIN, FOOTER_Y);
    doc.text(`${page} / ${pageCount}`, RIGHT, FOOTER_Y, { align: "right" });
  }
  return doc;
}

export async function downloadBeoPdf(input: BeoPdfInput): Promise<void> {
  const branding = await loadTenantBrandingForPdf(input.branding);
  buildBeoPdf({ ...input, branding }).save(beoPdfFileName(input.event));
}
