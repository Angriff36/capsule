// Seam hooks for convex/inventoryWindow.ts and the indexed generated supply
// lists. Lives in facilities (the unguarded seam-hook home) because the
// inventory guard forbids convex/react in its own directory. Supply screens
// use these instead of the whole-table useList* hooks, which load every row
// the company ever had and ran out of time on the live server.
import { useEffect, useMemo } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api, type Id } from "../../lib/api";

/** Rows per page of a supply ledger; "Load more" adds another page. */
export const SUPPLY_PAGE = 50;

/** A paginated read as rows (`undefined` until the first page) + load more. */
function pages<T>(read: {
  results: T[];
  status: string;
  loadMore: (n: number) => void;
}) {
  return {
    rows: read.status === "LoadingFirstPage" ? undefined : read.results,
    canLoadMore: read.status === "CanLoadMore",
    loadMore: () => read.loadMore(SUPPLY_PAGE),
  };
}

/** Sorted, de-duplicated id list as one stable key. */
function idKey(ids: ReadonlyArray<string | null | undefined> | undefined) {
  return ids === undefined
    ? undefined
    : [...new Set(ids.filter((id): id is string => !!id))].sort().join(",");
}
const fromKey = (key: string) => (key ? key.split(",") : []);

/** The ingredient demands and purchase needs of these events. */
export function useDemandsForEvents(
  eventIds: ReadonlyArray<string | null | undefined> | undefined,
) {
  const key = idKey(eventIds);
  const args = useMemo(
    () => (key === undefined ? "skip" : { eventIds: fromKey(key) }),
    [key],
  );
  return useQuery(api.inventoryWindow.demandsForEvents, args);
}

/** Committed demand history of these dishes, with their events' head counts. */
export function useDemandHistory(
  dishIds: ReadonlyArray<string | null | undefined> | undefined,
) {
  const key = idKey(dishIds);
  const args = useMemo(
    () => (key === undefined ? "skip" : { dishIds: fromKey(key) }),
    [key],
  );
  return useQuery(api.inventoryWindow.demandHistory, args);
}

/** Ingredient demand of the events in these windows; "skip" reads nothing. */
export function useDemandInWindows(
  windows: ReadonlyArray<{ from: number; to: number }> | "skip",
) {
  const key =
    windows === "skip"
      ? null
      : windows.map((w) => `${w.from}:${w.to}`).join(",");
  const args = useMemo(
    () =>
      key === null
        ? "skip"
        : {
            windows: fromKey(key).map((part) => {
              const [from, to] = part.split(":").map(Number);
              return { from: from!, to: to! };
            }),
          },
    [key],
  );
  return useQuery(api.inventoryWindow.demandInWindows, args);
}

/** Purchase needs, newest first (one event's when given), 50 at a time. */
export function useNeedPages(eventId: string | null | undefined) {
  return pages(
    usePaginatedQuery(
      api.inventoryWindow.needPage,
      eventId ? { eventId } : {},
      { initialNumItems: SUPPLY_PAGE },
    ),
  );
}

/** Vendor orders with their lines, newest first, 50 at a time. */
export function useOrderPages() {
  return pages(
    usePaginatedQuery(
      api.inventoryWindow.orderPage,
      {},
      {
        initialNumItems: SUPPLY_PAGE,
      },
    ),
  );
}

/** The order lines, links and orders that fill these demands. */
export function useLinesForDemands(
  demandIds: ReadonlyArray<string | null | undefined> | undefined,
) {
  const key = idKey(demandIds);
  const args = useMemo(
    () => (key === undefined ? "skip" : { demandIds: fromKey(key) }),
    [key],
  );
  return useQuery(api.inventoryWindow.linesForDemands, args);
}

/** Orders already sent and the needs they were sent for. */
export function useSentOrderNeeds() {
  return useQuery(api.inventoryWindow.sentOrderNeeds, {});
}

/** What vendor scores count since `from` (moves once a day). */
export function useVendorScoreInputs(windowMs: number) {
  const today = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  return useQuery(api.inventoryWindow.vendorScoreInputs, {
    from: today - windowMs,
  });
}

/** Stock reservations, newest first, 50 at a time. */
export function useReservationPages() {
  return pages(
    usePaginatedQuery(
      api.inventoryWindow.reservationPage,
      {},
      {
        initialNumItems: SUPPLY_PAGE,
      },
    ),
  );
}

/** Stock transfers, newest first, 50 at a time. */
export function useTransferPages() {
  return pages(
    usePaginatedQuery(
      api.inventoryWindow.transferPage,
      {},
      {
        initialNumItems: SUPPLY_PAGE,
      },
    ),
  );
}

/** Supplier lots of one ingredient; `undefined` while loading or unknown. */
export function useLotsForIngredient(ingredientId: string | null | undefined) {
  return useQuery(
    api.queries.listInventoryLotByIngredientId,
    ingredientId ? { ingredientId: ingredientId as Id<"ingredients"> } : "skip",
  );
}

/** A recall trace by lot number and/or received dates; "skip" reads nothing. */
export function useLotTrace(
  search:
    | {
        lotNumber: string;
        receivedFrom: number | null;
        receivedTo: number | null;
      }
    | "skip",
) {
  return useQuery(api.inventoryWindow.traceLots, search);
}

/** Count sheets, newest first, 50 at a time. */
export function useCountSessionPages() {
  return pages(
    usePaginatedQuery(
      api.inventoryWindow.countSessionPage,
      {},
      {
        initialNumItems: SUPPLY_PAGE,
      },
    ),
  );
}

/** One count sheet's lines; `undefined` while loading or unknown. */
export function useCountLinesFor(sessionId: string | null | undefined) {
  return useQuery(
    api.queries.listStockCountLineByStockCountSessionId,
    sessionId
      ? { stockCountSessionId: sessionId as Id<"stockCountSessions"> }
      : "skip",
  );
}

/** Reconciled line counts of these count sheets, by sheet id. */
export function useCountSessionProgress(
  sessionIds: ReadonlyArray<string> | undefined,
) {
  const key = idKey(sessionIds);
  const args = useMemo(
    () => (key === undefined ? "skip" : { sessionIds: fromKey(key) }),
    [key],
  );
  return useQuery(api.inventoryWindow.countSessionProgress, args);
}

type OpeningTab = "needs_review" | "ready" | "done";

/** Opening stock records of one tab, 50 at a time. */
export function useOpeningStockPages(tab: OpeningTab) {
  return pages(
    usePaginatedQuery(
      api.inventoryWindow.openingStockPage,
      { tab },
      { initialNumItems: SUPPLY_PAGE },
    ),
  );
}

/** How many opening stock records are in each tab. */
export function useOpeningStockCounts() {
  return useQuery(api.inventoryWindow.openingStockCounts, {});
}

/**
 * Waste records for a report period: those since `days` ago, or with
 * `days` null every record, read 500 at a time and `undefined` until the
 * last page has arrived (all time is asked for by picking it).
 */
export function useWasteForPeriod(days: number | null) {
  const today = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  const since = useQuery(
    api.inventoryWindow.wasteSince,
    days == null ? "skip" : { from: today - days * 86_400_000 },
  );
  const all = usePaginatedQuery(
    api.inventoryWindow.wastePage,
    days == null ? {} : "skip",
    { initialNumItems: 500 },
  );
  const { status, loadMore } = all;
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(500);
  }, [status, loadMore]);
  if (days != null) return since;
  return status === "Exhausted" ? all.results : undefined;
}
