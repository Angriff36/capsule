import {
  bundleNotesFromSections,
  splitBeoNoteSections,
} from "./beoNoteSections";
import type { BundleNotes, BundleStaffAssignment } from "./eventBundle";
import type { PdfTextLine } from "./pdfTextReader";
import { parseClockMinutes } from "./reportValues";

/**
 * The battle board printed from the browser (Chrome "Mangia Battle Board").
 *
 * Its PDF text comes out with gaps inside words and numbers ("N AME RO LE",
 * "3 : 3 0 P M", "15 0 Final"), and each label sits on its own line above
 * its value. These readers compare text with the gaps taken out and read
 * values by column position, so the roster and the site notes still come in.
 */

const squeeze = (text: string) => text.replace(/\s+/g, "").toUpperCase();

/** Join digits the PDF split apart: "6/20 /20 26 - Saturday 15 0 Final". */
export function joinSpacedDigits(text: string): string {
  return text
    .replace(/(\d)\s+(?=\d)/g, "$1")
    .replace(/(\d)\s*([/:])\s*(?=\d)/g, "$1$2");
}

/** Close the gaps the PDF put inside words: "M angia", "NO M ANGIA", "3 rd", "7: 3 0". */
function closeGaps(text: string): string {
  return joinSpacedDigits(text)
    .replace(/\b([B-HJ-Z]) (?=[a-z]|[A-Z]{2,})/g, "$1")
    .replace(/(\d) (?=(?:st|nd|rd|th)\b)/g, "$1");
}

const SHIFT = /^(\d{1,2}:\d{2}[AP]M)[-–—](\d{1,2}:\d{2}[AP]M)$/i;
const TEAM = /^(FOH|BOH)$/i;

/** "N AME RO LE T E AM SHI FT ST AT I O N", read by its cell positions. */
export function readSpacedRoster(
  lines: readonly PdfTextLine[],
): BundleStaffAssignment[] {
  const headerIndex = lines.findIndex(
    (line) => squeeze(line.text) === "NAMEROLETEAMSHIFTSTATION",
  );
  if (headerIndex < 0) return [];
  const column = new Map<string, number>();
  for (const cell of lines[headerIndex]!.cells) {
    column.set(squeeze(cell.text), cell.x);
  }
  const nameX = column.get("NAME");
  const roleX = column.get("ROLE");
  const teamX = column.get("TEAM");
  const shiftX = column.get("SHIFT");
  const stationX = column.get("STATION");
  if (nameX === undefined || roleX === undefined) return [];
  const near = (x: number, start: number | undefined) =>
    start !== undefined && Math.abs(x - start) <= 6;

  const staff: BundleStaffAssignment[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    // A section title prints at the page edge, left of the roster.
    if (line.cells.every((cell) => cell.x < nameX - 10)) break;
    const name = line.cells.find((cell) => near(cell.x, nameX));
    if (name === undefined) {
      // The team prints on the lines under its row ("BOH", then "LEAD").
      const team = line.cells.find(
        (cell) =>
          teamX !== undefined &&
          cell.x >= teamX - 6 &&
          (shiftX === undefined || cell.x < shiftX - 6),
      );
      const current = staff.at(-1);
      if (current && team && !current.team && TEAM.test(team.text.trim())) {
        current.team = team.text.trim().toUpperCase();
      }
      continue;
    }
    const entry: BundleStaffAssignment = { name: name.text.trim() };
    const role = line.cells.find((cell) => near(cell.x, roleX));
    if (role) entry.role = role.text.trim();
    const shiftText = line.cells
      .filter(
        (cell) =>
          shiftX !== undefined &&
          cell.x >= shiftX - 6 &&
          (stationX === undefined || cell.x < stationX - 6),
      )
      .map((cell) => cell.text)
      .join("");
    const shift = shiftText.replace(/\s+/g, "").match(SHIFT);
    const start = parseClockMinutes(shift?.[1]);
    const end = parseClockMinutes(shift?.[2]);
    if (start !== undefined) entry.startMinutes = start;
    if (end !== undefined) entry.endMinutes = end;
    const station = line.cells.find((cell) => near(cell.x, stationX));
    if (station) entry.station = station.text.trim();
    staff.push(entry);
  }
  return staff;
}

const SECTION_TITLE = /^[A-Z][A-Z\s&/'—-]{3,}$/;

/** A label on its own line ("SE RV I C E SE T UP / LAYO UT") and the lines under it. */
function readLabelled(
  lines: readonly PdfTextLine[],
  label: string,
): string | undefined {
  const index = lines.findIndex((line) => squeeze(line.text) === label);
  if (index < 0) return undefined;
  const value: string[] = [];
  for (const line of lines.slice(index + 1)) {
    const text = line.text.trim();
    if (SECTION_TITLE.test(text)) break;
    value.push(closeGaps(text));
  }
  return value.length > 0 ? value.join("\n") : undefined;
}

/**
 * The top of the board labels service setup and operations notes; its
 * "SETUP & REFERENCE NOTES" part repeats the BEO note headings, each after a
 * "▸" mark. Staff parking and restrooms print side by side and go with the
 * catering kitchen notes.
 */
export function readSpacedNotes(lines: readonly PdfTextLine[]): BundleNotes {
  const referenceIndex = lines.findIndex(
    (line) => squeeze(line.text) === "SETUP&REFERENCENOTES",
  );
  const notes: BundleNotes =
    referenceIndex < 0
      ? {}
      : bundleNotesFromSections(
          splitBeoNoteSections(
            lines
              .slice(referenceIndex + 1)
              .map((line) => line.text.trim())
              .filter((text) => text.length > 0 && text !== "▸")
              .map(closeGaps)
              .join("\n"),
          ),
        );
  notes.serviceSetup ??= readLabelled(lines, "SERVICESETUP/LAYOUT");
  notes.operationsNotes ??= readLabelled(lines, "OPERATIONSNOTES");

  const siteIndex = lines.findIndex((line) =>
    squeeze(line.text).startsWith("STAFFPARKINGLOCATION"),
  );
  const site = lines[siteIndex];
  const values = lines[siteIndex + 1];
  if (site && values) {
    const found = site.cells.flatMap((label) => {
      const value = values.cells.find(
        (cell) => cell.x >= label.x && cell.x - label.x <= 20,
      );
      const name = squeeze(label.text).startsWith("STAFFPARKING")
        ? "Staff parking"
        : "Staff restrooms";
      return value ? [`${name}: ${value.text.trim()}`] : [];
    });
    if (found.length > 0) {
      notes.cateringKitchen = [notes.cateringKitchen, ...found]
        .filter(Boolean)
        .join("\n");
    }
  }
  return Object.fromEntries(
    Object.entries(notes).filter(([, value]) => value !== undefined),
  ) as BundleNotes;
}

/** "Supp Wedding" and "6184" share the line above the EVENT DATE label. */
export function readSpacedTitle(lines: readonly PdfTextLine[]): {
  title?: string;
  invoiceNumber?: string;
} {
  const labelIndex = lines.findIndex((line) =>
    squeeze(line.text).startsWith("EVENTDATE"),
  );
  const line = lines[labelIndex - 1];
  if (line === undefined || line.cells.length !== 2) return {};
  const [title, invoice] = line.cells;
  const invoiceNumber = joinSpacedDigits(invoice!.text.trim());
  if (!/^\d{3,7}$/.test(invoiceNumber)) return {};
  return { title: title!.text.trim(), invoiceNumber };
}
