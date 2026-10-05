import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { EventMonthRows } from "../../convex/eventMonthRows";
import { api } from "./api";

const EMPTY: EventMonthRows = {
  packLists: [],
  reviewFlags: [],
  vehicleAssignments: [],
  numberAssignments: [],
};

/**
 * Pack lists, open questions, trucks and event numbers of these events
 * (PL-SCALE), never the company's whole lists. `undefined` while the ids or
 * the rows are loading. Event features must not import convex/react.
 */
export function useEventMonthRows(
  eventIds: ReadonlyArray<string> | undefined,
): EventMonthRows | undefined {
  const key =
    eventIds === undefined
      ? undefined
      : [...new Set(eventIds)].sort().join(",");
  const ids = useMemo(
    () => (key === undefined ? undefined : key ? key.split(",") : []),
    [key],
  );
  const rows = useQuery(
    api.eventMonthRows.forEvents,
    ids === undefined || ids.length === 0 ? "skip" : { eventIds: ids },
  );
  if (ids === undefined) return undefined;
  if (ids.length === 0) return EMPTY;
  if (rows === undefined) return undefined;
  return rows ?? EMPTY;
}
