// PL-SOURCE-HISTORY (AC-062, AC-111): read old-system contact history rows
// (TPP_HISTORY_MAPPINGS in src/import/import-dataset.manifest). Each row is one
// call, email, meeting, note or task. Nothing is made up: a row with no date or
// no words is refused, and a task's done state comes only from the row.
import { parseTppDateTime } from "../tppParser";

export type HistoryMedium = "call" | "email" | "meeting" | "note" | "task";

export type ParsedHistoryRow = {
  externalId: string;
  contactId?: string;
  companyId?: string;
  eventId?: string;
  occurredAt: number;
  medium: HistoryMedium;
  summary: string;
  authorName?: string;
  dueAt?: number;
  completedAt?: number;
  taskDone?: boolean;
};

export type HistoryParseResult = {
  records: ParsedHistoryRow[];
  sourceIndexes: number[];
  errors: Array<{ recordIndex: number; field: string; message: string }>;
};

function text(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

/** The old system's activity type, in Capsule's words. Unknown types are notes. */
export function historyMedium(value: string): HistoryMedium {
  const lower = value.toLowerCase();
  if (/task|to-?do|follow/.test(lower)) return "task";
  if (/call|phone/.test(lower)) return "call";
  if (/e-?mail/.test(lower)) return "email";
  if (/meet|tasting|visit|appointment/.test(lower)) return "meeting";
  return "note";
}

/** Done, open, or not said. */
export function historyTaskDone(value: string): boolean | undefined {
  const lower = value.trim().toLowerCase();
  if (!lower) return undefined;
  if (/^(done|complete|completed|closed|finished|yes|true|1)$/.test(lower)) {
    return true;
  }
  if (/^(open|pending|not started|in progress|no|false|0)$/.test(lower)) {
    return false;
  }
  return undefined;
}

export function parseTppHistory(rows: unknown[]): HistoryParseResult {
  const records: ParsedHistoryRow[] = [];
  const sourceIndexes: number[] = [];
  const errors: HistoryParseResult["errors"] = [];
  rows.forEach((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const externalId = text(row, "HistoryID", "ActivityID", "NoteID", "TaskID");
    if (!externalId) {
      errors.push({
        recordIndex: index,
        field: "HistoryID",
        message: "This history row has no id in the old system",
      });
      return;
    }
    const occurredAt = parseTppDateTime(
      text(row, "HistoryDate", "ActivityDate", "Date") || undefined,
      text(row, "HistoryTime", "Time") || undefined,
    );
    if (occurredAt === undefined) {
      errors.push({
        recordIndex: index,
        field: "HistoryDate",
        message: "This history row has no date Capsule can read",
      });
      return;
    }
    const subject = text(row, "Subject");
    const notes = text(row, "Notes", "Body", "Description");
    const summary = [subject, notes].filter(Boolean).join("\n\n");
    if (!summary) {
      errors.push({
        recordIndex: index,
        field: "Notes",
        message: "This history row has no words",
      });
      return;
    }
    const contactId = text(row, "ContactID");
    const companyId = text(row, "CompanyID", "ClientID");
    const eventId = text(row, "EventID", "InvoiceNumber");
    if (!contactId && !companyId && !eventId) {
      errors.push({
        recordIndex: index,
        field: "ContactID",
        message: "This history row names no contact, company or event",
      });
      return;
    }
    const dueAt = parseTppDateTime(text(row, "DueDate") || undefined);
    const completedAt = parseTppDateTime(
      text(row, "CompletedDate", "DoneDate") || undefined,
    );
    const statusDone = historyTaskDone(text(row, "Status", "Completed"));
    records.push({
      externalId,
      contactId: contactId || undefined,
      companyId: companyId || undefined,
      eventId: eventId || undefined,
      occurredAt,
      medium: historyMedium(text(row, "HistoryType", "ActivityType", "Type")),
      summary,
      authorName: text(row, "CreatedBy", "Author", "Salesperson") || undefined,
      dueAt,
      completedAt,
      taskDone: completedAt !== undefined ? true : statusDone,
    });
    sourceIndexes.push(index);
  });
  return { records, sourceIndexes, errors };
}
