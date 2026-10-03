import { useMemo } from "react";
import { useQuery } from "convex/react";
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
 * The company's whole dish list, read only while `enabled` (for example
 * while an "add a dish" picker is open), so a screen does not hold a
 * subscription to every dish the rest of the time.
 */
export function useWholeDishList(enabled: boolean) {
  return useQuery(api.queries.listDish, enabled ? {} : "skip");
}
