import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { MenuRecipeRows } from "../../convex/menuRecipeLookup";
import { api } from "./api";

const EMPTY: MenuRecipeRows = {
  dishIngredients: [],
  dishComponents: [],
  components: [],
  componentIngredients: [],
  ingredients: [],
  priceObservations: [],
  unitMappings: [],
  containers: [],
  inventoryItems: [],
  inventoryReservations: [],
};

/**
 * The recipe, price and stock rows behind these dishes (PL-SCALE), never the
 * company's whole lists. `undefined` while the ids or the rows are loading.
 * Event features must not import convex/react; call this.
 */
export function useMenuRecipeRows(
  dishIds: ReadonlyArray<string | null | undefined> | undefined,
): MenuRecipeRows | undefined {
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
    api.menuRecipeLookup.forDishes,
    ids === undefined || ids.length === 0 ? "skip" : { dishIds: ids },
  );
  if (ids === undefined) return undefined;
  if (ids.length === 0) return EMPTY;
  if (rows === undefined) return undefined;
  return rows ?? EMPTY;
}
