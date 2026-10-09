import { useEffect, useMemo, useRef } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { DishRow } from "../../convex/dishLookup";
import { api } from "./api";

/**
 * The dishes with these ids (the first 500), never the company's whole dish
 * list (PL-SCALE). `undefined` while the ids or the dishes are loading; `[]`
 * when the caller may not read dishes. Event features must not import
 * convex/react; call this.
 */
export function useDishesByIds(
  dishIds: ReadonlyArray<string | null | undefined> | undefined,
): DishRow[] | undefined {
  const key =
    dishIds === undefined
      ? undefined
      : [...new Set(dishIds.filter((id): id is string => !!id))]
          .sort()
          .join(",");
  const ids = useMemo(
    () => (key === undefined ? undefined : key ? key.split(",") : []),
    [key],
  );
  const rows = useQuery(
    api.dishLookup.byIds,
    ids === undefined || ids.length === 0 ? "skip" : { ids },
  );
  if (ids === undefined) return undefined;
  if (ids.length === 0) return [];
  if (rows === undefined) return undefined;
  return rows ?? [];
}

/**
 * Dishes offered only at this venue. `undefined` while loading; `[]` when the
 * caller may not read dishes.
 */
export function useDishesExclusiveToVenue(
  venueId: string,
): DishRow[] | undefined {
  const rows = useQuery(api.dishLookup.exclusiveToVenue, { venueId });
  return rows === undefined ? undefined : (rows ?? []);
}

const DISH_PAGE = 500;

/**
 * The company's whole dish list (same rows and order as the generated list),
 * read 500 at a time (convex/dishLookup.ts `page`), so a dish change re-reads
 * one page, not every dish (PL-SCALE). `undefined` until the last page has
 * arrived, so counts and duplicate warnings never see a part-list. Read only
 * while `enabled` (for example while an "add a dish" picker is open).
 */
export function useWholeDishList(enabled = true): DishRow[] | undefined {
  const { results, status, loadMore } = usePaginatedQuery(
    api.dishLookup.page,
    enabled ? {} : "skip",
    { initialNumItems: DISH_PAGE },
  );
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(DISH_PAGE);
  }, [status, loadMore]);
  return useMemo(
    () => (enabled && status === "Exhausted" ? results : undefined),
    [enabled, results, status],
  );
}

/** Live dishes matching the typed text (at most 40); newest with no text. */
export function useDishSearch(text: string, enabled = true) {
  const rows = useQuery(api.dishLookup.search, enabled ? { text } : "skip");
  // Keep the last answer while the next search runs, so a picker never
  // blinks back to "loading" (and loses what was typed) on each key.
  const last = useRef<DishRow[] | undefined>(undefined);
  if (!enabled) last.current = undefined;
  else if (rows !== undefined) last.current = rows ?? [];
  return last.current;
}

/** A dish's main dish and every version of that main dish. */
export function useDishFamily(dishId: string | null | undefined) {
  const rows = useQuery(api.dishLookup.family, dishId ? { dishId } : "skip");
  return rows === undefined ? undefined : (rows ?? []);
}

/** Category, course and diet tags of the newest dishes (form suggestions). */
export function useDishFacets() {
  const rows = useQuery(api.dishLookup.facets, {});
  return rows === undefined ? undefined : (rows ?? []);
}

/** The dish catalog 100 at a time, with "load more" (the catalog list). */
export function useDishPages(enabled = true) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.dishLookup.page,
    enabled ? {} : "skip",
    { initialNumItems: 100 },
  );
  return {
    rows: !enabled || status === "LoadingFirstPage" ? undefined : results,
    canLoadMore: status === "CanLoadMore" || status === "LoadingMore",
    loadingMore: status === "LoadingMore",
    loadMore: () => loadMore(100),
  };
}
