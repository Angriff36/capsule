/** A finished time entry, ready to list as a worked shift. */
export type WorkedShift = {
  id: string;
  eventId: string | null;
  clockInAt: number;
  clockOutAt: number;
  breakMinutes: number;
  status: string;
  /** Hours worked, net of the break. */
  hours: number;
};

export type WorkedWeek = {
  /** Local midnight of the Monday that starts the week. */
  weekStart: number;
  shifts: WorkedShift[];
  hours: number;
};

type TimeRecordRow = {
  _id: string;
  eventId?: string | null;
  clockInAt?: number | null;
  clockOutAt?: number | null;
  breakMinutes?: number | null;
  status: unknown;
  deletedAt?: number | null;
};

/** Closed and corrected entries with both times, newest first. */
export function workedShifts(records: readonly TimeRecordRow[]): WorkedShift[] {
  return records
    .filter(
      (row) =>
        row.deletedAt == null &&
        row.clockInAt != null &&
        row.clockOutAt != null &&
        row.clockOutAt >= row.clockInAt,
    )
    .map((row) => {
      const breakMinutes = Math.max(0, row.breakMinutes ?? 0);
      const worked =
        (row.clockOutAt! - row.clockInAt!) / 3_600_000 - breakMinutes / 60;
      return {
        id: row._id,
        eventId: row.eventId ?? null,
        clockInAt: row.clockInAt!,
        clockOutAt: row.clockOutAt!,
        breakMinutes,
        status: String(row.status),
        hours: Math.max(0, worked),
      };
    })
    .sort((a, b) => b.clockInAt - a.clockInAt);
}

function mondayOf(ms: number): number {
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day.getTime();
}

/** Worked shifts grouped into Monday-start weeks, newest week first. */
export function workedWeeks(shifts: readonly WorkedShift[]): WorkedWeek[] {
  const weeks = new Map<number, WorkedShift[]>();
  for (const shift of shifts) {
    const key = mondayOf(shift.clockInAt);
    weeks.set(key, [...(weeks.get(key) ?? []), shift]);
  }
  return [...weeks]
    .sort(([a], [b]) => b - a)
    .map(([weekStart, rows]) => ({
      weekStart,
      shifts: rows,
      hours: rows.reduce((total, row) => total + row.hours, 0),
    }));
}

/** "7.5 h" — hours to one decimal, trailing ".0" dropped. */
export function hoursLabel(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} h`;
}
