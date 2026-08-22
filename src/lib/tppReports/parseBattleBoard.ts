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

const CATEGORIES = new Set(["GENERAL", "BUFFET", "STRIKE", "COCKTAIL HOUR"]);
const TEAM_WORDS = new Set(["FOH", "BOH", "ALL"]);

type TimelineColumn = "time" | "task" | "category" | "notes" | "team" | "staff";

/** Column start positions, read from the "TIME TASK CAT NOTES TEAM STAFF" header. */
function readColumns(
  header: PdfTextLine,
): Map<TimelineColumn, number> | undefined {
  const columns = new Map<TimelineColumn, number>();
  for (const cell of header.cells) {
    const word = cell.text.replace(/\s+/g, "").toUpperCase();
    if (word.startsWith("TIME")) columns.set("time", cell.x);
    else if (word === "TASK") columns.set("task", cell.x);
    else if (word === "CAT") columns.set("category", cell.x);
    else if (word === "NOTES") columns.set("notes", cell.x);
    else if (word === "TEAM") columns.set("team", cell.x);
    else if (word === "STAFF") columns.set("staff", cell.x);
  }
  return columns.has("task") && columns.has("team") ? columns : undefined;
}

function columnOf(
  x: number,
  columns: Map<TimelineColumn, number>,
): TimelineColumn {
  let found: TimelineColumn = "time";
  let best = -Infinity;
  for (const [column, start] of columns) {
    // A cell belongs to the right-most column that starts at or before it.
    if (start - 3 <= x && start > best) {
      best = start;
      found = column;
    }
  }
  return found;
}

function append(current: string | undefined, more: string): string {
  return current ? `${current} ${more}`.trim() : more;
}

/**
 * The run sheet is a table. Cells that wrap print on the next line in their
 * own column, and a category can print on the line above its row, so rows are
 * rebuilt from cell positions rather than from the flat text.
 */
function readTimeline(
  textLines: readonly PdfTextLine[],
): BundleTimelineEntry[] {
  const lines = textLines.filter((line) => line.text.trim().length > 0);
  const headerIndex = lines.findIndex((line) =>
    TIMELINE_HEADER.test(line.text.trim()),
  );
  if (headerIndex < 0) return [];
  const columns = readColumns(lines[headerIndex]!);
  if (columns === undefined)
    return readTimelineFromText(lines.map((l) => l.text));

  const entries: BundleTimelineEntry[] = [];
  let pendingCategory: string | undefined;

  for (const line of lines.slice(headerIndex + 1)) {
    const text = line.text.trim();
    if (TIMELINE_HEADER.test(text)) continue;
    if (SECTION_TITLE.test(text) && !isCategoryLine(text)) break;

    const byColumn = new Map<TimelineColumn, string>();
    for (const cell of line.cells) {
      const column = columnOf(cell.x, columns);
      // The clock and the task print close enough to share one cell.
      const row = column === "time" ? cell.text.match(TIME_ROW) : null;
      if (row) {
        byColumn.set("time", row[1]!);
        if (row[2]!.trim()) {
          byColumn.set("task", append(byColumn.get("task"), row[2]!.trim()));
        }
        continue;
      }
      byColumn.set(column, append(byColumn.get(column), cell.text));
    }

    const minutes = parseClockMinutes(byColumn.get("time"));
    if (minutes !== undefined) {
      const entry: BundleTimelineEntry = {
        name: byColumn.get("task") ?? "",
        minutes,
      };
      const category = byColumn.get("category") ?? pendingCategory;
      if (category) entry.category = category;
      const notes = byColumn.get("notes");
      if (notes) entry.notes = notes;
      const team = byColumn.get("team");
      if (team) entry.team = team;
      const staff = byColumn.get("staff");
      if (staff) entry.staff = staff;
      entries.push(entry);
      pendingCategory = undefined;
      continue;
    }

    const current = entries.at(-1);
    const categoryText = byColumn.get("category");
    if (categoryText && byColumn.size === 1) {
      // A category alone on a line is either the wrapped second word of the
      // row above ("COCKTAIL" / "HOUR") or the category of the row below.
      const upper = categoryText.toUpperCase();
      if (
        current?.category &&
        !CATEGORIES.has(upper) &&
        CATEGORIES.has(`${current.category} ${upper}`.toUpperCase())
      ) {
        current.category = `${current.category} ${categoryText}`;
      } else {
        pendingCategory = categoryText;
      }
      continue;
    }
    if (!current) continue;
    // Wrapped cells continue the row above, column by column.
    const task = byColumn.get("task");
    if (task) current.name = append(current.name, task);
    const notes = byColumn.get("notes");
    if (notes) current.notes = append(current.notes, notes);
    const staff = byColumn.get("staff");
    if (staff) current.staff = append(current.staff, staff);
    const team = byColumn.get("team");
    if (team && !current.team) current.team = team;
    if (categoryText) {
      current.category = append(current.category, categoryText);
    }
  }

  for (const entry of entries) {
    entry.name = entry.name.replace(/\s+/g, " ").trim();
    // A category can print flush against a long task ("ready?GENERAL").
    const glued = entry.name.match(/^(.*\S)(GENERAL|BUFFET|STRIKE|COCKTAIL)$/);
    if (glued && !entry.category) {
      entry.name = glued[1]!.trim();
      entry.category = glued[2]!;
    }
    if (entry.team && TEAM_WORDS.has(entry.team.toUpperCase())) {
      entry.team =
        entry.team.toUpperCase() === "ALL"
          ? "Everyone"
          : entry.team.toUpperCase();
    }
  }
  return entries.filter((entry) => entry.name.length > 0);
}

/** Fallback when the header cells could not be read: the flat-text parse. */
function readTimelineFromText(lines: readonly string[]): BundleTimelineEntry[] {
  const start = lines.findIndex((line) => TIMELINE_HEADER.test(line));
  if (start < 0) return [];

  const entries: BundleTimelineEntry[] = [];
  let category: string | undefined;

  for (const line of lines.slice(start + 1)) {
    const row = line.match(TIME_ROW);
    if (!row) {
      if (isCategoryLine(line)) {
        category =
          category !== undefined && entries.length === 0
            ? `${category} ${line}`.trim()
            : line;
        continue;
      }
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
    timeline: readTimeline(textLines),
    notes: {
      serviceSetup: readPrefixed(lines, "Service Setup / Layout"),
      cateringKitchen: readPrefixed(lines, "Catering Kitchen / Staging"),
      operationsNotes: readPrefixed(lines, "Operations Notes"),
      additionalTasks: readScopeNotes(lines),
    },
  };
}
