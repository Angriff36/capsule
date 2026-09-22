import type {
  BundleMenuItem,
  BundleTimelineEntry,
  EventBundlePart,
} from "./eventBundle";
import {
  bundleNotesFromSections,
  splitBeoNoteSections,
} from "./beoNoteSections";
import { valueAfterLabel } from "./csvRows";
import {
  parseAddressBlob,
  parseClockMinutes,
  parseCount,
  parseEmail,
  parsePersonBlob,
  parsePhone,
  parseReportDate,
  readCoordinates,
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
// "30 Serving Charcuterie Display", "30 Each Black Disposable Place Setting".
const SERVING_QUANTITY =
  /^([\d.]+)\s+(?:Serving|Each|Ea|Pcs?|Pieces?|Portions?)\b/i;

/** Excel stores dates as days since 1899-12-30. */
function fromExcelSerial(value: string | undefined): string | undefined {
  if (value === undefined || !/^\d{4,6}$/.test(value.trim())) return undefined;
  const days = Number(value);
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * The Date cell arrives either printed (`9/12/2026`, what the typed workbook
 * grid renders for a date-formatted cell) or as the raw Excel serial (a
 * General-formatted cell, or a raw-grid read). Neither shape is guessed at:
 * anything else leaves eventDate unset and the BEO warning stands.
 */
function parseBeoDate(value: string | undefined): string | undefined {
  return parseReportDate(value) ?? fromExcelSerial(value);
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
  // A remote site (a campsite) prints its GPS pair where a street goes; the
  // pair is the venue location, never a street "47." with ZIP "01359".
  const coordinates = locationBeforeContact
    ? readCoordinates(locationBeforeContact)
    : undefined;
  const locationText = coordinates
    ? locationBeforeContact?.replace(coordinates.matched, " ").trim()
    : locationBeforeContact;
  // The venue name runs ahead of the street address with no separator.
  const venueName = locationText?.split(/\s*\d/)[0]?.trim();
  const streetText =
    venueName === undefined
      ? locationText
      : locationText?.slice(venueName.length);
  const address = streetText?.trim() ? parseAddressBlob(streetText) : undefined;
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

  // Every row between "Setup Notes" and the timeline header is note prose:
  // the workbook splits the notes over pages, one long cell per page, so a
  // page-2 cell holds Operations Notes and page 3 the Additional Tasks.
  const noteRows: string[] = [];
  let inNotes = false;
  for (const row of rows) {
    const first = row[0]?.trim() ?? "";
    if (/^Setup Notes$/i.test(first)) {
      inNotes = true;
      continue;
    }
    if (first === "Time" && row[2] === "Name") break;
    if (!inNotes || PRINTED_FOOTER.test(first)) continue;
    const text = rowText(row);
    if (text.trim()) noteRows.push(text);
  }
  const noteBlob =
    noteRows.length > 0
      ? noteRows.join(" ")
      : rows
          .map(rowText)
          .filter(
            (text) =>
              text.includes("Event Overview") || text.includes("Theme:"),
          )
          .join(" ");
  const sections = splitBeoNoteSections(noteBlob);

  const part: EventBundlePart = {
    source: "beo",
    header: {
      invoiceNumber: label("Invoice #"),
      title: label("Event Title"),
      eventDate: parseBeoDate(label("Date")),
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
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      // "Kamini (bride)": the role in brackets is part of the name TPP prints.
      contactName: location
        ?.match(/Venue Contact:\s*(.+?)\s*(?:Contact Phone|$)/i)?.[1]
        ?.trim(),
      contactPhone: parsePhone(
        location?.match(/Contact Phone #:\s*([\d()\-. ]+)/i)?.[1],
      ),
    },
    timeline: readTimeline(rows),
    menu: readMenu(rows),
    notes: bundleNotesFromSections(sections),
  };

  if (part.header?.eventDate === undefined) {
    part.warnings = ["BEO: event date could not be read from the Date cell."];
  }
  return part;
}
