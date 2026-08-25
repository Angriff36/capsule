import type {
  BundleMenuItem,
  BundleTimelineEntry,
  EventBundlePart,
} from "./eventBundle";
import { findLabelledValue, isBlankRow } from "./csvRows";
import {
  parseAddressBlob,
  parseClockMinutes,
  parseCount,
  parsePersonBlob,
  parsePhone,
  parseReportDate,
} from "./reportValues";

/**
 * Parses the TPP event worksheet — the operations view of the event.
 *
 * It carries the sales status, which no other report states, and the servings
 * the kitchen works to. Its menu quantities can differ from the BEO's, so the
 * merge reports the difference instead of hiding it.
 */

const PRINTED_FOOTER = /^printed date:/i;
const SECTION_TIMELINE = "timeline";
const SECTION_FOOD = "food";

function sectionOf(row: readonly string[]): string | undefined {
  const filled = row.filter((cell) => cell.length > 0);
  if (filled.length !== 1) return undefined;
  return filled[0]!.toLowerCase();
}

/**
 * A menu section heading is title case throughout, for example
 * "Mexican Grill Buffet". A description reads as prose and keeps its
 * lower-case words, for example "Flour tortillas warmed to perfection".
 */
function isSectionHeading(value: string): boolean {
  const words = value.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length === 0 || words.length > 6) return false;
  if (/[.]$/.test(value)) return false;
  return words.every((word) => word.length <= 3 || /^[^a-z]*[A-Z]/.test(word));
}

function readTimeline(rows: readonly string[][]): BundleTimelineEntry[] {
  const entries: BundleTimelineEntry[] = [];
  let active = false;

  for (const row of rows) {
    const section = sectionOf(row);
    if (section === SECTION_TIMELINE) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (section === SECTION_FOOD) break;
    if (PRINTED_FOOTER.test(row[0] ?? "")) continue;
    if (row[0] === "Time Name:") continue;

    const name = (row[0] ?? "").trim();
    const minutes = parseClockMinutes(row[1]);
    if (name.length === 0 || minutes === undefined) continue;
    const notes = (row[2] ?? "").trim();
    entries.push(notes ? { name, minutes, notes } : { name, minutes });
  }
  return entries;
}

function readMenu(rows: readonly string[][]): BundleMenuItem[] {
  const items: BundleMenuItem[] = [];
  let active = false;
  let course: string | undefined;

  for (const row of rows) {
    const section = sectionOf(row);
    if (section === SECTION_FOOD) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (PRINTED_FOOTER.test(row[0] ?? "")) continue;
    if (row[0] === "Menu Item:") continue;
    if (isBlankRow(row)) continue;

    const name = (row[0] ?? "").trim();
    const quantity = parseCount(row[2]);

    if (quantity !== undefined && name.length > 0) {
      const item: BundleMenuItem = { name, quantityServings: quantity };
      const note = (row[1] ?? "").trim();
      if (note.length > 0) item.specialInstructions = note;
      if (course !== undefined) item.course = course;
      items.push(item);
      continue;
    }
    if (section === undefined || name.length === 0) continue;

    // A lone cell is either a section heading or the description of the item
    // above it. Headings are title case throughout; descriptions are prose.
    const current = items.at(-1);
    if (isSectionHeading(name) || current === undefined) course = name;
    else if (current.description === undefined) current.description = name;
  }
  return items;
}

/** Parse an event worksheet CSV into its bundle contribution. */
export function parseEventWorksheet(rows: string[][]): EventBundlePart {
  const label = (name: string) => findLabelledValue(rows, name);
  const contact = parsePersonBlob(label("Contact"));
  const venueBlob = label("Venue");
  const venueName = venueBlob?.split(/\s*\d/)[0]?.trim();
  const venueAddress = parseAddressBlob(
    venueName === undefined ? venueBlob : venueBlob?.slice(venueName.length),
  );

  return {
    source: "eventWorksheet",
    header: {
      invoiceNumber: label("Invoice #"),
      title: label("Event Title"),
      eventDate: parseReportDate(label("Event Date")),
      guestCount: parseCount(label("Guest Count")),
      serviceStyle: label("Service Style"),
      occasion: label("Occasion"),
      eventType: label("Event Type"),
      status: label("Status"),
      salespersonName: label("Sales Rep"),
    },
    client: {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      addressLine1: contact.address?.addressLine1,
      city: contact.address?.city,
      region: contact.address?.region,
      postalCode: contact.address?.postalCode,
    },
    venue: {
      name: venueName,
      addressLine1: venueAddress?.addressLine1,
      city: venueAddress?.city,
      region: venueAddress?.region,
      postalCode: venueAddress?.postalCode,
      phone: parsePhone(
        venueBlob?.match(/(?:Work|Phone|Main)\s*:\s*([\d()\-. ]+)/i)?.[1],
      ),
    },
    timeline: readTimeline(rows),
    menu: readMenu(rows),
  };
}
