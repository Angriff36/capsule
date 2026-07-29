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

/** Mirrors financeManageAccess | workforceManageAccess (+ admin tier). */
function canReadRates(role: string): boolean {
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
function canReadLaborAggregates(role: string): boolean {
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

async function tenantTimeRecords(
  ctx: { db: any },
  tenantId: string,
): Promise<Doc<"timeRecords">[]> {
  return await ctx.db
    .query("timeRecords")
    .withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId))
    .collect();
}

const SCHEDULED_SHIFT_STATUSES = new Set(["scheduled", "started", "completed"]);

/** Aggregate labor for one event (direct eventId or via the record's shift). */
export const eventLaborSummary = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<EventLaborSummary | null> => {
    const auth = await getAuthContext(ctx);
    if (!canReadLaborAggregates(auth.role)) return null;
    const eventId = String(args.eventId);
    const [people, records, shifts] = await Promise.all([
      tenantPeople(ctx, auth.tenantId),
      tenantTimeRecords(ctx, auth.tenantId),
      ctx.db
        .query("shifts")
        .withIndex("by_tenantId", (q: any) => q.eq("tenantId", auth.tenantId))
        .collect() as Promise<Doc<"shifts">[]>,
    ]);
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
    let scheduledMinutes = 0;
    let scheduledCost = 0;
    let scheduledShiftCount = 0;
    for (const shift of shifts) {
      if (
        shift.deletedAt != null ||
        String(shift.eventId ?? "") !== eventId ||
        !SCHEDULED_SHIFT_STATUSES.has(String(shift.status)) ||
        shift.startsAt == null ||
        shift.endsAt == null ||
        shift.endsAt <= shift.startsAt
      ) {
        continue;
      }
      const minutes = (shift.endsAt - shift.startsAt) / 60_000;
      scheduledMinutes += minutes;
      scheduledShiftCount += 1;
      const rate = people.get(String(shift.personId))?.hourlyRate;
      if (typeof rate === "number" && Number.isFinite(rate) && rate >= 0) {
        scheduledCost += (minutes / 60) * rate;
      }
    }

    return {
      ...summarize(matching, people),
      scheduledMinutes: Math.round(scheduledMinutes),
      scheduledCost: Math.round((scheduledCost + Number.EPSILON) * 100) / 100,
      scheduledShiftCount,
    };
  },
});

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
      })
    | null
  > => {
    const auth = await getAuthContext(ctx);
    if (!canReadRates(auth.role)) return null;
    const personId = String(args.personId);
    const [people, records, inputs] = await Promise.all([
      tenantPeople(ctx, auth.tenantId),
      tenantTimeRecords(ctx, auth.tenantId),
      ctx.db
        .query("payrollInputs")
        .withIndex("by_tenantId", (q: any) => q.eq("tenantId", auth.tenantId))
        .collect() as Promise<Doc<"payrollInputs">[]>,
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
    return {
      ...summary,
      hourlyRate:
        typeof rate === "number" && Number.isFinite(rate) ? rate : null,
      overlappingInputCount,
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
  args: {},
  handler: async (
    ctx,
  ): Promise<Array<{
    personId: string;
    clockInAt: number;
    clockOutAt: number;
    breakMinutes: number;
    status: string;
  }> | null> => {
    const auth = await getAuthContext(ctx);
    if (!canReadRates(auth.role)) return null;
    const records = await tenantTimeRecords(ctx, auth.tenantId);
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
      }));
  },
});
