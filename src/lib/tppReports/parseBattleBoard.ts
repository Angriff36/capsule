import type {
  BundleStaffAssignment,
  BundleTimelineEntry,
  EventBundlePart,
} from "./eventBundle";
import type { PdfTextLine } from "./pdfTextReader";
import { parseClockMinutes, parseCount, parseReportDate } from "./reportValues";

/**
 * Parses the Mangia battle board PDF — the front-of-house run sheet.
 *
 * It repeats the event facts, so it is not a source of record for them. What is
 * unique here is the staff roster and the per-step category, team and owner on
 * the timeline. The merge uses it to enrich, never to overwrite.
 */

const TIME_ROW = /^(\d{1,2}:\d{2}\s*[AP]M)\s+(.*)$/;
const TEAM = /\b(FOH|BOH)\b/;
const ROSTER_HEADER = /^NAME\s+ROLE\s+TEAM\s+SHIFT\s+STATION$/;
const TIMELINE_HEADER = /^TI\s?ME\s+TASK\s+CAT/;
/** Section titles are printed with wide letter spacing, as "ST AF F R OST ER". */
const SECTION_TITLE = /^[A-Z][A-Z\s&/]{3,}$/;

function isCategoryLine(text: string): boolean {
  return /^[A-Z][A-Z ]*$/.test(text) && text.length <= 24;
}

function readStaff(lines: readonly string[]): BundleStaffAssignment[] {
  const start = lines.findIndex((line) => ROSTER_HEADER.test(line));
  if (start < 0) return [];

  const staff: BundleStaffAssignment[] = [];
  for (const line of lines.slice(start + 1)) {
    if (TIMELINE_HEADER.test(line) || SECTION_TITLE.test(line)) break;
    const team = line.match(TEAM);
    if (team?.index === undefined) continue;

    const name = line.slice(0, team.index).trim();
    const station = line.slice(team.index + team[0].length).trim();
    if (name.length === 0) continue;
    const entry: BundleStaffAssignment = { name, team: team[1] };
    if (station.length > 0) entry.station = station;
    staff.push(entry);
  }
  return staff;
}

function readTimeline(lines: readonly string[]): BundleTimelineEntry[] {
  const start = lines.findIndex((line) => TIMELINE_HEADER.test(line));
  if (start < 0) return [];

  const entries: BundleTimelineEntry[] = [];
  let category: string | undefined;

  for (const line of lines.slice(start + 1)) {
    const row = line.match(TIME_ROW);
    if (!row) {
      if (isCategoryLine(line)) {
        // Wrapped category cells print as two lines, "COCKTAIL" then "HOUR".
        category =
          category !== undefined && entries.length === 0
            ? `${category} ${line}`.trim()
            : line;
        continue;
      }
      // Anything else continues the task text of the row above.
      const current = entries.at(-1);
      if (current !== undefined && line.length > 0) {
        current.name = `${current.name} ${line}`.trim();
      }
      continue;
    }

    const minutes = parseClockMinutes(row[1]);
    if (minutes === undefined) continue;
    const rest = row[2]!.trim();
    const team = rest.match(TEAM);

    const entry: BundleTimelineEntry = {
      name: team?.index === undefined ? rest : rest.slice(0, team.index).trim(),
      minutes,
    };
    if (category !== undefined) entry.category = category;
    if (team) {
      entry.team = team[1];
      const staff = rest.slice(team.index! + team[0].length).trim();
      if (staff.length > 0) entry.staff = staff;
    }
    entries.push(entry);
    category = undefined;
  }
  return entries;
}

/** The scope table prints one label and value pair per column. */
function readScopeNotes(lines: readonly string[]): string | undefined {
  const scope = lines.filter((line) =>
    /^(Bar service|Cocktail hour food|Dessert|Bussing|Place)\b/.test(line),
  );
  return scope.length > 0 ? scope.join(" | ") : undefined;
}

function readPrefixed(
  lines: readonly string[],
  prefix: string,
): string | undefined {
  const found = lines.find((line) => line.startsWith(prefix));
  return (
    found
      ?.slice(prefix.length)
      .replace(/^[:\s]+/, "")
      .trim() || undefined
  );
}

/** Parse a battle board PDF into its bundle contribution. */
export function parseBattleBoard(
  textLines: readonly PdfTextLine[],
): EventBundlePart {
  const lines = textLines
    .map((line) => line.text.trim())
    .filter((line) => line.length > 0);

  // "Mendenhall / Jarvis Wedding 8/22/2026 - Saturday 98 Final Buffet - Bring Hot"
  const factLine = lines.find(
    (line) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(line) && /\d+\s+Final/.test(line),
  );

  return {
    source: "battleBoard",
    header: {
      eventDate: parseReportDate(factLine),
      guestCount: parseCount(factLine?.match(/(\d+)\s+Final/)?.[1]),
    },
    staff: readStaff(lines),
    timeline: readTimeline(lines),
    notes: {
      serviceSetup: readPrefixed(lines, "Service Setup / Layout"),
      cateringKitchen: readPrefixed(lines, "Catering Kitchen / Staging"),
      operationsNotes: readPrefixed(lines, "Operations Notes"),
      additionalTasks: readScopeNotes(lines),
    },
  };
}
