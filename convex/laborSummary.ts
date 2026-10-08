/**
 * AUTHOR SEAM — labor cost from clocked time × pay rates, server-side.
 *
 * Why this exists: `Person.hourlyRate` is `private` (wages must not ride along
 * on the broad staffAccess `listPerson` read), and `TimeRecord`/`Shift` reads
 * are workforceAccess-gated — so the finance/event managers who reconcile
 * closeouts and payroll would get empty arrays from the generated list hooks
 * (docs/systems/closeout-reporting.md documents that failure). This seam
 * computes labor aggregates with full db access and gates them on the roles
 * that legitimately price labor. Raw rates are only returned by `listPayRates`
 * to workforce/finance managers; the event summary returns aggregates plus
 * missing-rate names, never the rates themselves.
 *
 * Correctness rules (mirrors src/features/finance/payrollExport.ts and
 * src/features/workforce/staffUtilization.ts conventions):
 *  - only non-deleted records with status closed/corrected count;
 *  - worked minutes = (clockOut − clockIn) − break, clamped at 0;
 *  - a record belongs to an event via record.eventId, else via its shift's
 *    eventId;
 *  - period membership = whole record inside [periodStart, periodEnd]
 *    (payrollExport's rule), so prefills match the export;
 *  - hourlyRate == null → "missing" (person is named in peopleMissingRates);
 *    hourlyRate 0 is a VALID volunteer/zero rate, not missing.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import type { Doc } from "./_generated/dataModel";
import { plannedVsActualLabor } from "../src/features/finance/laborCost";
import {
  approvedPayroll,
  attendanceAlerts as findAttendanceAlerts,
  overtimeWarnings,
  type AttendanceAlert,
  type OvertimeWarning,
} from "../src/features/workforce/timePay";

// Pay periods one payroll screen asks for at once (the export period and
// the periods of the inputs it lists).
const PAYROLL_RANGE_CAP = 60;

/** Mirrors financeManageAccess | workforceManageAccess (+ admin tier). */
export function canReadRates(role: string): boolean {
  return (
    role === "finance_manager" ||
    role === "workforce_manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "system"
  );
}

/**
 * Mirrors the closeout read tier (financeAccess | eventManageAccess) plus the
 * workforce tier — everyone who reconciles events or manages labor may see
 * aggregate labor cost. Aggregates only; no raw rates in the payload.
 */
export function canReadLaborAggregates(role: string): boolean {
  return (
    role === "finance_staff" ||
    role === "workforce_staff" ||
    role === "event_manager" ||
    role === "manager" ||
    role.endsWith("_manager") ||
    role === "admin" ||
    role === "owner" ||
    role === "system"
  );
}

const CONFIRMED_TIME_STATUSES = new Set(["closed", "corrected"]);

type LaborSummary = {
  cost: number;
  totalMinutes: number;
  /** Minutes belonging to people with no hourly rate (priced at $0). */
  unpricedMinutes: number;
  recordCount: number;
  peopleMissingRates: string[];
};

type EventLaborSummary = LaborSummary & {
  /** Forecast from scheduled shifts × rates — the labor picture BEFORE anyone clocks in. */
  scheduledMinutes: number;
  scheduledCost: number;
  scheduledShiftCount: number;
  /** Scheduled minutes of people with no rate (not priced). */
  unpricedScheduledMinutes: number;
  /** Clocked cost minus scheduled cost (priced minutes). */
  varianceCost: number;
};

function personName(person: Doc<"people"> | undefined, id: string): string {
  if (!person) return `Unknown person (${id.slice(0, 6)}…)`;
  return (
    [person.givenName, person.familyName].filter(Boolean).join(" ").trim() ||
    "Unnamed person"
  );
}

function workedMinutes(record: Doc<"timeRecords">): number | null {
  if (
    record.deletedAt != null ||
    !CONFIRMED_TIME_STATUSES.has(String(record.status)) ||
    record.clockInAt == null ||
    record.clockOutAt == null ||
    record.clockOutAt < record.clockInAt
  ) {
    return null;
  }
  const breakMinutes = Number(record.breakMinutes ?? 0);
  return Math.max(
    0,
    (record.clockOutAt - record.clockInAt) / 60_000 -
      (Number.isFinite(breakMinutes) ? Math.max(0, breakMinutes) : 0),
  );
}

function summarize(
  records: readonly Doc<"timeRecords">[],
  peopleById: ReadonlyMap<string, Doc<"people">>,
): LaborSummary {
  const missing = new Set<string>();
  let cost = 0;
  let totalMinutes = 0;
  let unpricedMinutes = 0;
  let recordCount = 0;
  for (const record of records) {
    const minutes = workedMinutes(record);
    if (minutes == null) continue;
    const personId = String(record.personId);
    const person = peopleById.get(personId);
    const rate = person?.hourlyRate;
    totalMinutes += minutes;
    recordCount += 1;
    if (typeof rate === "number" && Number.isFinite(rate) && rate >= 0) {
      cost += (minutes / 60) * rate;
    } else if (minutes > 0) {
      missing.add(personName(person, personId));
      unpricedMinutes += minutes;
    }
  }
  return {
    cost: Math.round((cost + Number.EPSILON) * 100) / 100,
    totalMinutes: Math.round(totalMinutes),
    unpricedMinutes: Math.round(unpricedMinutes),
    recordCount,
    peopleMissingRates: [...missing].sort((a, b) => a.localeCompare(b)),
  };
}

async function tenantPeople(
  ctx: { db: any },
  tenantId: string,
): Promise<Map<string, Doc<"people">>> {
  const rows: Doc<"people">[] = await ctx.db
    .query("people")
    .withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId))
    .collect();
  return new Map(rows.map((row) => [String(row._id), row]));
}

/**
 * Time records clocked in at or after `from` (and at or before `to`), through
 * the (tenant, clockInAt) index — never the whole clock history.
 */
async function tenantTimeRecordsClockedIn(
  ctx: { db: any },
  tenantId: string,
  from: number,
  to?: number,
): Promise<Doc<"timeRecords">[]> {
  return await ctx.db
    .query("timeRecords")
    .withIndex("by_tenantId_and_clockInAt", (q: any) => {
      const range = q.eq("tenantId", tenantId).gte("clockInAt", from);
      return to === undefined ? range : range.lte("clockInAt", to);
    })
    .collect();
}

/** Rows of one event through its index, kept to this workspace. */
async function eventRows<T extends "shifts" | "timeRecords">(
  ctx: { db: any },
  table: T,
  tenantId: string,
  eventId: string,
): Promise<Doc<T>[]> {
  const rows: Doc<T>[] = await ctx.db
    .query(table)
    .withIndex("by_eventId", (q: any) => q.eq("eventId", eventId))
    .collect();
  return rows.filter((row) => row.tenantId === tenantId);
}

/**
 * PL-TIME (AC-509): late clock-ins, people not in yet, no-shows, entries
 * still open, and weeks past 40 h - for the people who run labor, never for
 * a worker. `now` comes from the caller so the answer is stable per minute.
 */
export const attendanceAlerts = query({
  args: { now: v.number() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    alerts: Array<AttendanceAlert & { personName: string }>;
    overtime: Array<OvertimeWarning & { personName: string }>;
  } | null> => {
    const auth = await getAuthContext(ctx);
    if (!canReadLaborAggregates(auth.role)) return null;
    // Alerts cover shifts that started in the last week and time clocked in
    // the last 21 days, so only those windows are read.
    const [people, records, shifts] = await Promise.all([
      tenantPeople(ctx, auth.tenantId),
      tenantTimeRecordsClockedIn(
        ctx,
        auth.tenantId,
        args.now - 21 * 24 * 60 * 60_000,
      ),
      ctx.db
        .query("shifts")
        .withIndex("by_tenantId_and_endsAt", (q: any) =>
          q
            .eq("tenantId", auth.tenantId)
            .gte("endsAt", args.now - 7 * 24 * 60 * 60_000)
            .lte("endsAt", args.now + 7 * 24 * 60 * 60_000),
        )
        .collect() as Promise<Doc<"shifts">[]>,
    ]);
    const nameOf = (personId: string) => {
      const person = people.get(personId);
      return person
        ? `${person.givenName} ${person.familyName}`.trim()
        : "Someone";
    };
    const recent = records.filter(
      (record) =>
        record.clockInAt != null &&
        record.clockInAt >= args.now - 21 * 24 * 60 * 60_000,
    );
    return {
      alerts: findAttendanceAlerts({
        shifts: shifts.map((shift) => ({ ...shift, _id: String(shift._id) })),
        records: recent,
        now: args.now,
      }).map((alert) => ({ ...alert, personName: nameOf(alert.personId) })),
      overtime: overtimeWarnings(recent).map((warning) => ({
        ...warning,
        personName: nameOf(warning.personId),
      })),
    };
  },
});

/** Aggregate labor for one event (direct eventId or via the record's shift). */
export const eventLaborSummary = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<EventLaborSummary | null> => {
    const auth = await getAuthContext(ctx);
    if (!canReadLaborAggregates(auth.role)) return null;
    // An event of another workspace, or a missing one, reads as not found.
    const event = await ctx.db.get(args.eventId);
    if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null)
      return null;
    const summary: EventLaborSummary & { records?: unknown } =
      await loadEventLabor(ctx, auth.tenantId, String(args.eventId));
    delete summary.records;
    return summary;
  },
});

/**
 * Event labor with the time records behind it. Shared with the closeout
 * source read (convex/closeoutSources.ts); the caller checks access.
 */
export async function loadEventLabor(
  ctx: { db: any },
  tenantId: string,
  eventId: string,
): Promise<EventLaborSummary & { records: Doc<"timeRecords">[] }> {
  // Only this event's shifts and time: records on the event directly, and
  // records on one of its shifts that name no event.
  const [people, directRecords, shifts] = await Promise.all([
    tenantPeople(ctx, tenantId),
    eventRows(ctx, "timeRecords", tenantId, eventId),
    eventRows(ctx, "shifts", tenantId, eventId),
  ]);
  const viaShiftRecords = (
    await Promise.all(
      shifts.map(
        (shift) =>
          ctx.db
            .query("timeRecords")
            .withIndex("by_shiftId", (q: any) => q.eq("shiftId", shift._id))
            .collect() as Promise<Doc<"timeRecords">[]>,
      ),
    )
  )
    .flat()
    .filter((record) => record.tenantId === tenantId);
  const records = [
    ...new Map(
      [...directRecords, ...viaShiftRecords].map((record) => [
        String(record._id),
        record,
      ]),
    ).values(),
  ].sort((a, b) => a._creationTime - b._creationTime);
  const shiftEventById = new Map(
    shifts.map((shift) => [String(shift._id), String(shift.eventId ?? "")]),
  );
  const matching = records.filter((record) => {
    const direct = String(record.eventId ?? "");
    if (direct) return direct === eventId;
    const viaShift = record.shiftId
      ? shiftEventById.get(String(record.shiftId))
      : undefined;
    return viaShift === eventId;
  });

  // Scheduled-labor forecast: committed shifts × person rates. This is the
  // pre-event labor picture (the worksheet's "Scheduled Cost") — clocked
  // time replaces it as reality once people punch in.
  // Same rule as src/features/finance/laborCost (AC-510).
  const labor = plannedVsActualLabor({
    eventId,
    shifts,
    records: matching,
    people: new Map(
      [...people.entries()].map(([id, person]) => [
        id,
        { name: personName(person, id), hourlyRate: person.hourlyRate },
      ]),
    ),
  });

  return {
    ...summarize(matching, people),
    scheduledMinutes: labor.plannedMinutes,
    scheduledCost: labor.plannedCost,
    scheduledShiftCount: labor.plannedShiftCount,
    unpricedScheduledMinutes: labor.unpricedPlannedMinutes,
    varianceCost: labor.varianceCost,
    records: matching.filter((record) => workedMinutes(record) != null),
  };
}

/**
 * Clocked minutes + estimated pay for one person over an exact window, plus
 * how many existing non-voided payroll inputs already overlap it (duplicate
 * warning, not a block).
 */
export const personPeriodLaborSummary = query({
  args: {
    personId: v.id("people"),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | (LaborSummary & {
        hourlyRate: number | null;
        overlappingInputCount: number;
        approvedMinutes: number;
        approvedOvertimeMinutes: number;
        approvedCount: number;
        waitingApprovalCount: number;
        approvedTimeRecordIds: string[];
      })
    | null
  > => {
    const auth = await getAuthContext(ctx);
    if (!canReadRates(auth.role)) return null;
    const personId = String(args.personId);
    // The period's time, from eight days before it (the weekly overtime
    // count reaches back to the start of its first week), and this person's
    // payroll inputs only.
    const [people, records, inputs] = await Promise.all([
      tenantPeople(ctx, auth.tenantId),
      tenantTimeRecordsClockedIn(
        ctx,
        auth.tenantId,
        args.periodStart - 8 * 24 * 60 * 60_000,
        args.periodEnd,
      ),
      (
        ctx.db
          .query("payrollInputs")
          .withIndex("by_personId", (q: any) => q.eq("personId", args.personId))
          .collect() as Promise<Doc<"payrollInputs">[]>
      ).then((rows) => rows.filter((row) => row.tenantId === auth.tenantId)),
    ]);
    const matching = records.filter(
      (record) =>
        String(record.personId) === personId &&
        record.clockInAt != null &&
        record.clockOutAt != null &&
        record.clockInAt >= args.periodStart &&
        record.clockOutAt <= args.periodEnd,
    );
    const summary = summarize(matching, people);
    const rate = people.get(personId)?.hourlyRate;
    const overlappingInputCount = inputs.filter(
      (input) =>
        input.deletedAt == null &&
        String(input.personId) === personId &&
        String(input.status) !== "voided" &&
        input.periodStart <= args.periodEnd &&
        input.periodEnd >= args.periodStart,
    ).length;
    const approved = approvedPayroll(
      records,
      personId,
      args.periodStart,
      args.periodEnd,
    );
    return {
      ...summary,
      hourlyRate:
        typeof rate === "number" && Number.isFinite(rate) ? rate : null,
      overlappingInputCount,
      approvedMinutes: approved.approvedMinutes,
      approvedOvertimeMinutes: approved.overtimeMinutes,
      approvedCount: approved.approvedCount,
      approvedTimeRecordIds: approved.approvedIds,
      waitingApprovalCount: approved.waitingApprovalCount,
    };
  },
});

/** Raw pay rates for management surfaces (admin team panel, payroll). */
export const listPayRates = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<Array<{ personId: string; hourlyRate: number | null }> | null> => {
    const auth = await getAuthContext(ctx);
    if (!canReadRates(auth.role)) return null;
    const people = await tenantPeople(ctx, auth.tenantId);
    return [...people.values()]
      .filter((person) => person.deletedAt == null)
      .map((person) => ({
        personId: String(person._id),
        hourlyRate:
          typeof person.hourlyRate === "number" &&
          Number.isFinite(person.hourlyRate)
            ? person.hourlyRate
            : null,
      }));
  },
});

/**
 * Sanitized confirmed time records for payroll export preview — finance
 * managers lack workforceAccess, so the generated listTimeRecord returns []
 * for them and the export's "Recorded" column silently read 0.
 */
export const payrollTimeRecords = query({
  args: {
    // [from, to) clock-in windows: the export period and each listed input's
    // period. Every record that clocked in inside one is returned, however
    // old, and nothing else.
    ranges: v.array(v.object({ from: v.number(), to: v.number() })),
  },
  handler: async (
    ctx,
    { ranges },
  ): Promise<Array<{
    personId: string;
    clockInAt: number;
    clockOutAt: number;
    breakMinutes: number;
    status: string;
    approvedAt: number | null;
  }> | null> => {
    const auth = await getAuthContext(ctx);
    if (!canReadRates(auth.role)) return null;
    // Only the clock-ins inside the asked pay periods, read by clock-in time.
    const byId = new Map<string, Doc<"timeRecords">>();
    for (const { from, to } of ranges.slice(0, PAYROLL_RANGE_CAP)) {
      if (!(to > from)) continue;
      for (const row of (await ctx.db
        .query("timeRecords")
        .withIndex("by_tenantId_and_clockInAt", (q: any) =>
          q
            .eq("tenantId", auth.tenantId)
            .gte("clockInAt", from)
            .lt("clockInAt", to),
        )
        .collect()) as Doc<"timeRecords">[])
        byId.set(String(row._id), row);
    }
    const records = [...byId.values()].sort(
      (a, b) => Number(a.clockInAt) - Number(b.clockInAt),
    );
    return records
      .filter(
        (record) =>
          record.deletedAt == null &&
          CONFIRMED_TIME_STATUSES.has(String(record.status)) &&
          record.clockInAt != null &&
          record.clockOutAt != null,
      )
      .map((record) => ({
        personId: String(record.personId),
        clockInAt: record.clockInAt!,
        clockOutAt: record.clockOutAt!,
        breakMinutes: Number(record.breakMinutes ?? 0),
        status: String(record.status),
        approvedAt: record.approvedAt ?? null,
      }));
  },
});
