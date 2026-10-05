/** A finished time entry, ready to list as a worked shift. */
export type WorkedShift = {
  id: string;
  /** The scheduled shift this clock-in was for, when linked. */
  shiftId: string | null;
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
  shiftId?: string | null;
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
        shiftId: row.shiftId ?? null,
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

/**
 * Recorded time against the planned shift (AC-517): "15 min longer than
 * planned", "30 min shorter than planned", "As planned" (within 5 minutes),
 * or null when there is no complete plan to compare with.
 */
export function plannedComparison(
  shift: Pick<WorkedShift, "hours">,
  planned: { startsAt?: number | null; endsAt?: number | null } | null,
): string | null {
  if (planned?.startsAt == null || planned.endsAt == null) return null;
  const plannedMinutes = (planned.endsAt - planned.startsAt) / 60_000;
  const diff = Math.round(shift.hours * 60 - plannedMinutes);
  if (Math.abs(diff) <= 5) return "As planned";
  const size =
    Math.abs(diff) >= 60
      ? hoursLabel(Math.abs(diff) / 60)
      : `${Math.abs(diff)} min`;
  return `${size} ${diff > 0 ? "longer" : "shorter"} than planned`;
}

/** "7.5 h" — hours to one decimal, trailing ".0" dropped. */
export function hoursLabel(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} h`;
}
