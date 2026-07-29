// Seam hooks for the authored convex/laborSummary.ts queries. They live in
// facilities (unguarded seam-hook home, like driverAssignment/
// equipmentCheckout) because the event/workforce/commercial feature guards
// forbid direct convex/react usage in their own directories.
//
// All hooks resolve to `null` when the caller's role lacks access — callers
// distinguish "loading" (undefined) from "not allowed" (null).
import { useQuery } from "convex/react";
import { api } from "../../lib/api";

type LaborSummaryBase = {
  cost: number;
  totalMinutes: number;
  unpricedMinutes: number;
  recordCount: number;
  peopleMissingRates: string[];
};

export type EventLaborSummary = LaborSummaryBase & {
  /** Forecast from scheduled shifts × rates (pre-event labor picture). */
  scheduledMinutes: number;
  scheduledCost: number;
  scheduledShiftCount: number;
};

export type PersonPeriodLaborSummary = LaborSummaryBase & {
  hourlyRate: number | null;
  overlappingInputCount: number;
};

/** Live clocked-hours labor for one event. */
export function useEventLaborSummary(
  eventId: string | null,
): EventLaborSummary | null | undefined {
  return useQuery(
    api.laborSummary.eventLaborSummary,
    eventId ? { eventId: eventId as never } : "skip",
  );
}

/** Clocked minutes + estimated pay for a person over an exact window. */
export function usePersonPeriodLaborSummary(
  args: { personId: string; periodStart: number; periodEnd: number } | null,
): PersonPeriodLaborSummary | null | undefined {
  return useQuery(
    api.laborSummary.personPeriodLaborSummary,
    args
      ? {
          personId: args.personId as never,
          periodStart: args.periodStart,
          periodEnd: args.periodEnd,
        }
      : "skip",
  );
}

/** Raw pay rates for management surfaces (workforce/finance managers). */
export function usePayRates():
  Array<{ personId: string; hourlyRate: number | null }> | null | undefined {
  return useQuery(api.laborSummary.listPayRates, {});
}

/** Sanitized confirmed time records for the payroll export preview. */
export function usePayrollTimeRecords():
  | Array<{
      personId: string;
      clockInAt: number;
      clockOutAt: number;
      breakMinutes: number;
      status: string;
    }>
  | null
  | undefined {
  return useQuery(api.laborSummary.payrollTimeRecords, {});
}
