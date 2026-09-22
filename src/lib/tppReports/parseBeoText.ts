import {
  BEO_NOTE_HEADINGS,
  bundleNotesFromSections,
  splitBeoNoteSections,
} from "./beoNoteSections";
import type {
  BundleMenuItem,
  BundleStaffAssignment,
  BundleTimelineEntry,
  EventBundlePart,
} from "./eventBundle";
import {
  parseAddressBlob,
  parseClockMinutes,
  parseCount,
  parseEmail,
  parsePhone,
  parseReportDate,
  readCoordinates,
} from "./reportValues";

/**
 * Parses BEO / event-worksheet text that a person copied out of the PDF (or
 * typed from the printed binder) and pasted into Capsule.
 *
 * Pasted text has none of the workbook's cell structure, so this reader works
 * line by line: header facts are "Label: value" lines, a clock time at the
 * start of a line is a timeline row, a serving count at the start of a line
 * is a menu row, and "**" or "Note:" lines attach to the menu row above them.
 * Anything it cannot place is left alone rather than guessed.
 */

const CLOCK = /\d{1,2}:\d{2}\s*[AaPp]\.?[Mm]\.?/;
const LEADING_CLOCK = new RegExp(`^(${CLOCK.source})\\s*(.*)$`);
const CLOCK_RANGE = new RegExp(
  `(${CLOCK.source})\\s*(?:-|–|—|to)\\s*(${CLOCK.source})`,
);
const SERVING_UNIT =
  /(?:x\s+|(?:servings?|serv|each|ea|pcs?|pieces?|portions?|ppl|people|guests?)\b\.?\s*)/i;
const LEADING_SERVINGS_WITH_UNIT = new RegExp(
  `^(\\d+(?:\\.\\d+)?)\\s*${SERVING_UNIT.source}(.+)$`,
  "i",
);
const LEADING_SERVINGS_BARE = new RegExp(
  `^(\\d+(?:\\.\\d+)?)\\s*(?:${SERVING_UNIT.source})?(.+)$`,
  "i",
);
const TRAILING_SERVINGS = new RegExp(
  `^(.+?)\\s+(?:\\(|-\\s*|–\\s*)?(\\d+(?:\\.\\d+)?)\\s*(?:${SERVING_UNIT.source})?\\)?\\s*$`,
  "i",
);
const NOTE_LINE =
  /^(?:\*+\s*|(?:note|notes|special instructions?)\s*:\s*|[-–•]\s+)(.+)$/i;
/**
 * Unmarked prose under a menu row is either the dish's catalog description
 * ("Assorted cured meats and cheeses") or a line-cook instruction for this
 * event ("Peppercorn cream sauce on the side", "blue rare for bride & groom").
 * Directive words mark the instruction; it must stay on the event line, not
 * change the shared catalog dish.
 */
const INSTRUCTION_CUE =
  /\b(?:on the side|away from|own (?:tray|platter|plate)|separate(?:ly)?|bride|groom|rare|medium|well[- ]done|less done|more done|overcook|undercook|dry|no |not |without|hold (?:the )?|omit|extra|double|half|only|instead|swap|substitut|allerg|gluten|dairy|vegan|vegetarian|kosher|halal|nut[- ]free|must|please|do not|don't|make sure|be sure|keep|serve|cook|prep|cut|slice|plate|label|warm|hot|cold|chill|reheat|tasting|last time|client (?:wants|asked|prefers)|per client)\b/i;

function looksLikeInstruction(text: string): boolean {
  return INSTRUCTION_CUE.test(text);
}
const PRINTED_FOOTER = /^printed date/i;
const PAGE_FOOTER = /^page \d+( of \d+)?$/i;

type Section = "header" | "timeline" | "menu" | "staff" | "notes" | "other";

const SECTION_HEADINGS: Array<{ pattern: RegExp; section: Section }> = [
  {
    pattern: /^(event\s+)?(timeline|schedule|itinerary)\b/i,
    section: "timeline",
  },
  { pattern: /^time\s+(name|activity)\b/i, section: "timeline" },
  { pattern: /^(event\s+)?(menu|event items?|food)\b/i, section: "menu" },
  // The BEO item table prints its column header as one run-on line in
  // varying column order: "Time Qty Event Item Service Style Service Area",
  // "Time Service AreaEvent Item Service StyleQty".
  { pattern: /^time\b.*event item/i, section: "menu" },
  { pattern: /^(staff|staffing|labor|labour|crew|team)\b/i, section: "staff" },
  { pattern: /^(notes|setup notes|event overview)\b/i, section: "notes" },
  {
    pattern: /^(pack ?list|packing list|equipment|rentals?)\b/i,
    section: "other",
  },
];

const HEADER_LABELS: Record<string, string[]> = {
  invoice: ["invoice #", "invoice number", "invoice", "inv #", "event #"],
  title: ["event title", "event name", "title", "event"],
  date: ["event date", "date"],
  time: ["event time", "time", "hours"],
  guests: ["guest count", "guests", "headcount", "head count", "attendance"],
  serviceStyle: ["service style", "style", "service"],
  occasion: ["occasion"],
  eventType: ["event type", "type"],
  salesperson: ["salesperson", "sales person", "sales rep", "coordinator"],
  contact: ["contact", "client", "customer", "host"],
  location: ["location", "venue", "site"],
  address: ["venue address", "site address", "address", "gps", "coordinates"],
  phone: ["contact phone", "phone", "cell", "mobile"],
  email: ["contact email", "email", "e-mail"],
  dietary: [
    "allergies",
    "allergy",
    "allergens",
    "dietary restrictions",
    "dietary notes",
    "dietary",
    "restrictions",
  ],
  // Read as a label so an empty "Company:" line stops the contact reader from
  // taking the next line as the contact value.
  company: ["company"],
};

interface ReadLine {
  text: string;
  lower: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * "Label: value", "Label #: value", "Label   value" or "Label" alone (value on
 * the next line).
 */
function labelPattern(label: string): RegExp {
  return new RegExp(
    `^${escapeRegExp(label)}(?:(?:\\s*[:#])+\\s*|\\s{2,}|\\s*$)(.*)$`,
    "i",
  );
}

function readLines(text: string): ReadLine[] {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/\t/g, "  ").trim())
      // Before the label split: "Printed Date: … Invoice # 5935" would leave a
      // bare "Printed" line that reads as a course heading.
      .filter((line) => !PRINTED_FOOTER.test(line))
      .flatMap((line) => splitLabelRuns(line))
      .filter(
        (line) =>
          line.length > 0 &&
          !PRINTED_FOOTER.test(line) &&
          !PAGE_FOOTER.test(line),
      )
      .map((line) => ({ text: line, lower: line.toLowerCase() }))
  );
}

/**
 * TPP prints several header facts on one line: "Invoice #: 6839 Date:
 * Tuesday 9/22/2026". Split a line at every interior "Label:" run so each
 * fact becomes its own line for the header pass; menu and timeline rows
 * carry no header labels and are never split. A colon is a split point only
 * when the LONGEST label ends right before it, so "Venue Contact:" cuts as
 * one compound label instead of leaking "Contact:" as a client fact.
 */
const SPLIT_LABELS = [
  ...new Set([...Object.values(HEADER_LABELS).flat(), "venue contact"]),
]
  .sort((a, b) => b.length - a.length)
  .map((label) => label.toLowerCase());

function splitLabelRuns(line: string): string[] {
  const lower = line.toLowerCase();
  const cuts: number[] = [];
  for (const colon of line.matchAll(/[:#]/g)) {
    const before = lower.slice(0, colon.index!);
    for (const label of SPLIT_LABELS) {
      if (!before.endsWith(label)) continue;
      const at = before.length - label.length;
      if (at > 0 && /\s/.test(line[at - 1]!)) cuts.push(at);
      break;
    }
  }
  if (cuts.length === 0) return [line];
  const parts = [line.slice(0, cuts[0]!).trim()];
  for (let i = 0; i < cuts.length; i += 1) {
    parts.push(line.slice(cuts[i]!, cuts[i + 1] ?? line.length).trim());
  }
  return parts;
}

/** Longer labels win over shorter ones ("Event Date" before "Date"). */
function labelValue(lines: ReadLine[], key: string): string | undefined {
  const labels = [...(HEADER_LABELS[key] ?? [])].sort(
    (a, b) => b.length - a.length,
  );
  for (const label of labels) {
    const pattern = labelPattern(label);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (!line.lower.startsWith(label)) continue;
      const match = line.text.match(pattern);
      if (!match) continue;
      const value = match[1]!.trim();
      if (value.length > 0) return value;
      const next = lines[index + 1]?.text;
      if (next && !isSectionHeading(next) && !looksLikeLabel(next)) {
        return next;
      }
    }
  }
  return undefined;
}

function looksLikeLabel(text: string): boolean {
  return Object.values(HEADER_LABELS).some((labels) =>
    labels.some((label) => labelPattern(label).test(text)),
  );
}

function isSectionHeading(text: string): Section | undefined {
  // Column gaps are layout, not length: an .rtf table heading keeps wide gaps.
  if (text.replace(/\s+/g, " ").length > 48 || /[:#]\s*\S/.test(text))
    return undefined;
  for (const { pattern, section } of SECTION_HEADINGS) {
    if (pattern.test(text)) return section;
  }
  return undefined;
}

function readTimelineLine(text: string): BundleTimelineEntry | undefined {
  const match = text.match(LEADING_CLOCK);
  if (!match) return undefined;
  const minutes = parseClockMinutes(match[1]);
  const rest = (match[2] ?? "").replace(/^[-–:]\s*/, "").trim();
  if (minutes === undefined || rest.length === 0) return undefined;
  // Two or more spaces separate the name from its note in printed tables.
  const [name, ...noteParts] = rest.split(/\s{2,}/);
  const notes = noteParts.join(" ").trim();
  const entry: BundleTimelineEntry = { name: name!.trim(), minutes };
  if (notes.length > 0) entry.notes = notes;
  return entry;
}

/**
 * Menu-row guards: a bare "N:NN" is a clock, not a count; servings above a
 * full-service ceiling are ZIP codes, phone numbers or street numbers; a name
 * without letters or carrying a phone/email fragment is contact or address
 * prose, not a dish.
 */
const MENU_NAME_REJECT =
  /@|\(\d{3}\)\s*\d{3}|\b\d{3}[-.\s]\d{4}\b|\b\d{7,}\b|\b\d{5}\b/;

function menuRowPlausible(name: string, quantity: number): boolean {
  if (quantity > 5000) return false;
  if (!/[A-Za-z]/.test(name)) return false;
  return !MENU_NAME_REJECT.test(name);
}

function readMenuLine(
  text: string,
  options: { allowBareCount: boolean },
): BundleMenuItem | undefined {
  if (/^\d{1,2}:\d{2}/.test(text)) return undefined;
  const leading = text.match(
    options.allowBareCount ? LEADING_SERVINGS_BARE : LEADING_SERVINGS_WITH_UNIT,
  );
  if (leading) {
    const quantity = Number(leading[1]);
    const name = leading[2]!.trim();
    // A wrapped description line ("2 bites per guest.") starts with a count
    // too; a dish name with no unit word before it starts with a capital.
    const proseTail =
      /^[a-z]/.test(name) && !LEADING_SERVINGS_WITH_UNIT.test(text);
    if (
      Number.isFinite(quantity) &&
      name.length > 1 &&
      !proseTail &&
      menuRowPlausible(name, quantity)
    ) {
      return { name, quantityServings: quantity };
    }
  }
  const trailing = text.match(TRAILING_SERVINGS);
  if (trailing) {
    const quantity = Number(trailing[2]);
    const name = trailing[1]!.trim();
    if (
      Number.isFinite(quantity) &&
      name.length > 1 &&
      !CLOCK.test(name) &&
      menuRowPlausible(name, quantity)
    ) {
      return { name, quantityServings: quantity };
    }
  }
  return undefined;
}

/**
 * Service-wave rows print bare 24-hour ranges without AM/PM: "2:00 – 3:00
 * 1st Wave: 34 Prawns". They are timeline rows, not menu rows. A bare hour is
 * ambiguous, so it is resolved against the BEO's own event window — "2:00"
 * inside a 2:00 PM event is 14:00 — and skipped when it stays ambiguous.
 */
const BARE_CLOCK_RANGE =
  /^(\d{1,2}):(\d{2})\s*(?:-|–|to)\s*(\d{1,2}):(\d{2})\s+(.+)$/;

function resolveBareHour(
  hour: number,
  window: { start?: number; end?: number },
): number | undefined {
  if (hour > 12) return hour * 60;
  if (window.start === undefined || window.end === undefined) return undefined;
  const hits = [hour, hour + 12]
    .map((candidate) => candidate * 60)
    .filter(
      (minutes) => minutes + 60 >= window.start! && minutes - 60 <= window.end!,
    );
  return hits.length === 1 ? hits[0] : undefined;
}

function readBareClockRangeLine(
  text: string,
  window: { start?: number; end?: number },
): BundleTimelineEntry | undefined {
  const match = text.match(BARE_CLOCK_RANGE);
  if (!match) return undefined;
  const start = resolveBareHour(Number(match[1]), window);
  if (
    start === undefined ||
    resolveBareHour(Number(match[3]), window) === undefined
  )
    return undefined;
  const [name, ...noteParts] = match[5]!.trim().split(/\s{2,}/);
  if (!name || name.length === 0) return undefined;
  const entry: BundleTimelineEntry = { name: name.trim(), minutes: start };
  const notes = noteParts.join(" ").trim();
  if (notes.length > 0) entry.notes = notes;
  return entry;
}

/**
 * The venue block prints name and address without labels: "Fields Senior
 * Living" directly above "16512 E Desmet Ct" and "Spokane Valley WA, 99216".
 * When no labeled Location value named the venue, read that block: the bare
 * letter line above the first address-like line is the name, and the
 * following bare address lines fold into one address.
 */
function readUnlabeledVenue(lines: ReadLine[]): {
  name?: string;
  address?: ReturnType<typeof parseAddressBlob>;
} {
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!.text;
    // Address blocks are bare; labeled header lines and prose are not
    // addresses. A street line or city/ZIP line always carries a digit.
    if (/[:#]/.test(text) || !/\d/.test(text) || looksLikeLabel(text)) continue;
    const address = parseAddressBlob(text);
    if (!address?.addressLine1 && !address?.city && !address?.postalCode)
      continue;
    let name: string | undefined;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const candidate = lines[j]!.text;
      if (candidate.length < 3 || candidate.length > 60) continue;
      if (/\d/.test(candidate)) continue;
      if (looksLikeLabel(candidate) || isSectionHeading(candidate)) continue;
      name = candidate.replace(/[,\-–]\s*$/, "").trim();
      break;
    }
    const blob = [text];
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      const next = lines[j]!.text;
      if (/[:#]/.test(next) || looksLikeLabel(next)) break;
      if (!/\d/.test(next)) break;
      blob.push(next);
    }
    return { name, address: parseAddressBlob(blob.join(", ")) };
  }
  return {};
}

function readStaffLine(text: string): BundleStaffAssignment | undefined {
  const range = text.match(CLOCK_RANGE);
  const withoutRange = range ? text.replace(range[0], "  ") : text;
  const unassigned = /\*?\bunassigned\b\*?|\btbd\b|\bopen\b(?=\s*$)/i;
  let name: string;
  let role: string | undefined;
  if (unassigned.test(withoutRange)) {
    name = "Unassigned";
    role = withoutRange.replace(unassigned, " ").replace(/\s{2,}/g, " ");
  } else {
    const parts = withoutRange
      .split(/\s+[-–]\s+|\s{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 2) return undefined;
    name = parts[0]!;
    role = parts.slice(1).join(" - ");
  }
  role = role.replace(/^[\s\-–:]+|[\s\-–:]+$/g, "").trim();
  if (!role) return undefined;
  const entry: BundleStaffAssignment = { name, role };
  const start = parseClockMinutes(range?.[1]);
  const end = parseClockMinutes(range?.[2]);
  if (start !== undefined) entry.startMinutes = start;
  if (end !== undefined) entry.endMinutes = end;
  return entry;
}

function readContact(value: string | undefined): {
  name?: string;
  email?: string;
  phone?: string;
} {
  if (value === undefined) return {};
  const email = parseEmail(value);
  const phoneText = value.match(/\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/)?.[0];
  const name = value
    .replace(email ?? "", " ")
    .replace(phoneText ?? "", " ")
    .replace(/\b(cell|home|work|phone|email)\s*:?/gi, " ")
    .replace(/[|,;]+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[|,;]+$/, "")
    .trim();
  return { name: name || undefined, email, phone: parsePhone(phoneText) };
}

/**
 * A BEO that prints "Venue: Singh Campsite" on one line and "Address: 47.01359°
 * N, 116.52979° W" (or a street address) on the next: fold the address line
 * into the venue when the venue line did not already carry one.
 */
function readVenueWithAddress(
  location: string | undefined,
  addressLine: string | undefined,
): EventBundlePart["venue"] {
  const venue: NonNullable<EventBundlePart["venue"]> =
    readVenue(location) ?? {};
  if (!addressLine) return venue;
  const coordinates = readCoordinates(addressLine);
  if (coordinates && venue.latitude === undefined) {
    venue.latitude = coordinates.latitude;
    venue.longitude = coordinates.longitude;
  }
  const street = coordinates
    ? addressLine.replace(coordinates.matched, " ").trim()
    : addressLine;
  if (street.length > 0 && venue.addressLine1 === undefined) {
    const address = parseAddressBlob(street);
    venue.addressLine1 = address?.addressLine1;
    venue.city = address?.city;
    venue.region = address?.region;
    venue.postalCode = address?.postalCode;
  }
  return venue;
}

function readVenue(location: string | undefined): EventBundlePart["venue"] {
  if (!location) return {};
  const beforeContact = location.replace(/venue contact:[\s\S]*$/i, "").trim();
  const coordinates = readCoordinates(beforeContact);
  const withoutCoordinates = coordinates
    ? beforeContact.replace(coordinates.matched, " ").trim()
    : beforeContact;
  const name = withoutCoordinates
    .split(/\s*\d/)[0]
    ?.replace(/[,\-–]\s*$/, "")
    .trim();
  const address = parseAddressBlob(
    name
      ? withoutCoordinates.slice(name.length).replace(/^[,\s]+/, "")
      : undefined,
  );
  return {
    name: name || withoutCoordinates,
    addressLine1: address?.addressLine1,
    city: address?.city,
    region: address?.region,
    postalCode: address?.postalCode,
    latitude: coordinates?.latitude,
    longitude: coordinates?.longitude,
  };
}

const SMALL_WORDS = new Set([
  "and",
  "or",
  "of",
  "the",
  "a",
  "an",
  "&",
  "/",
  "-",
  "–",
  "with",
  "to",
  "for",
]);

/**
 * "Cocktail Hour", "Dinner Buffet", "DESSERTS" are course headings; "Assorted
 * cured meats and cheeses" is the description of the row above.
 */
function looksLikeCourseHeading(text: string): boolean {
  if (/\d/.test(text) || text.length > 40 || /[.;!?]/.test(text)) return false;
  const words = text.replace(/:$/, "").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  return words.every(
    (word) => SMALL_WORDS.has(word.toLowerCase()) || /^[A-Z(]/.test(word),
  );
}

interface Body {
  timeline: BundleTimelineEntry[];
  menu: BundleMenuItem[];
  staff: BundleStaffAssignment[];
  noteLines: string[];
}

function readBody(
  lines: ReadLine[],
  eventWindow: { start?: number; end?: number } = {},
): Body {
  const body: Body = { timeline: [], menu: [], staff: [], noteLines: [] };
  let section: Section = "header";
  let course: string | undefined;

  for (const line of lines) {
    // The BEO's own note headings ("Menu / Culinary Notes", "Equipment &
    // Rentals") are prose sections, not the menu or pack-list tables.
    if (
      BEO_NOTE_HEADINGS.some((noteHeading) => line.text.startsWith(noteHeading))
    ) {
      section = "notes";
      body.noteLines.push(line.text);
      continue;
    }
    const heading = isSectionHeading(line.text);
    if (heading) {
      section = heading;
      course = undefined;
      if (heading === "notes") body.noteLines.push(line.text);
      continue;
    }
    if (section === "notes") {
      body.noteLines.push(line.text);
      continue;
    }
    if (section === "staff") {
      const member = readStaffLine(line.text);
      if (member) body.staff.push(member);
      continue;
    }
    if (section === "menu") {
      const wave = readBareClockRangeLine(line.text, eventWindow);
      if (wave) {
        body.timeline.push(wave);
        continue;
      }
      readMenuBodyLine(line.text, body.menu, {
        course,
        setCourse: (next) => {
          course = next;
        },
      });
      continue;
    }

    const timelineEntry = readTimelineLine(line.text);
    if (timelineEntry) {
      body.timeline.push(timelineEntry);
      continue;
    }
    // No "Menu" heading yet: still catch unmistakable serving rows.
    if (!looksLikeLabel(line.text)) {
      const item = readMenuLine(line.text, { allowBareCount: false });
      if (item) body.menu.push(item);
    }
  }
  return body;
}

function readMenuBodyLine(
  text: string,
  menu: BundleMenuItem[],
  courseState: { course?: string; setCourse: (next?: string) => void },
): void {
  // The BEO menu table leads each row with its serving time; drop it.
  const withoutClock = text.replace(LEADING_CLOCK, "$2").trim();
  const current = menu.at(-1);
  // BEO item tables also mark rows with "-" or "**": "- 200 Serving Lasagna
  // Meal", "**250 Trays of Lasagna". A marked line that reads as an item is
  // an item; only a marked line without a count stays a note.
  const withoutMark = withoutClock.replace(/^[-–*]+\s*/, "");
  if (withoutMark !== withoutClock) {
    // " - Wave 1" / " - Beverage" mark the course the following rows belong
    // to — checked before the count reader, or "Wave 1" reads as 1 serving.
    if (/^(?:wave \d+|beverages?)$/i.test(withoutMark)) {
      courseState.setCourse(withoutMark);
      return;
    }
    const markedItem = readMenuLine(withoutMark, { allowBareCount: true });
    if (markedItem) {
      if (courseState.course !== undefined)
        markedItem.course = courseState.course;
      menu.push(markedItem);
      return;
    }
    // TPP's item table marks its course rows with a dash: "-   Reception".
    if (/^[-–]/.test(withoutClock) && looksLikeCourseHeading(withoutMark)) {
      courseState.setCourse(withoutMark.replace(/:$/, ""));
      return;
    }
  }
  const note = withoutClock.match(NOTE_LINE);
  if (note && current) {
    const instruction = note[1]!.trim();
    current.specialInstructions = current.specialInstructions
      ? `${current.specialInstructions} ${instruction}`
      : instruction;
    return;
  }
  const item = readMenuLine(withoutClock, { allowBareCount: true });
  if (item) {
    if (courseState.course !== undefined) item.course = courseState.course;
    menu.push(item);
    return;
  }
  // "Allergies: NO ONIONS" printed under the menu is a header fact the
  // header pass reads, not a course or a description of the row above.
  if (looksLikeLabel(withoutClock)) return;
  // A short title-case line starts a new course; prose describes the row above.
  // "NO ONIONS" under a dish is an instruction for it, never a course.
  if (looksLikeCourseHeading(withoutClock) && !/^not?\s/i.test(withoutClock)) {
    courseState.setCourse(withoutClock.replace(/:$/, ""));
    return;
  }
  if (!current) return;
  if (looksLikeInstruction(withoutClock)) {
    current.specialInstructions = current.specialInstructions
      ? `${current.specialInstructions} ${withoutClock}`
      : withoutClock;
  } else if (current.description === undefined) {
    current.description = withoutClock;
  }
}

/** Parse pasted BEO / worksheet text into its bundle contribution. */
export function parseBeoText(text: string): EventBundlePart {
  const lines = readLines(text);
  const eventTime = labelValue(lines, "time");
  const timeRange = eventTime?.match(CLOCK_RANGE);
  const body = readBody(lines, {
    start: parseClockMinutes(timeRange?.[1] ?? eventTime),
    end: parseClockMinutes(timeRange?.[2]),
  });
  const warnings: string[] = [];

  const contact = readContact(labelValue(lines, "contact"));
  const locationValue = labelValue(lines, "location");
  // A location with no digits is a person — TPP prints the on-site contact
  // there — not a place; the venue itself is the unlabeled name above the
  // street address block.
  // A remote site has no street: "Location: Singh Campsite" with its GPS pair
  // on the next line is a place too, and that line is its address.
  const locationAt = lines.findIndex((line) =>
    HEADER_LABELS.location!.some((label) => line.lower.startsWith(label + ":")),
  );
  const afterLocation =
    locationAt >= 0 ? lines[locationAt + 1]?.text : undefined;
  const gpsLine =
    afterLocation && readCoordinates(afterLocation) ? afterLocation : undefined;
  const locationIsPlace =
    locationValue !== undefined &&
    (/\d/.test(locationValue) || gpsLine !== undefined);
  if (!contact.name && !locationIsPlace && locationValue) {
    contact.name = locationValue;
  }
  const sections = splitBeoNoteSections(body.noteLines.join("\n"));
  const notes = bundleNotesFromSections(sections);
  if (Object.keys(sections).length === 0 && body.noteLines.length > 1) {
    notes.eventOverview = body.noteLines.slice(1).join("\n");
  }

  const eventDate = parseReportDate(labelValue(lines, "date"));
  if (eventDate === undefined) {
    warnings.push(
      'Pasted text: no event date was found. Add a line like "Event Date: 9/26/2026".',
    );
  }
  if (body.menu.length === 0 && body.timeline.length === 0) {
    warnings.push(
      'Pasted text: no menu rows ("30 Serving Dish name") or timeline rows ("5:00 PM Guests arrive") were recognized.',
    );
  }

  const salesperson = labelValue(lines, "salesperson");
  const salespersonEmail = parseEmail(salesperson);
  const invoiceNumber = labelValue(lines, "invoice")?.match(/\d+/)?.[0];
  const title = labelValue(lines, "title");
  const dietary = labelValue(lines, "dietary");
  if (dietary) notes.dietary = dietary;
  return {
    source: "beo",
    header: {
      invoiceNumber,
      // "Event #: 5935" satisfies the bare "event" label too; a number is
      // the invoice, not a title.
      title: title && !/^\d+$/.test(title) ? title : undefined,
      eventDate,
      startMinutes: parseClockMinutes(timeRange?.[1] ?? eventTime),
      endMinutes: parseClockMinutes(timeRange?.[2]),
      guestCount: parseCount(labelValue(lines, "guests")),
      serviceStyle: labelValue(lines, "serviceStyle"),
      occasion: labelValue(lines, "occasion")?.replace(/^\*+/, ""),
      eventType: labelValue(lines, "eventType"),
      salespersonName: salesperson
        ?.replace(salespersonEmail ?? "", "")
        .match(/^[A-Za-z'.\- ]+/)?.[0]
        ?.trim(),
      salespersonEmail,
    },
    client: {
      name: contact.name,
      // TPP prints the contact's email alone on its own line, with no label.
      email:
        contact.email ??
        parseEmail(labelValue(lines, "email")) ??
        lines
          .map((line) => line.text)
          .find(
            (text) =>
              /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(text) &&
              text !== salespersonEmail,
          ),
      phone: contact.phone ?? parsePhone(labelValue(lines, "phone")),
    },
    venue: (() => {
      const venue =
        readVenueWithAddress(
          locationIsPlace ? locationValue : undefined,
          labelValue(lines, "address") ?? gpsLine,
        ) ?? {};
      // A GPS-only site has no street block to look for.
      if (!venue.name || (!venue.addressLine1 && gpsLine === undefined)) {
        const block = readUnlabeledVenue(lines);
        if (!venue.name) venue.name = block.name;
        if (!venue.addressLine1 && block.address) {
          venue.addressLine1 = block.address.addressLine1;
          venue.city = venue.city ?? block.address.city?.replace(/^[,\s]+/, "");
          venue.region = venue.region ?? block.address.region;
          venue.postalCode = venue.postalCode ?? block.address.postalCode;
        }
      }
      return venue;
    })(),
    timeline: body.timeline,
    menu: body.menu,
    staff: body.staff,
    notes,
    warnings,
  };
}
