import { useEffect, useMemo } from "react";
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
