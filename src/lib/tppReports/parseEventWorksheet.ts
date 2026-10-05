import type {
  BundleMenuItem,
  BundleNotes,
  BundlePackListItem,
  BundleStaffAssignment,
  BundleTimelineEntry,
  EventBundlePart,
} from "./eventBundle";
import {
  bundleNotesFromSections,
  splitBeoNoteSections,
} from "./beoNoteSections";
import { findLabelledValue, isBlankRow } from "./csvRows";
import {
  parseAddressBlob,
  parseClockMinutes,
  parseCount,
  parsePersonBlob,
  parsePhone,
  parseReportDate,
  readCoordinates,
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
  // The workbook export prints the contact block ("Kamini Singh 207 SE 7th
  // St ... Home: 406-...") in the row ABOVE its empty "Contact:" label.
  const contactBlob =
    label("Contact") ||
    rows
      .map((row, index) =>
        /^contact:?$/i.test(row[0]?.trim() ?? "")
          ? (rows[index - 1]?.[0]?.trim() ?? "")
          : "",
      )
      .find((text) => text.length > 0);
  const contact = parsePersonBlob(contactBlob);
  const venueBlob = label("Venue");
  // A remote site (a campsite) prints its GPS pair where a street goes; the
  // pair is the venue location, never a street "47." with ZIP "01359".
  const coordinates = venueBlob ? readCoordinates(venueBlob) : undefined;
  const venueText = coordinates
    ? venueBlob?.replace(coordinates.matched, " ").trim()
    : venueBlob;
  const venueName = venueText?.split(/\s*\d/)[0]?.trim();
  const venueStreet =
    venueName === undefined ? venueText : venueText?.slice(venueName.length);
  const venueAddress = venueStreet?.trim()
    ? parseAddressBlob(venueStreet)
    : undefined;
  // The worksheet header has no event time; the timeline rows carry it.
  const timeline = readTimeline(rows);
  const timelineMinutes = (pattern: RegExp) =>
    timeline.find((entry) => pattern.test(entry.name))?.minutes;

  return {
    source: "eventWorksheet",
    header: {
      invoiceNumber: label("Invoice #"),
      title: label("Event Title"),
      eventDate: parseReportDate(label("Event Date")),
      startMinutes: timelineMinutes(/^event start/i),
      endMinutes: timelineMinutes(/^event end/i),
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
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      phone: parsePhone(
        venueBlob?.match(/(?:Work|Phone|Main)\s*:\s*([\d()\-. ]+)/i)?.[1],
      ),
    },
    timeline,
    menu: readMenu(rows),
    packList: readEquipment(rows),
    staff: readStaff(rows),
    notes: withLaborNote(readSetupNotes(rows), readLaborNote(rows)),
  };
}

/**
 * "Setup": the overview, arrival, service and on-site contact prose, one long
 * cell per printed page. Text before any known heading is the overview.
 */
function readSetupNotes(rows: readonly string[][]): BundleNotes {
  const parts: string[] = [];
  let active = false;
  for (const row of rows) {
    const section = sectionOf(row);
    if (section === "setup") {
      active = true;
      continue;
    }
    if (!active) continue;
    if (section === "rental / equipment" || section === "event labor") break;
    if (PRINTED_FOOTER.test(row[0] ?? "")) continue;
    const text = row
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join(" ");
    if (text) parts.push(text);
  }
  const blob = parts.join("\n\n").trim();
  if (!blob) return {};
  const sections = splitBeoNoteSections(blob);
  const firstHeading = Object.keys(sections).length
    ? Math.min(...Object.keys(sections).map((heading) => blob.indexOf(heading)))
    : blob.length;
  const lead = blob.slice(0, firstHeading).trim();
  const notes = bundleNotesFromSections(sections);
  for (const key of Object.keys(notes) as Array<keyof BundleNotes>) {
    const value = notes[key]?.replace(/^:\s*/, "");
    if (value) notes[key] = value;
    else delete notes[key];
  }
  if (lead)
    notes.eventOverview = notes.eventOverview
      ? `${lead}\n\n${notes.eventOverview}`
      : lead;
  return notes;
}

/**
 * "Rental / Equipment": the tent, tarps, generator, handwashing station,
 * tables and rented floor mats. The Ops Final Lock checks every one of these
 * on the pack list, so they land there, grouped as "Rental / Equipment".
 * Row shapes: "|GAR| Tent - 20x10 BOH | Mangia | ... | 1.00 Each",
 * "Field Kitchen | 1.00 Each"; a lone prose cell describes the row above.
 */
const EQUIPMENT_QUANTITY = /^([\d.]+)\s+(.+)$/;
function readEquipment(rows: readonly string[][]): BundlePackListItem[] {
  const items: BundlePackListItem[] = [];
  let active = false;
  for (const row of rows) {
    const section = sectionOf(row);
    if (section === "rental / equipment") {
      active = true;
      continue;
    }
    if (!active) continue;
    if (section === "setup" || section === "event labor") break;
    if (PRINTED_FOOTER.test(row[0] ?? "")) continue;
    const filled = row.map((cell) => cell.trim()).filter(Boolean);
    if (filled.length === 0 || /^(Vendor|Item|Qty)$/i.test(filled[0]!))
      continue;
    const quantityCell = filled.at(-1)!.match(EQUIPMENT_QUANTITY);
    if (filled.length === 1 || !quantityCell) continue; // prose under a row
    const nameCell = filled[0]!;
    const code = nameCell.match(/^\|([^|]*)\|\s*/);
    const name = code ? nameCell.slice(code[0].length).trim() : nameCell;
    const vendor = filled.length >= 3 ? filled[1] : undefined;
    const existing = items.find((item) => item.name === name);
    const quantity = Number(quantityCell[1]);
    if (existing) {
      if (existing.quantity !== undefined && Number.isFinite(quantity))
        existing.quantity += quantity;
      continue;
    }
    const item: BundlePackListItem = {
      classification: "Rental / Equipment",
      name,
      forItems: [],
      unit: quantityCell[2]!.trim(),
      ...(Number.isFinite(quantity) ? { quantity } : {}),
      ...(code?.[1]?.trim() ? { code: code[1].trim() } : {}),
      ...(vendor ? { notes: `Vendor: ${vendor}` } : {}),
    };
    items.push(item);
  }
  return items;
}

/**
 * "Event Labor": one lone role row ("Catering - FOH Captain"), then the
 * person row: "* Unassigned *" (or a name), Sched In as an Excel serial day
 * (46291.677 = 9/26/2026 4:15 PM) and Sched Out in Excel's elapsed-hours
 * format ("1111004:00:00" = 1,111,004 hours since 1899-12-30 = 8:00 PM).
 */
function readStaff(rows: readonly string[][]): BundleStaffAssignment[] {
  const staff: BundleStaffAssignment[] = [];
  let active = false;
  let role: string | undefined;
  for (const row of rows) {
    const section = sectionOf(row);
    if (section === "event labor") {
      active = true;
      continue;
    }
    if (!active) continue;
    if (PRINTED_FOOTER.test(row[0] ?? "")) continue;
    const cells = row.map((cell) => cell.trim());
    const filled = cells.filter(Boolean);
    if (filled.length === 0 || /^Staff Phone/i.test(filled[0]!)) continue;
    // "Notes: …" under Event Labor is the labor note (readLaborNote).
    if (LABOR_NOTE.test(cells[0]!)) continue;
    // A person row with no shift times ("[2] * Unassigned *") is still a
    // person, not the next role.
    if (filled.length === 1 && !UNASSIGNED_ROW.test(filled[0]!)) {
      role = filled[0];
      continue;
    }
    const name = cells[0]!.replace(/\*/g, "").trim();
    if (!name) continue;
    const entry: BundleStaffAssignment = {
      name: /^unassigned$/i.test(name) ? "Unassigned" : name,
      ...(role ? { role } : {}),
    };
    const start = excelSerialMinutes(cells[1]);
    const end = elapsedHoursMinutes(
      cells.slice(2).find((cell) => /\d+:\d{2}/.test(cell)),
    );
    if (start !== undefined) entry.startMinutes = start;
    if (end !== undefined) entry.endMinutes = end;
    staff.push(entry);
  }
  return staff;
}

function withLaborNote(
  notes: BundleNotes,
  laborNote: string | undefined,
): BundleNotes {
  if (!laborNote) return notes;
  return {
    ...notes,
    operationsNotes: notes.operationsNotes
      ? `${notes.operationsNotes}\n\n${laborNote}`
      : laborNote,
  };
}

const LABOR_NOTE = /^notes\s*:$/i;
const UNASSIGNED_ROW = /^(?:\[\d+\]\s*)?\*\s*unassigned\s*\*$/i;

/**
 * "Notes: This will be sent out as a bring hot … but is DROP OFF service."
 * printed under Event Labor: how the crew runs the event.
 */
function readLaborNote(rows: readonly string[][]): string | undefined {
  let active = false;
  for (const row of rows) {
    if (sectionOf(row) === "event labor") {
      active = true;
      continue;
    }
    if (!active) continue;
    const cells = row.map((cell) => cell.trim()).filter(Boolean);
    if (cells.length > 1 && LABOR_NOTE.test(cells[0]!)) {
      return cells.slice(1).join(" ");
    }
  }
  return undefined;
}

/** "46291.6770833333" → minutes into that day (0.677 × 1440 = 4:15 PM). */
function excelSerialMinutes(cell: string | undefined): number | undefined {
  if (!cell || !/^\d+\.\d+$/.test(cell)) return undefined;
  const serial = Number(cell);
  return Math.round((serial - Math.floor(serial)) * 1440);
}

/** "1111004:00:00" (elapsed hours) → minutes into that day (20:00). */
function elapsedHoursMinutes(cell: string | undefined): number | undefined {
  const match = cell?.match(/^(\d+):(\d{2})(?::\d{2})?$/);
  if (!match) return undefined;
  return (Number(match[1]) % 24) * 60 + Number(match[2]);
}
