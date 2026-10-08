import { useMemo } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api, type Doc, type Id } from "./api";

// Staff screens read only the rows they show (convex/workforceWindow.ts and
// the generated per-person indexes), never the company's whole tables.
// Workforce features must not import convex/react; call these.

type PersonId = string | null | undefined;
const person = (personId: string) => personId as Id<"people">;

/** Sorted unique ids, stable while the set is the same. */
function useIdList(
  ids: ReadonlyArray<string | null | undefined> | undefined,
): string[] | undefined {
  const key =
    ids === undefined
      ? undefined
      : [...new Set(ids.filter((id): id is string => !!id))].sort().join(",");
  return useMemo(
    () => (key === undefined ? undefined : key ? key.split(",") : []),
    [key],
  );
}

/** One person's started shifts and scheduled ones ending at or after `from`. */
export function usePersonOpenShifts(personId: PersonId, from: number) {
  return useQuery(
    api.workforceWindow.personOpenShifts,
    personId ? { personId: person(personId), from } : "skip",
  );
}

/**
 * One person's time entries that can fall in a period starting at `from`;
 * `from: "all"` reads every one of their entries.
 */
export function usePersonTimeRecords(personId: PersonId, from: number | "all") {
  const since = useQuery(
    api.workforceWindow.personTimeRecordsSince,
    personId && from !== "all" ? { personId: person(personId), from } : "skip",
  );
  const all = useQuery(
    api.queries.listTimeRecordByPersonId,
    personId && from === "all" ? { personId: person(personId) } : "skip",
  );
  return from === "all" ? all : since;
}

/** One person's schedule notices for weeks ending at or after `from`. */
export function usePersonScheduleNotices(personId: PersonId, from: number) {
  return useQuery(
    api.workforceWindow.personScheduleNotices,
    personId ? { personId: person(personId), from } : "skip",
  );
}

/** One person's active availability windows. */
export function usePersonActiveWindows(personId: PersonId) {
  return useQuery(
    api.workforceWindow.personActiveWindows,
    personId ? { personId: person(personId) } : "skip",
  );
}

export function usePersonRecurringAvailability(personId: PersonId) {
  return useQuery(
    api.queries.listRecurringAvailabilityByPersonId,
    personId ? { personId: person(personId) } : "skip",
  );
}

export function usePersonTimeOffRequests(personId: PersonId) {
  return useQuery(
    api.queries.listTimeOffRequestByPersonId,
    personId ? { personId: person(personId) } : "skip",
  );
}

/** Swaps this person asked for, any state. */
export function usePersonSwapRequestsSent(personId: PersonId) {
  return useQuery(
    api.queries.listShiftSwapRequestByRequesterPersonId,
    personId ? { requesterPersonId: person(personId) } : "skip",
  );
}

/** Swaps waiting for this person's answer. */
export function usePersonSwapRequestsToAnswer(personId: PersonId) {
  return useQuery(
    api.queries.listShiftSwapRequestByRecipientPersonIdAndStatus,
    personId
      ? { recipientPersonId: person(personId), status: "pending_recipient" }
      : "skip",
  );
}

/** A driver's scheduled and on-the-road deliveries, and drops since `since`. */
export function useDriverDeliveries(personId: PersonId, since: number) {
  return useQuery(
    api.workforceWindow.driverDeliveries,
    personId ? { driverId: person(personId), since } : "skip",
  );
}

/** Draft closeouts and ones finalized or captured since `since`. */
export function useFieldCloseouts(since: number) {
  return useQuery(api.workforceWindow.fieldCloseouts, { since });
}

/**
 * My Day prep: this person's open tasks and unclaimed ones at `eventIds`, due
 * by `dueBy`, with their events' tasks and the links behind them.
 */
export function useMyDayPrep(
  personId: PersonId,
  eventIds: readonly string[] | undefined,
  dueBy: number,
) {
  const ids = useIdList(eventIds);
  return useQuery(
    api.workforceWindow.myDayPrep,
    personId && ids ? { personId, eventIds: ids, dueBy } : "skip",
  );
}

/** The company's time-off requests in one state (generated status index). */
export function useTimeOffRequestsWithStatus(
  tenantId: string | null | undefined,
  status: "pending" | "approved",
) {
  return useQuery(
    api.queries.listTimeOffRequestByTenantIdAndStatus,
    tenantId ? { tenantId, status } : "skip",
  );
}

/** The company's swap requests in one state (generated status index). */
export function useSwapRequestsWithStatus(
  tenantId: string | null | undefined,
  status: "awaiting_manager",
) {
  return useQuery(
    api.queries.listShiftSwapRequestByTenantIdAndStatus,
    tenantId ? { tenantId, status } : "skip",
  );
}

/**
 * Shifts that overlap [from, to) (no `to`: from `from` on). Pass "skip"
 * while the window is unknown.
 */
export function useShiftsInWindow(
  window: { from: number; to?: number } | "skip",
): Doc<"shifts">[] | undefined {
  return useQuery(api.workforceWindow.shifts, window);
}

/** These shifts by id. `[]` for no ids; `undefined` while loading. */
export function useShiftsByIds(
  ids: ReadonlyArray<string | null | undefined> | undefined,
): Doc<"shifts">[] | undefined {
  const list = useIdList(ids);
  const rows = useQuery(
    api.workforceWindow.shiftsByIds,
    list === undefined || list.length === 0 ? "skip" : { ids: list },
  );
  if (list === undefined) return undefined;
  if (list.length === 0) return [];
  return rows;
}

/** These shifts and every shift overlapping one of them. */
export function useShiftsAround(
  ids: ReadonlyArray<string | null | undefined> | undefined,
): Doc<"shifts">[] | undefined {
  const list = useIdList(ids);
  const rows = useQuery(
    api.workforceWindow.shiftsAround,
    list === undefined || list.length === 0 ? "skip" : { ids: list },
  );
  if (list === undefined) return undefined;
  if (list.length === 0) return [];
  return rows;
}

/** These people's training completions. */
export function useTrainingCompletionsFor(
  personIds: ReadonlyArray<string | null | undefined> | undefined,
) {
  const list = useIdList(personIds);
  const rows = useQuery(
    api.workforceWindow.trainingCompletionsFor,
    list === undefined || list.length === 0 ? "skip" : { personIds: list },
  );
  if (list === undefined) return undefined;
  if (list.length === 0) return [];
  return rows;
}

/** Time entries wholly inside [from, to). */
export function useTimeRecordsIn(
  window: { from: number; to: number } | "skip",
) {
  return useQuery(api.workforceWindow.timeRecordsIn, window);
}

/** Availability windows that overlap [from, to). */
export function useAvailabilityWindowsInWindow(window: {
  from: number;
  to: number;
}) {
  return useQuery(api.workforceWindow.availabilityWindows, window);
}

/** Assignments (only `personId`'s, when given) and staffing needs of these events. */
export function useStaffForEvents(
  eventIds: ReadonlyArray<string | null | undefined> | undefined,
  personId?: string,
) {
  const ids = useIdList(eventIds);
  const rows = useQuery(
    api.workforceWindow.forEvents,
    ids === undefined || ids.length === 0
      ? "skip"
      : personId
        ? { eventIds: ids, personId }
        : { eventIds: ids },
  );
  if (ids === undefined) return undefined;
  if (ids.length === 0) return { assignments: [], staffNeeds: [] };
  return rows;
}

/** Pack lists of these events and their lines. */
export function usePackForEvents(eventIds: readonly string[] | undefined) {
  const ids = useIdList(eventIds);
  const rows = useQuery(
    api.workforceWindow.packForEvents,
    ids === undefined || ids.length === 0 ? "skip" : { eventIds: ids },
  );
  if (ids === undefined) return undefined;
  if (ids.length === 0) return { packLists: [], packLines: [] };
  return rows;
}

/** Approved time off overlapping [from, to); "skip" while unknown. */
export function useApprovedTimeOff(
  window: { from: number; to: number } | "skip",
) {
  return useQuery(api.workforceWindow.approvedTimeOff, window);
}

/** The newest `limit` approved and `limit` denied time-off requests. */
export function useReviewedTimeOff(limit: number) {
  return useQuery(api.workforceWindow.reviewedTimeOff, { limit });
}

/** These people's schedule notices for the week starting `weekStartsAt`. */
export function useWeekNotices(
  personIds: readonly string[] | undefined,
  weekStartsAt: number,
) {
  const ids = useIdList(personIds);
  const rows = useQuery(
    api.workforceWindow.weekNotices,
    ids === undefined || ids.length === 0
      ? "skip"
      : { personIds: ids, weekStartsAt },
  );
  if (ids === undefined) return undefined;
  if (ids.length === 0) return [];
  return rows;
}

/** One person's training completions; "skip" without an id. */
export function usePersonTrainingCompletions(personId: PersonId) {
  return useQuery(
    api.queries.listTrainingCompletionByPersonId,
    personId ? { personId: person(personId) } : "skip",
  );
}

/** Rows per "Load more". */
export const HISTORY_PAGE = 50;

/** The time sheet, newest first; `loadMore` adds the next page. */
export function useTimeRecordPages() {
  return usePaginatedQuery(
    api.workforceWindow.timeRecordPage,
    {},
    { initialNumItems: HISTORY_PAGE },
  );
}

export function useAvailabilityWindowPages() {
  return usePaginatedQuery(
    api.workforceWindow.availabilityWindowPage,
    {},
    { initialNumItems: HISTORY_PAGE },
  );
}

export function useSwapRequestPages() {
  return usePaginatedQuery(
    api.workforceWindow.swapRequestPage,
    {},
    { initialNumItems: HISTORY_PAGE },
  );
}
