// AC-057 contact history: TPP's "Contact Tasks & Notes" report -> old-history
// rows (TPP_HISTORY_MAPPINGS field names) for the history import. The report
// is one block per client ("Name:", "Business Name:", phones, "Email:") and a
// task table per block: owner, task date, priority, done, subject,
// description, and the event the task belongs to ("... (Event #: 5098)").
// It has no task id, so a task is known by its event (or, for a task with no
// event, its client), date and subject; the same task printed again after a
// page break is read once. The client's name rides along so the import can
// place a task whose event is not in Capsule.
import { interpretSerial } from "./xlsxValues";

/** Where every column of the report goes (history fields, TPP_HISTORY_MAPPINGS). */
export const TPP_CONTACT_TASK_COLUMNS: ReadonlyArray<{
  column: string;
  field: string;
  note: string;
}> = [
  {
    column: "Name:",
    field: "ContactName",
    note: "the client the task is under",
  },
  {
    column: "Business Name: / Work #: / Home #: / Mobile #: / Email:",
    field: "",
    note: "the client's own details; they come in from the Address / Phone List",
  },
  { column: "Task Owner", field: "CreatedBy", note: "who the task was for" },
  {
    column: "Task Type",
    field: "HistoryType",
    note: 'blank in the report; every line is a "Task"',
  },
  { column: "Task Date", field: "HistoryDate", note: "also the due date" },
  { column: "Priority", field: "Priority", note: "kept on the import link" },
  { column: "Complete ?", field: "Completed", note: "Yes = done" },
  { column: "Task Subject", field: "Subject", note: "the task's title" },
  { column: "Task Description", field: "Notes", note: "the task's details" },
  {
    column: "Event Information",
    field: "EventID",
    note: 'the "(Event #: 5098)" number puts the task on its event; the text is kept on the import link',
  },
];

/** True when the grid is TPP's Contact Tasks & Notes report. */
export function isContactTasksReport(
  grid: ReadonlyArray<ReadonlyArray<string>>,
): boolean {
  return grid
    .slice(0, 5)
    .some((cells) =>
      cells.some((cell) => cell.trim() === "Contact Tasks & Notes"),
    );
}

const EVENT_NUMBER = /\(Event #:\s*(\d+)\)\s*$/;

/** "45923" (a sheet date number) or "9/4/2026" -> "YYYY-MM-DD" or the text. */
function taskDate(value: string): string | undefined {
  const text = value.trim();
  if (/^\d{5}(\.\d+)?$/.test(text))
    return interpretSerial(Number(text), "1900").date;
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text) ? text : undefined;
}

export function contactTaskRowsFromGrid(
  grid: ReadonlyArray<ReadonlyArray<string>>,
): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const seen = new Set<string>();
  let contact = "";
  for (const [index, raw] of grid.entries()) {
    const cells = raw.map((cell) => (cell ?? "").trim());
    if (cells[0] === "Name:") {
      // The client's name is the first cell of the next row.
      contact = (grid[index + 1]?.[0] ?? "").trim();
      continue;
    }
    // A task line: owner, a task date, a Yes/No done cell and a subject.
    const date = taskDate(cells[1] ?? "") ?? taskDate(cells[2] ?? "");
    const done = cells[5] ?? "";
    const subject = cells[6] ?? "";
    if (!cells[0] || !date || !/^(yes|no)$/i.test(done) || !subject) continue;
    const eventInfo = cells[10] ?? "";
    const eventId = EVENT_NUMBER.exec(eventInfo)?.[1] ?? "";
    const owner = eventId ? eventId : `client:${contact.toLowerCase()}`;
    const historyId = `task:${owner}:${date}:${subject.toLowerCase()}`;
    if (seen.has(historyId)) continue;
    seen.add(historyId);
    rows.push({
      HistoryID: historyId,
      ...(eventId ? { EventID: eventId } : {}),
      HistoryDate: date,
      DueDate: date,
      HistoryType: "Task",
      Subject: subject,
      Notes: cells[8] ?? "",
      CreatedBy: cells[0],
      Completed: done,
      Priority: cells[4] ?? "",
      ContactName: contact,
      EventInformation: eventInfo,
    });
  }
  return rows;
}
