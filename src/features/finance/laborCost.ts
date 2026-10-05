/**
 * Planned versus actual labor for one event (spec §12.2 "planned versus
 * actual labor cost", AC-510). Planned = committed shifts × the person's
 * hourly rate; actual = finished time entries (unpaid lunch taken off) ×
 * rate. A person with no rate is never priced as $0 silently: their minutes
 * are counted as unpriced and their name is listed.
 */
import {
  paidMinutes,
  isFinishedTime,
  type PayTimeRecord,
} from "../workforce/timePay";

export type LaborShift = {
  personId?: unknown;
  eventId?: unknown;
  startsAt?: number | null;
  endsAt?: number | null;
  status?: unknown;
  deletedAt?: unknown;
};

export type LaborPerson = {
  name: string;
  hourlyRate: number | null | undefined;
};

export type PlannedVsActualLabor = {
  plannedMinutes: number;
  plannedCost: number;
  plannedShiftCount: number;
  actualMinutes: number;
  actualCost: number;
  actualRecordCount: number;
  /** actual cost minus planned cost (priced minutes only). */
  varianceCost: number;
  unpricedPlannedMinutes: number;
  unpricedActualMinutes: number;
  peopleMissingRates: string[];
};

const COMMITTED = new Set(["scheduled", "started", "completed"]);

const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

function priced(rate: number | null | undefined): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate >= 0;
}

/**
 * `records` must already be the event's entries (direct eventId or via the
 * entry's shift); `shifts` may be the whole workspace.
 */
export function plannedVsActualLabor({
  eventId,
  shifts,
  records,
  people,
}: {
  eventId: string;
  shifts: readonly LaborShift[];
  records: readonly PayTimeRecord[];
  people: ReadonlyMap<string, LaborPerson>;
}): PlannedVsActualLabor {
  const missing = new Set<string>();
  const nameOf = (personId: string) =>
    people.get(personId)?.name ?? "Unknown person";
  let plannedMinutes = 0;
  let plannedCost = 0;
  let plannedShiftCount = 0;
  let unpricedPlannedMinutes = 0;
  for (const shift of shifts) {
    if (
      shift.deletedAt != null ||
      String(shift.eventId ?? "") !== eventId ||
      !COMMITTED.has(String(shift.status)) ||
      shift.startsAt == null ||
      shift.endsAt == null ||
      shift.endsAt <= shift.startsAt
    )
      continue;
    const minutes = (shift.endsAt - shift.startsAt) / 60_000;
    const personId = String(shift.personId ?? "");
    const rate = people.get(personId)?.hourlyRate;
    plannedMinutes += minutes;
    plannedShiftCount += 1;
    if (priced(rate)) plannedCost += (minutes / 60) * rate;
    else {
      unpricedPlannedMinutes += minutes;
      missing.add(nameOf(personId));
    }
  }
  let actualMinutes = 0;
  let actualCost = 0;
  let actualRecordCount = 0;
  let unpricedActualMinutes = 0;
  for (const record of records) {
    if (!isFinishedTime(record)) continue;
    const minutes = paidMinutes(record) ?? 0;
    const personId = String(record.personId ?? "");
    const rate = people.get(personId)?.hourlyRate;
    actualMinutes += minutes;
    actualRecordCount += 1;
    if (priced(rate)) actualCost += (minutes / 60) * rate;
    else if (minutes > 0) {
      unpricedActualMinutes += minutes;
      missing.add(nameOf(personId));
    }
  }
  return {
    plannedMinutes: Math.round(plannedMinutes),
    plannedCost: money(plannedCost),
    plannedShiftCount,
    actualMinutes: Math.round(actualMinutes),
    actualCost: money(actualCost),
    actualRecordCount,
    varianceCost: money(actualCost - plannedCost),
    unpricedPlannedMinutes: Math.round(unpricedPlannedMinutes),
    unpricedActualMinutes: Math.round(unpricedActualMinutes),
    peopleMissingRates: [...missing].sort((a, b) => a.localeCompare(b)),
  };
}
