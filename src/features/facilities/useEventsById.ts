// Seam hook for convex/eventLookup.ts (PL-SCALE). Lives in facilities (the
// unguarded seam-hook home) because the feature guards forbid convex/react in
// their own directories. Screens that only need an event's name, date or
// stage for rows they already hold use this instead of useListEvent, which
// loads every event with its whole menu tree.
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import type { EventLookupRow } from "../../../convex/eventLookup";

export type { EventLookupRow };

/**
 * The events with these ids (duplicates and blanks ignored; put the ids the
 * screen shows first, the server reads at most 1000). `undefined` while the
 * ids or the events are loading; `[]` when the caller may not read events.
 */
export function useEventsById(
  ids: ReadonlyArray<string | null | undefined> | undefined,
): EventLookupRow[] | undefined {
  const key = useMemo(
    () =>
      ids ? [...new Set(ids.filter((id): id is string => !!id))] : undefined,
    [ids],
  );
  const rows = useQuery(
    api.eventLookup.byIds,
    key === undefined ? "skip" : { ids: key },
  );
  if (key === undefined || rows === undefined) return undefined;
  return rows ?? [];
}
