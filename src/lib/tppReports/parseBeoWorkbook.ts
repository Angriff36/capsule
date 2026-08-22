import type {
  BundleMenuItem,
  BundleTimelineEntry,
  EventBundlePart,
} from "./eventBundle";
import { valueAfterLabel } from "./csvRows";
import {
  parseAddressBlob,
  parseClockMinutes,
  parseCount,
  parseEmail,
  parsePersonBlob,
  parsePhone,
} from "./reportValues";
import type { XlsxSheet } from "./xlsxReader";

/**
 * Parses the TPP "BEO" workbook — the banquet event order.
 *
 * The BEO is the richest single report: header facts, the full timeline, the
 * menu with per-item servings, and the setup-note prose. Where reports
 * disagree, the merge prefers this one.
 */

const PRINTED_FOOTER = /^printed date:/i;
const SERVING_QUANTITY = /^([\d.]+)\s+Serving/i;

/** Excel stores dates as days since 1899-12-30. */
function fromExcelSerial(value: string | undefined): string | undefined {
  if (value === undefined || !/^\d{4,6}$/.test(value.trim())) return undefined;
  const days = Number(value);
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function rowText(row: readonly string[]): string {
  return row.join(" ").replace(/\s+/g, " ").trim();
}

function readTimeline(rows: readonly string[][]): BundleTimelineEntry[] {
  const entries: BundleTimelineEntry[] = [];
  let inTimeline = false;

  for (const row of rows) {
    const first = row[0] ?? "";
    if (first === "Time" && row[2] === "Name") {
      inTimeline = true;
      continue;
    }
    if (!inTimeline) continue;
    if (first === "Time" && row[2] !== "Name") break;
    if (PRINTED_FOOTER.test(first)) continue;

    const minutes = parseClockMinutes(first);
    const name = row[2]?.trim();
    if (minutes === undefined || !name) continue;
    const notes = row[3]?.trim();
    entries.push(notes ? { name, minutes, notes } : { name, minutes });
  }
  return entries;
}

function readMenu(rows: readonly string[][]): BundleMenuItem[] {
  const items: BundleMenuItem[] = [];
  let course: string | undefined;
  let started = false;

  for (const row of rows) {
    if (row[0] === "Time" && row[2] === "Event Item") {
      started = true;
      continue;
    }
    if (!started) continue;
    if (PRINTED_FOOTER.test(row[0] ?? "")) continue;

    const second = row[2]?.trim() ?? "";
    const third = row[3]?.trim() ?? "";
    const servings = second.match(SERVING_QUANTITY);

    if (servings && third.length > 0) {
      const item: BundleMenuItem = { name: third };
      const quantity = Number(servings[1]);
      if (Number.isFinite(quantity)) item.quantityServings = quantity;
      if (course !== undefined) item.course = course;
      items.push(item);
      continue;
    }
    // A lone label in the item column starts a new menu section.
    if (second.length > 0 && third.length === 0 && !servings) {
      course = second;
      continue;
    }
    // Prose under an item is its description, or a "**" service note.
    const prose = row[0]?.trim() ?? "";
    const current = items.at(-1);
    if (prose.length > 0 && current) {
      if (prose.startsWith("**")) {
        current.specialInstructions = prose.replace(/^\*+\s*/, "");
      } else if (current.description === undefined) {
        current.description = prose;
      }
    }
  }
  return items;
}

/** Setup notes arrive as one long blob; split it on its known headings. */
function readNotes(blob: string): Record<string, string> {
  const headings = [
    "Event Overview",
    "Menu / Culinary Notes",
    "Operations Notes",
    "Buffetware / Servingware",
    "Decor Collection / Linen",
    "Equipment & Rentals",
    "Service Setup / Layout",
    "Catering Kitchen / Staging",
    "Additional Tasks / Responsibilities of Mangia",
  ];
  const found: Array<{ heading: string; index: number }> = [];
  for (const heading of headings) {
    const index = blob.indexOf(heading);
    if (index >= 0) found.push({ heading, index });
  }
  found.sort((a, b) => a.index - b.index);

  const sections: Record<string, string> = {};
  found.forEach((entry, position) => {
    const start = entry.index + entry.heading.length;
    const end = found[position + 1]?.index ?? blob.length;
    const text = blob.slice(start, end).trim();
    if (text.length > 0) sections[entry.heading] = text;
  });
  return sections;
}

/** Parse a BEO workbook into its bundle contribution. */
export function parseBeoWorkbook(
  sheets: readonly XlsxSheet[],
): EventBundlePart {
  const rows = sheets.flatMap((sheet) => sheet.rows);
  const label = (name: string) => {
    for (const row of rows) {
      const value = valueAfterLabel(row, name);
      if (value !== undefined) return value;
    }
    return undefined;
  };

  const eventTime = label("Event Time");
  const location = label("Location");
  const locationBeforeContact = location?.replace(
    /Venue Contact:[\s\S]*$/i,
    "",
  );
  // The venue name runs ahead of the street address with no separator.
  const venueName = locationBeforeContact?.split(/\s*\d/)[0]?.trim();
  const address = parseAddressBlob(
    venueName === undefined
      ? locationBeforeContact
      : locationBeforeContact?.slice(venueName.length),
  );
  const contact = parsePersonBlob(label("Contact"));
  const salesperson = label("Salesperson");
  const salespersonEmail = parseEmail(salesperson);
  const salespersonName = (
    salespersonEmail === undefined
      ? salesperson
      : salesperson?.replace(salespersonEmail, " ")
  )
    ?.match(/^[A-Za-z'.\- ]+/)?.[0]
    ?.trim();

  const noteBlob = rows
    .map(rowText)
    .filter(
      (text) => text.includes("Event Overview") || text.includes("Theme:"),
    )
    .join(" ");
  const sections = readNotes(noteBlob);

  const part: EventBundlePart = {
    source: "beo",
    header: {
      invoiceNumber: label("Invoice #"),
      title: label("Event Title"),
      eventDate: fromExcelSerial(label("Date")),
      startMinutes: parseClockMinutes(eventTime?.split("-")[0]),
      endMinutes: parseClockMinutes(eventTime?.split("-")[1]),
      guestCount: parseCount(label("Guest Count")),
      serviceStyle: label("Service Style"),
      occasion: label("Occasion")?.replace(/^\*+/, ""),
      eventType: label("Event Type"),
      salespersonName,
      salespersonEmail,
    },
    client: {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
    },
    venue: {
      name: venueName,
      addressLine1: address?.addressLine1,
      city: address?.city,
      region: address?.region,
      postalCode: address?.postalCode,
      contactName: location
        ?.match(
          /Venue Contact:\s*([A-Za-z'.\- ]+?)\s*(?:Contact Phone|$)/i,
        )?.[1]
        ?.trim(),
      contactPhone: parsePhone(
        location?.match(/Contact Phone #:\s*([\d()\-. ]+)/i)?.[1],
      ),
    },
    timeline: readTimeline(rows),
    menu: readMenu(rows),
    notes: {
      eventOverview: sections["Event Overview"],
      menuNotes: sections["Menu / Culinary Notes"],
      operationsNotes: sections["Operations Notes"],
      serviceSetup: sections["Service Setup / Layout"],
      cateringKitchen: sections["Catering Kitchen / Staging"],
      equipmentRentals: sections["Equipment & Rentals"],
      decor: sections["Decor Collection / Linen"],
      additionalTasks:
        sections["Additional Tasks / Responsibilities of Mangia"],
    },
  };

  if (part.header?.eventDate === undefined) {
    part.warnings = ["BEO: event date could not be read from the Date cell."];
  }
  return part;
}
