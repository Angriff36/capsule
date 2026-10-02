// Seam hook for convex/eventLookup.ts (PL-SCALE). Lives in facilities (the
// unguarded seam-hook home) because the feature guards forbid convex/react in
// their own directories. Screens that only need an event's name, date or
// stage for rows they already hold use this instead of useListEvent, which
// loads every event with its whole menu tree.
import { useEffect, useMemo } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../lib/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { EventLookupRow } from "../../../convex/eventLookup";

export type { EventLookupRow };

/** One server read takes 1000 ids (convex/eventLookup.ts LOOKUP_CAP). */
const ID_CHUNK = 1000;

/**
 * The events with these ids (duplicates and blanks ignored; put the ids the
 * screen shows first). Read in pieces of 1000, up to 5000 ids, so a busy
 * report is not cut off without a word (#430). `undefined` while the ids or
 * the events are loading; `[]` when the caller may not read events.
 */
export function useEventsById(
  ids: ReadonlyArray<string | null | undefined> | undefined,
): EventLookupRow[] | undefined {
  const chunks = useMemo(() => {
    if (!ids) return undefined;
    const key = [...new Set(ids.filter((id): id is string => !!id))];
    return [0, 1, 2, 3, 4].map((n) =>
      key.slice(n * ID_CHUNK, (n + 1) * ID_CHUNK),
    );
  }, [ids]);
  const read = (n: number) =>
    chunks === undefined || chunks[n]!.length === 0
      ? "skip"
      : { ids: chunks[n]! };
  const parts = [
    useQuery(api.eventLookup.byIds, read(0)),
    useQuery(api.eventLookup.byIds, read(1)),
    useQuery(api.eventLookup.byIds, read(2)),
    useQuery(api.eventLookup.byIds, read(3)),
    useQuery(api.eventLookup.byIds, read(4)),
  ];
  if (chunks === undefined) return undefined;
  const rows: EventLookupRow[] = [];
  for (let n = 0; n < parts.length; n++) {
    if (chunks[n]!.length === 0) continue;
    const part = parts[n];
    if (part === undefined) return undefined;
    rows.push(...(part ?? []));
  }
  return rows;
}

/**
 * Whole event records with these ids (convex/eventLookup.ts `docsByIds`, at
 * most 1000), for a screen that adds older linked events to a window of
 * whole records. `undefined` while loading; `[]` for no ids or no access.
 */
export function useEventRecordsById(
  ids: readonly string[] | undefined,
): Doc<"events">[] | undefined {
  const rows = useQuery(
    api.eventLookup.docsByIds,
    ids === undefined || ids.length === 0 ? "skip" : { ids: [...ids] },
  );
  if (ids === undefined) return undefined;
  if (ids.length === 0) return [];
  if (rows === undefined) return undefined;
  return rows ?? [];
}

/**
 * Live events that start in [from, to), oldest first (convex/eventLookup.ts
 * `range`, at most 3000). Pass "skip" while the window is unknown.
 * `undefined` while loading; `[]` when the caller may not read events.
 */
export function useEventsInRange(
  window: { from: number; to: number; withUndated?: boolean } | "skip",
): EventLookupRow[] | undefined {
  const result = useQuery(api.eventLookup.range, window);
  if (result === undefined) return undefined;
  return result?.rows ?? [];
}

/**
 * Whole event records (less the import draft and contact fields) that start
 * in [from, to), for screens that read planning fields (convex/eventLookup.ts
 * `rangeDocs`, at most 3000). Same loading/empty rules as useEventsInRange.
 */
export function useEventRecordsInRange(
  window: { from: number; to: number; withUndated?: boolean } | "skip",
): Doc<"events">[] | undefined {
  const result = useQuery(api.eventLookup.rangeDocs, window);
  if (result === undefined) return undefined;
  return result?.rows ?? [];
}

/** One client's live events, light rows (at most 2000). */
export function useClientEvents(
  clientId: string | null | undefined,
): EventLookupRow[] | undefined {
  const rows = useQuery(
    api.eventLookup.byClient,
    clientId ? { clientId } : "skip",
  );
  if (!clientId) return [];
  if (rows === undefined) return undefined;
  return rows ?? [];
}

const REPORT_PAGE = 500;

/**
 * Every live event of the company in light rows, read 500 at a time
 * (convex/eventLookup.ts `reportPage`). For all-time reports only.
 * `undefined` until the last page has arrived, so totals never show a
 * part-count.
 */
export function useAllEventReportRows(): EventLookupRow[] | undefined {
  const { results, status, loadMore } = usePaginatedQuery(
    api.eventLookup.reportPage,
    {},
    { initialNumItems: REPORT_PAGE },
  );
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(REPORT_PAGE);
  }, [status, loadMore]);
  return useMemo(
    () =>
      status === "Exhausted"
        ? results.filter((row) => row.deletedAt == null)
        : undefined,
    [results, status],
  );
}

const DAY = 86_400_000;

/**
 * Events a picker offers: from half a year back to two years ahead, plus
 * events with no date yet. Older events stay reachable from their own page.
 * The window moves once a day, not on every render.
 */
export function usePickerEvents(): EventLookupRow[] | undefined {
  const today = Math.floor(Date.now() / DAY) * DAY;
  return useEventsInRange({
    from: today - 183 * DAY,
    to: today + 731 * DAY,
    withUndated: true,
  });
}
