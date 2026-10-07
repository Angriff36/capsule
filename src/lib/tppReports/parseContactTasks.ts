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
