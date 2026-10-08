import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "./api";

// Reads for event, planning and kitchen screens of only the rows they show
// (convex/historyWindow.ts), instead of the generated whole-company lists.
// `undefined` while loading.

const idKey = (ids: ReadonlyArray<string | null | undefined> | undefined) =>
  ids === undefined
    ? undefined
    : [...new Set(ids.filter((id): id is string => !!id))].sort().join(",");

/**
 * Approved time off and availability windows of these people that overlap
 * the window. "skip" while either is unknown.
 */
export function useAwayForPeople(
  personIds: ReadonlyArray<string | null | undefined> | undefined,
  window: { from: number; to: number } | "skip",
) {
  const key = idKey(personIds);
  const ids = useMemo(() => (key ? key.split(",") : []), [key]);
  const rows = useQuery(
    api.historyWindow.awayForPeople,
    key === undefined || window === "skip" || ids.length === 0
      ? "skip"
      : { personIds: ids, from: window.from, to: window.to },
  );
  if (key === undefined || window === "skip") return undefined;
  if (ids.length === 0) return { timeOff: [], availability: [] };
  return rows;
}

/** Live events carrying this event number; [] without one. */
export function useEventsByNumber(eventNumber: string | undefined) {
  const rows = useQuery(
    api.historyWindow.eventsByNumber,
    eventNumber ? { eventNumber } : "skip",
  );
  return eventNumber ? rows : [];
}

/** The proposals and TPP vendor orders numbered for this BEO number. */
export function useImportNumberRecords(number: string | null) {
  return useQuery(
    api.historyWindow.importNumberRecords,
    number === null ? "skip" : { number },
  );
}

/** These prep steps (dish tasks) and the steps they come after. */
export function useDishTasksByIds(
  ids: ReadonlyArray<string | null | undefined> | undefined,
) {
  const key = idKey(ids);
  const list = useMemo(() => (key ? key.split(",") : []), [key]);
  const rows = useQuery(
    api.historyWindow.dishTasksByIds,
    key === undefined || list.length === 0 ? "skip" : { ids: list },
  );
  if (key === undefined) return undefined;
  if (list.length === 0) return [];
  return rows;
}
