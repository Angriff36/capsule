// Reading Nowsta's "Time & Attendance" export (PL-REPLACEMENT-PROOF, Nowsta
// history). Built against the real export the owner saved
// (Supp Wedding Time & Attendance.csv): one heading row (Date, Event Name,
// Employee ID, First Name, Last Name, Phone Number, Email, Position,
// Scheduled In, Scheduled Out, Actual In, Breaks, Actual Out, Scheduled Hours,
// Actual Hours, Rate, Scheduled Cost, Actual Cost, Bill Rate, Bill Total,
// Notes, Approved), one row per worker per shift, then a blank line and a
// Totals line. Dates are MM/DD/YYYY and times "3:30 PM", in the company's
// own time.
//
// Each past row becomes one finished shift of its worker on its event. Pay
// and billing figures stay in Nowsta: payroll is not being built now (owner,
// 2026-09-29) and a person's pay rate is private on their own record.

/** Where every column of the export goes. */
export const NOWSTA_TIME_ATTENDANCE_COLUMNS: ReadonlyArray<{
  column: string;
  goesTo: "shift" | "person" | "kept with the shift" | "not kept";
  note: string;
}> = [
  { column: "Date", goesTo: "shift", note: "the day of the shift" },
  {
    column: "Event Name",
    goesTo: "shift",
    note: "the Capsule event with the same name on that day",
  },
  {
    column: "Employee ID",
    goesTo: "kept with the shift",
    note: "Nowsta's worker number, used first to tell rows apart",
  },
  {
    column: "First Name",
    goesTo: "person",
    note: "first name; with Last Name it finds the person when email and phone do not",
  },
  { column: "Last Name", goesTo: "person", note: "last name" },
  {
    column: "Phone Number",
    goesTo: "person",
    note: "finds the person when the email does not; a new person gets it",
  },
  {
    column: "Email",
    goesTo: "person",
    note: "finds the person first; a new person needs one",
  },
  { column: "Position", goesTo: "shift", note: "the shift's role" },
  { column: "Scheduled In", goesTo: "shift", note: "planned start" },
  {
    column: "Scheduled Out",
    goesTo: "shift",
    note: "planned end (the next day when it is before the start)",
  },
  {
    column: "Actual In",
    goesTo: "shift",
    note: "when the shift really started",
  },
  { column: "Breaks", goesTo: "kept with the shift", note: "as written" },
  {
    column: "Actual Out",
    goesTo: "shift",
    note: "when the shift really ended",
  },
  {
    column: "Scheduled Hours",
    goesTo: "not kept",
    note: "Capsule works it out from the planned start and end",
  },
  {
    column: "Actual Hours",
    goesTo: "not kept",
    note: "Capsule works it out from the real start and end",
  },
  {
    column: "Rate",
    goesTo: "not kept",
    note: "pay stays in Nowsta; Capsule keeps pay rates on the person, private",
  },
  { column: "Scheduled Cost", goesTo: "not kept", note: "pay stays in Nowsta" },
  { column: "Actual Cost", goesTo: "not kept", note: "pay stays in Nowsta" },
  {
    column: "Bill Rate",
    goesTo: "not kept",
    note: "what was charged stays on the event's own invoice",
  },
  {
    column: "Bill Total",
    goesTo: "not kept",
    note: "what was charged stays on the event's own invoice",
  },
  { column: "Notes", goesTo: "kept with the shift", note: "as written" },
  { column: "Approved", goesTo: "kept with the shift", note: "as written" },
];

export type NowstaShiftRow = {
  /** Line in the file, counting the heading as line 1. */
  line: number;
  /** YYYY-MM-DD. */
  date: string;
  /** Local midnight of the day and of the next day. */
  dayStart: number;
  dayEnd: number;
  eventName: string;
  employeeId?: string;
  givenName: string;
  familyName: string;
  email?: string;
  phone?: string;
  position: string;
  startsAt: number;
  endsAt: number;
  actualStartsAt?: number;
  actualEndsAt?: number;
  /** One id per worker, event, day, position and start, so a second read of
   * the same file brings nothing in twice. */
  externalId: string;
  /** The columns kept with the shift, as written. */
  kept: Record<string, string>;
};

export type NowstaRead = {
  rows: NowstaShiftRow[];
  problems: Array<{ line: number; reason: string }>;
};

const HEADINGS = ["date", "event name", "first name", "scheduled in"];

const norm = (value: string | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function headingRow(grid: readonly string[][]): number {
  return grid.findIndex((row) => {
    const cells = row.map(norm);
    return HEADINGS.every((heading) => cells.includes(heading));
  });
}

/** True when the grid is a Nowsta Time & Attendance export. */
export function isNowstaTimeAttendance(grid: readonly string[][]): boolean {
  return headingRow(grid) >= 0;
}

function parseDay(text: string): { date: string; start: Date } | null {
  const value = text.trim();
  let year: number, month: number, day: number;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (us) {
    month = Number(us[1]);
    day = Number(us[2]);
    year = Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else return null;
  const start = new Date(year, month - 1, day);
  if (start.getMonth() !== month - 1 || start.getDate() !== day) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${year}-${pad(month)}-${pad(day)}`, start };
}

/** Minutes after midnight for "3:30 PM", "15:30" or "3 PM". */
function parseClock(text: string): number | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(text.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const half = match[3]?.toLowerCase().replace(/\./g, "");
  if (minute > 59) return null;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === "pm" ? 12 : 0);
  } else if (hour > 23) return null;
  return hour * 60 + minute;
}

function at(day: Date, minutes: number): number {
  const when = new Date(day);
  when.setHours(0, minutes, 0, 0);
  return when.getTime();
}

/** End on the same day, or the next day when it is not after the start. */
function endAfter(day: Date, start: number, minutes: number): number {
  const end = at(day, minutes);
  if (end > start) return end;
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  return at(next, minutes);
}

const slug = (value: string) => norm(value).replace(/[^a-z0-9@.+-]+/g, "-");

export function readNowstaShifts(grid: readonly string[][]): NowstaRead {
  const head = headingRow(grid);
  if (head < 0) return { rows: [], problems: [] };
  const columns = grid[head]!.map(norm);
  const cell = (row: readonly string[], name: string) => {
    const index = columns.indexOf(name);
    return index >= 0 ? (row[index] ?? "").trim() : "";
  };
  const rows: NowstaShiftRow[] = [];
  const problems: NowstaRead["problems"] = [];
  for (let index = head + 1; index < grid.length; index += 1) {
    const row = grid[index]!;
    const line = index + 1;
    const dateText = cell(row, "date");
    // The blank line and the Totals line under the shifts.
    if (!dateText) continue;
    const day = parseDay(dateText);
    if (!day) {
      problems.push({ line, reason: `"${dateText}" is not a date.` });
      continue;
    }
    const eventName = cell(row, "event name").replace(/\s+/g, " ");
    const givenName = cell(row, "first name").replace(/\s+/g, " ");
    const familyName = cell(row, "last name").replace(/\s+/g, " ");
    if (!eventName || !(givenName || familyName)) {
      problems.push({
        line,
        reason: "The row has no event name or no worker name.",
      });
      continue;
    }
    const scheduledIn = parseClock(cell(row, "scheduled in"));
    const scheduledOut = parseClock(cell(row, "scheduled out"));
    if (scheduledIn == null || scheduledOut == null) {
      problems.push({
        line,
        reason: `${givenName} ${familyName}: the planned start or end is not a time.`,
      });
      continue;
    }
    const startsAt = at(day.start, scheduledIn);
    const endsAt = endAfter(day.start, startsAt, scheduledOut);
    const actualIn = parseClock(cell(row, "actual in"));
    const actualOut = parseClock(cell(row, "actual out"));
    const actual =
      actualIn != null && actualOut != null
        ? (() => {
            const actualStartsAt = at(day.start, actualIn);
            return {
              actualStartsAt,
              actualEndsAt: endAfter(day.start, actualStartsAt, actualOut),
            };
          })()
        : {};
    const email = cell(row, "email").replace(/\s+/g, "").toLowerCase();
    const phone = cell(row, "phone number");
    const employeeId = cell(row, "employee id");
    const position = cell(row, "position").replace(/\s+/g, " ");
    const nextDay = new Date(day.start);
    nextDay.setDate(nextDay.getDate() + 1);
    const worker =
      employeeId ||
      email ||
      phone.replace(/\D/g, "") ||
      `${givenName} ${familyName}`;
    const kept: Record<string, string> = {};
    for (const name of ["Employee ID", "Breaks", "Notes", "Approved"]) {
      const value = cell(row, name.toLowerCase());
      if (value) kept[name] = value;
    }
    rows.push({
      line,
      date: day.date,
      dayStart: day.start.getTime(),
      dayEnd: nextDay.getTime(),
      eventName,
      ...(employeeId ? { employeeId } : {}),
      givenName,
      familyName,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      position,
      startsAt,
      endsAt,
      ...actual,
      externalId: [
        day.date,
        slug(eventName),
        slug(worker),
        slug(position),
        String(scheduledIn),
      ].join("/"),
      kept,
    });
  }
  return { rows, problems };
}

/** What the server found for one row. */
export type NowstaRowMatch = {
  externalId: string;
  /** An earlier read already brought this shift in. */
  imported: boolean;
  /** Capsule events with the row's event name on that day. */
  eventIds: string[];
};

export type NowstaPerson = {
  _id: string;
  givenName: string;
  familyName: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  deletedAt?: unknown;
};

export type NowstaStep =
  | { kind: "done"; row: NowstaShiftRow }
  | { kind: "ahead"; row: NowstaShiftRow }
  | { kind: "noEvent"; row: NowstaShiftRow }
  | { kind: "twoEvents"; row: NowstaShiftRow }
  | { kind: "noPerson"; row: NowstaShiftRow }
  | {
      kind: "save";
      row: NowstaShiftRow;
      eventId: string;
      /** Missing: the person is added first (same email = one new person). */
      personId?: string;
    };

const digits = (value: string | null | undefined) =>
  (value ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

/** What each row will do, in file order. */
export function planNowstaShifts(
  rows: readonly NowstaShiftRow[],
  people: readonly NowstaPerson[],
  matches: readonly NowstaRowMatch[],
  now: number,
): NowstaStep[] {
  const current = people.filter(
    (person) => person.deletedAt == null && person.status !== "terminated",
  );
  const byId = new Map(matches.map((match) => [match.externalId, match]));
  const findPerson = (row: NowstaShiftRow) => {
    const email = norm(row.email);
    const byEmail = email
      ? current.find((one) => norm(one.email ?? "") === email)
      : undefined;
    if (byEmail) return byEmail;
    // A phone or a name counts only when one person has it.
    const phone = digits(row.phone);
    const samePhone =
      phone.length >= 7
        ? current.filter((one) => digits(one.phone) === phone)
        : [];
    if (samePhone.length === 1) return samePhone[0];
    const sameName = current.filter(
      (one) =>
        norm(one.givenName) === norm(row.givenName) &&
        norm(one.familyName) === norm(row.familyName),
    );
    return sameName.length === 1 ? sameName[0] : undefined;
  };
  return rows.map((row): NowstaStep => {
    const match = byId.get(row.externalId);
    if (match?.imported) return { kind: "done", row };
    if ((row.actualEndsAt ?? row.endsAt) > now) return { kind: "ahead", row };
    const eventIds = match?.eventIds ?? [];
    if (eventIds.length === 0) return { kind: "noEvent", row };
    if (eventIds.length > 1) return { kind: "twoEvents", row };
    const person = findPerson(row);
    if (person)
      return { kind: "save", row, eventId: eventIds[0]!, personId: person._id };
    return row.email && row.givenName && row.familyName
      ? { kind: "save", row, eventId: eventIds[0]! }
      : { kind: "noPerson", row };
  });
}
