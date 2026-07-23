const ACTIVE_SCHEDULE_STATUSES = new Set(["scheduled", "started", "completed"]);

export interface WeeklyShiftInput {
  personId: string;
  eventId?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  role?: string | null;
  status: string;
}

const summaryDay = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const summaryTime = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function startOfScheduleWeek(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date.getTime();
}

export function addScheduleWeeks(weekStartsAt: number, amount: number): number {
  const date = new Date(weekStartsAt);
  date.setDate(date.getDate() + amount * 7);
  return date.getTime();
}

export function shiftsInScheduleWeek<T extends WeeklyShiftInput>(
  shifts: readonly T[],
  weekStartsAt: number,
): T[] {
  const weekEndsAt = addScheduleWeeks(weekStartsAt, 1);
  return shifts
    .filter(
      (shift) =>
        ACTIVE_SCHEDULE_STATUSES.has(String(shift.status)) &&
        shift.startsAt != null &&
        shift.startsAt >= weekStartsAt &&
        shift.startsAt < weekEndsAt,
    )
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));
}

export function buildStaffShiftSummary(
  shifts: readonly WeeklyShiftInput[],
  eventName: (eventId: string | undefined) => string,
): string {
  return shifts
    .map((shift) => {
      const startsAt = shift.startsAt ?? 0;
      const endsAt = shift.endsAt ?? startsAt;
      const event = eventName(shift.eventId ?? undefined);
      const role = shift.role?.trim();
      const details = [role, event === "—" ? undefined : event].filter(Boolean);
      return `${summaryDay.format(startsAt)} · ${summaryTime.format(startsAt)}–${summaryTime.format(endsAt)}${details.length ? ` · ${details.join(" · ")}` : ""}`;
    })
    .join("\n");
}
