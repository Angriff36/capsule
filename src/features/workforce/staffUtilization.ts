export const DEFAULT_WEEKLY_SCHEDULE_TARGET_HOURS = 32;

const CONFIRMED_TIME_STATUSES = new Set(["closed", "corrected"]);
const COMMITTED_SHIFT_STATUSES = new Set(["scheduled", "started", "completed"]);

type DateValue = Date | number | string | null | undefined;

export type StaffUtilizationPerson = {
  _id: string;
  givenName?: string | null;
  familyName?: string | null;
  status?: string | null;
  deletedAt?: DateValue;
};

export type StaffUtilizationShift = {
  _id?: string;
  personId?: string | null;
  eventId?: string | null;
  startsAt?: DateValue;
  endsAt?: DateValue;
  status?: string | null;
  deletedAt?: DateValue;
};

export type StaffUtilizationTimeRecord = {
  _id?: string;
  personId?: string | null;
  shiftId?: string | null;
  eventId?: string | null;
  clockInAt?: DateValue;
  clockOutAt?: DateValue;
  breakMinutes?: number | null;
  status?: string | null;
  deletedAt?: DateValue;
};

export type StaffUtilizationEvent = {
  _id: string;
  eventType?: string | null;
  deletedAt?: DateValue;
};

export type StaffUtilizationRow = {
  personId: string;
  personName: string;
  activeForScheduling: boolean;
  scheduledHours: number;
  billableHours: number;
  totalHours: number;
  utilizationPercent: number | null;
  targetHours: number;
  scheduleGapHours: number;
  underScheduled: boolean;
  confirmedRecordCount: number;
  shiftCount: number;
};

export type StaffingDemandBucket = {
  key: string;
  label: string;
  hours: number;
  shiftCount: number;
  sharePercent: number;
};

export type StaffUtilizationReport = {
  rows: StaffUtilizationRow[];
  startAt: number;
  endAt: number;
  calendarDays: number;
  targetHoursPerPerson: number;
  billableHours: number;
  totalHours: number;
  scheduledHours: number;
  utilizationPercent: number | null;
  underScheduledCount: number;
  confirmedRecordCount: number;
  committedShiftCount: number;
  demandByWeekday: StaffingDemandBucket[];
  demandByEventType: StaffingDemandBucket[];
  peakWeekday: StaffingDemandBucket | null;
  peakEventType: StaffingDemandBucket | null;
};

type StaffAccumulator = {
  personId: string;
  personName: string;
  activeForScheduling: boolean;
  scheduledHours: number;
  billableHours: number;
  totalHours: number;
  confirmedRecordCount: number;
  shiftIds: Set<string>;
};

type DemandAccumulator = {
  key: string;
  label: string;
  hours: number;
  shiftIds: Set<string>;
};

const WEEKDAYS = [
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
  { day: 0, label: "Sunday" },
] as const;

function timestamp(value: DateValue): number | null {
  if (value == null) return null;
  const result =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function personName(person: StaffUtilizationPerson | undefined): string {
  if (!person) return "Unknown staff member";
  return (
    [person.givenName, person.familyName].filter(Boolean).join(" ").trim() ||
    "Unnamed staff member"
  );
}

function calendarDaysBetween(startAt: number, endAt: number): number {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const startDay = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.round((endDay - startDay) / 86_400_000));
}

function overlapHours(
  startsAt: number,
  endsAt: number,
  rangeStartAt: number,
  rangeEndAt: number,
): number {
  return (
    Math.max(
      0,
      Math.min(endsAt, rangeEndAt) - Math.max(startsAt, rangeStartAt),
    ) / 3_600_000
  );
}

function getStaff(
  accumulators: Map<string, StaffAccumulator>,
  peopleById: ReadonlyMap<string, StaffUtilizationPerson>,
  personId: string,
): StaffAccumulator {
  const current = accumulators.get(personId);
  if (current) return current;
  const person = peopleById.get(personId);
  const created: StaffAccumulator = {
    personId,
    personName: personName(person),
    activeForScheduling:
      person?.deletedAt == null && String(person?.status) === "active",
    scheduledHours: 0,
    billableHours: 0,
    totalHours: 0,
    confirmedRecordCount: 0,
    shiftIds: new Set(),
  };
  accumulators.set(personId, created);
  return created;
}

function getDemand(
  accumulators: Map<string, DemandAccumulator>,
  key: string,
  label: string,
): DemandAccumulator {
  const current = accumulators.get(key);
  if (current) return current;
  const created = { key, label, hours: 0, shiftIds: new Set<string>() };
  accumulators.set(key, created);
  return created;
}

function splitShiftAcrossWeekdays(
  startsAt: number,
  endsAt: number,
  rangeStartAt: number,
  rangeEndAt: number,
  shiftKey: string,
  demand: Map<string, DemandAccumulator>,
) {
  let cursor = Math.max(startsAt, rangeStartAt);
  const finalEnd = Math.min(endsAt, rangeEndAt);
  while (cursor < finalEnd) {
    const segmentDate = new Date(cursor);
    const day = segmentDate.getDay();
    const nextDay = new Date(cursor);
    nextDay.setHours(24, 0, 0, 0);
    const segmentEnd = Math.min(finalEnd, nextDay.getTime());
    const weekday = WEEKDAYS.find((item) => item.day === day);
    if (weekday) {
      const bucket = getDemand(demand, `weekday:${day}`, weekday.label);
      bucket.hours += (segmentEnd - cursor) / 3_600_000;
      bucket.shiftIds.add(shiftKey);
    }
    cursor = segmentEnd;
  }
}

function demandBuckets(
  accumulators: Iterable<DemandAccumulator>,
  totalHours: number,
): StaffingDemandBucket[] {
  return [...accumulators].map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    hours: roundHours(bucket.hours),
    shiftCount: bucket.shiftIds.size,
    sharePercent:
      totalHours > 0
        ? Math.round((bucket.hours / totalHours) * 10_000) / 100
        : 0,
  }));
}

function highestDemand(
  buckets: readonly StaffingDemandBucket[],
): StaffingDemandBucket | null {
  return (
    [...buckets].sort(
      (a, b) => b.hours - a.hours || a.label.localeCompare(b.label),
    )[0] ?? null
  );
}

export function buildStaffUtilizationReport({
  people,
  shifts,
  timeRecords,
  events,
  startAt,
  endAt,
  weeklyScheduleTargetHours = DEFAULT_WEEKLY_SCHEDULE_TARGET_HOURS,
}: {
  people: readonly StaffUtilizationPerson[];
  shifts: readonly StaffUtilizationShift[];
  timeRecords: readonly StaffUtilizationTimeRecord[];
  events: readonly StaffUtilizationEvent[];
  startAt: number;
  endAt: number;
  weeklyScheduleTargetHours?: number;
}): StaffUtilizationReport {
  const validRange =
    Number.isFinite(startAt) && Number.isFinite(endAt) && endAt > startAt;
  const calendarDays = validRange ? calendarDaysBetween(startAt, endAt) : 0;
  const targetHoursPerPerson = roundHours(
    Math.max(0, weeklyScheduleTargetHours) * (calendarDays / 7),
  );
  const peopleById = new Map(
    people.map((person) => [String(person._id), person]),
  );
  const eventsById = new Map(events.map((event) => [String(event._id), event]));
  const shiftsById = new Map(
    shifts
      .filter((shift) => shift._id != null)
      .map((shift) => [String(shift._id), shift]),
  );
  const staff = new Map<string, StaffAccumulator>();
  const weekdayDemand = new Map<string, DemandAccumulator>();
  const eventTypeDemand = new Map<string, DemandAccumulator>();

  for (const person of people) {
    if (person.deletedAt == null && String(person.status) === "active") {
      getStaff(staff, peopleById, String(person._id));
    }
  }

  if (validRange) {
    shifts.forEach((shift, index) => {
      const personId = String(shift.personId ?? "");
      const startsAt = timestamp(shift.startsAt);
      const endsAt = timestamp(shift.endsAt);
      if (
        !personId ||
        shift.deletedAt != null ||
        !COMMITTED_SHIFT_STATUSES.has(String(shift.status)) ||
        startsAt == null ||
        endsAt == null ||
        endsAt <= startsAt
      ) {
        return;
      }
      const scheduledHours = overlapHours(startsAt, endsAt, startAt, endAt);
      if (scheduledHours <= 0) return;

      const shiftKey = String(shift._id ?? `shift:${index}`);
      const row = getStaff(staff, peopleById, personId);
      row.scheduledHours += scheduledHours;
      row.shiftIds.add(shiftKey);
      splitShiftAcrossWeekdays(
        startsAt,
        endsAt,
        startAt,
        endAt,
        shiftKey,
        weekdayDemand,
      );

      const eventId = String(shift.eventId ?? "");
      const event = eventId ? eventsById.get(eventId) : undefined;
      const eventType = eventId
        ? event?.eventType?.trim() || "Unclassified event"
        : "Internal / unlinked";
      const eventBucket = getDemand(
        eventTypeDemand,
        `event-type:${eventType.toLocaleLowerCase()}`,
        eventType,
      );
      eventBucket.hours += scheduledHours;
      eventBucket.shiftIds.add(shiftKey);
    });

    timeRecords.forEach((record) => {
      const personId = String(record.personId ?? "");
      const clockInAt = timestamp(record.clockInAt);
      const clockOutAt = timestamp(record.clockOutAt);
      if (
        !personId ||
        record.deletedAt != null ||
        !CONFIRMED_TIME_STATUSES.has(String(record.status)) ||
        clockInAt == null ||
        clockOutAt == null ||
        clockOutAt < clockInAt ||
        clockInAt < startAt ||
        clockOutAt > endAt
      ) {
        return;
      }
      const breakMinutes = Number(record.breakMinutes ?? 0);
      const workedHours = Math.max(
        0,
        (clockOutAt - clockInAt) / 3_600_000 -
          (Number.isFinite(breakMinutes) ? Math.max(0, breakMinutes) / 60 : 0),
      );
      const row = getStaff(staff, peopleById, personId);
      row.totalHours += workedHours;
      row.confirmedRecordCount += 1;
      const linkedShift = record.shiftId
        ? shiftsById.get(String(record.shiftId))
        : undefined;
      if (record.eventId || linkedShift?.eventId) {
        row.billableHours += workedHours;
      }
    });
  }

  const rows = [...staff.values()]
    .map<StaffUtilizationRow>((entry) => {
      const scheduledHours = roundHours(entry.scheduledHours);
      const totalHours = roundHours(entry.totalHours);
      const billableHours = roundHours(entry.billableHours);
      const scheduleGapHours = roundHours(
        Math.max(0, targetHoursPerPerson - scheduledHours),
      );
      return {
        personId: entry.personId,
        personName: entry.personName,
        activeForScheduling: entry.activeForScheduling,
        scheduledHours,
        billableHours,
        totalHours,
        utilizationPercent:
          totalHours > 0
            ? Math.round((billableHours / totalHours) * 10_000) / 100
            : null,
        targetHours: targetHoursPerPerson,
        scheduleGapHours,
        underScheduled:
          entry.activeForScheduling && scheduleGapHours > Number.EPSILON,
        confirmedRecordCount: entry.confirmedRecordCount,
        shiftCount: entry.shiftIds.size,
      };
    })
    .sort(
      (a, b) =>
        Number(b.underScheduled) - Number(a.underScheduled) ||
        a.personName.localeCompare(b.personName),
    );

  const scheduledHours = roundHours(
    rows.reduce((total, row) => total + row.scheduledHours, 0),
  );
  const totalHours = roundHours(
    rows.reduce((total, row) => total + row.totalHours, 0),
  );
  const billableHours = roundHours(
    rows.reduce((total, row) => total + row.billableHours, 0),
  );
  const demandByWeekday = demandBuckets(
    WEEKDAYS.map((weekday) =>
      getDemand(weekdayDemand, `weekday:${weekday.day}`, weekday.label),
    ),
    scheduledHours,
  );
  const demandByEventType = demandBuckets(
    [...eventTypeDemand.values()].sort(
      (a, b) => b.hours - a.hours || a.label.localeCompare(b.label),
    ),
    scheduledHours,
  );

  return {
    rows,
    startAt,
    endAt,
    calendarDays,
    targetHoursPerPerson,
    billableHours,
    totalHours,
    scheduledHours,
    utilizationPercent:
      totalHours > 0
        ? Math.round((billableHours / totalHours) * 10_000) / 100
        : null,
    underScheduledCount: rows.filter((row) => row.underScheduled).length,
    confirmedRecordCount: rows.reduce(
      (total, row) => total + row.confirmedRecordCount,
      0,
    ),
    committedShiftCount: rows.reduce((total, row) => total + row.shiftCount, 0),
    demandByWeekday,
    demandByEventType,
    peakWeekday: highestDemand(demandByWeekday.filter((row) => row.hours > 0)),
    peakEventType: highestDemand(demandByEventType),
  };
}
