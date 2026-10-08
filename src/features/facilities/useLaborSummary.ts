// Seam hooks for the authored convex/laborSummary.ts queries. They live in
// facilities (unguarded seam-hook home, like driverAssignment/
// equipmentCheckout) because the event/workforce/commercial feature guards
// forbid direct convex/react usage in their own directories.
//
// All hooks resolve to `null` when the caller's role lacks access — callers
// distinguish "loading" (undefined) from "not allowed" (null).
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import type { AttendanceAlert, OvertimeWarning } from "../workforce/timePay";

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
  unpricedScheduledMinutes: number;
  varianceCost: number;
};

export type PersonPeriodLaborSummary = LaborSummaryBase & {
  hourlyRate: number | null;
  overlappingInputCount: number;
  /** Approved time only (payroll): paid minutes, split at the weekly limit. */
  approvedMinutes: number;
  approvedOvertimeMinutes: number;
  approvedCount: number;
  /** The approved entries in the total; the payroll input names them. */
  approvedTimeRecordIds: string[];
  waitingApprovalCount: number;
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

/**
 * Sanitized confirmed time records for the payroll screen: those that
 * clocked in inside the given [from, to) pay periods. "skip" while unknown.
 */
export function usePayrollTimeRecords(
  ranges: Array<{ from: number; to: number }> | "skip",
):
  | Array<{
      personId: string;
      clockInAt: number;
      clockOutAt: number;
      breakMinutes: number;
      status: string;
      approvedAt: number | null;
    }>
  | null
  | undefined {
  return useQuery(
    api.laborSummary.payrollTimeRecords,
    ranges === "skip" ? "skip" : { ranges },
  );
}

export type AttendanceAlertsView = {
  alerts: Array<AttendanceAlert & { personName: string }>;
  overtime: Array<OvertimeWarning & { personName: string }>;
};

/** Late / not-in / no-show / still-in alerts and weeks past 40 h. */
export function useAttendanceAlerts(
  now: number,
): AttendanceAlertsView | null | undefined {
  return useQuery(api.laborSummary.attendanceAlerts, { now });
}
