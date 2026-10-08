import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "./api";

// Indexed reads for kitchen screens about one recipe, dish, menu, ingredient
// or import. Kitchen features must not import convex/react; they call these
// instead of the generated whole-company lists. Each read keeps the read rule
// of its generated list. `undefined` while loading; skipped until the id is
// known.

type MaybeId = string | null | undefined;

export function useComponentStepRows(componentId: MaybeId) {
  return useQuery(
    api.queries.listComponentStepByComponentId,
    componentId ? { componentId: componentId as Id<"components"> } : "skip",
  );
}

export function useComponentPortionSpecRows(componentId: MaybeId) {
  return useQuery(
    api.queries.listComponentPortionSpecByComponentId,
    componentId ? { componentId: componentId as Id<"components"> } : "skip",
  );
}

export function useComponentSubRecipeRows(componentId: MaybeId) {
  return useQuery(
    api.queries.listComponentComponentByComponentId,
    componentId ? { componentId: componentId as Id<"components"> } : "skip",
  );
}

export function useComponentEquipmentRows(componentId: MaybeId) {
  return useQuery(
    api.queries.listComponentEquipmentByComponentId,
    componentId ? { componentId: componentId as Id<"components"> } : "skip",
  );
}

export function useComponentSnapshotRows(componentId: MaybeId) {
  return useQuery(
    api.queries.listComponentSnapshotByComponentId,
    componentId ? { componentId: componentId as Id<"components"> } : "skip",
  );
}

export function useComponentIngredientRows(componentId: MaybeId) {
  return useQuery(
    api.queries.listComponentIngredientByComponentId,
    componentId ? { componentId: componentId as Id<"components"> } : "skip",
  );
}

export function useIngredientComponentLineRows(ingredientId: MaybeId) {
  return useQuery(
    api.queries.listComponentIngredientByIngredientId,
    ingredientId ? { ingredientId: ingredientId as Id<"ingredients"> } : "skip",
  );
}

export function useComponentDishLineRows(componentId: MaybeId) {
  return useQuery(
    api.queries.listDishComponentByComponentId,
    componentId ? { componentId: componentId as Id<"components"> } : "skip",
  );
}

export function useDishComponentRows(dishId: MaybeId) {
  return useQuery(
    api.queries.listDishComponentByDishId,
    dishId ? { dishId: dishId as Id<"dishes"> } : "skip",
  );
}

export function useDishIngredientRows(dishId: MaybeId) {
  return useQuery(
    api.queries.listDishIngredientByDishId,
    dishId ? { dishId: dishId as Id<"dishes"> } : "skip",
  );
}

export function useDishContainerRows(dishId: MaybeId) {
  return useQuery(
    api.queries.listDishContainerByDishId,
    dishId ? { dishId: dishId as Id<"dishes"> } : "skip",
  );
}

export function useDishTaskRows(dishId: MaybeId) {
  return useQuery(
    api.queries.listDishTaskByDishId,
    dishId ? { dishId: dishId as Id<"dishes"> } : "skip",
  );
}

export function useIngredientPriceRows(ingredientId: MaybeId) {
  return useQuery(
    api.queries.listIngredientPriceObservationByIngredientId,
    ingredientId ? { ingredientId: ingredientId as Id<"ingredients"> } : "skip",
  );
}

export function useComponentImportLineRows(importId: MaybeId) {
  return useQuery(
    api.queries.listComponentImportLineByImportId,
    importId ? { importId: importId as Id<"componentImports"> } : "skip",
  );
}

export function useMenuDishRows(menuId: MaybeId) {
  return useQuery(
    api.queries.listMenuDishByMenuId,
    menuId ? { menuId: menuId as Id<"menus"> } : "skip",
  );
}

export function useIngredientUnitMappingRows(ingredientId: MaybeId) {
  return useQuery(
    api.queries.listItemUnitMappingByIngredientId,
    ingredientId ? { ingredientId: ingredientId as Id<"ingredients"> } : "skip",
  );
}

export function useIngredientVendorItemRows(ingredientId: MaybeId) {
  return useQuery(
    api.queries.listVendorItemByIngredientId,
    ingredientId ? { ingredientId: ingredientId as Id<"ingredients"> } : "skip",
  );
}

/** Imports that produced this recipe. */
export function useComponentSourceImportRows(componentId: MaybeId) {
  return useQuery(
    api.queries.listComponentImportByResultingComponentId,
    componentId
      ? { resultingComponentId: componentId as Id<"components"> }
      : "skip",
  );
}

/** One recipe's or one dish's packaging lines. */
export function useStylePackagingRows(
  owner: { componentId: string } | { dishId: string },
) {
  const componentId = "componentId" in owner ? owner.componentId : null;
  const dishId = "dishId" in owner ? owner.dishId : null;
  const byComponent = useQuery(
    api.queries.listStylePackagingByComponentId,
    componentId ? { componentId: componentId as Id<"components"> } : "skip",
  );
  const byDish = useQuery(
    api.queries.listStylePackagingByDishId,
    dishId ? { dishId: dishId as Id<"dishes"> } : "skip",
  );
  return componentId ? byComponent : byDish;
}

/** Prep-step materials of one dish's prep steps (convex/recipeWindow.ts). */
export function useDishTaskMaterialRows(dishId: MaybeId) {
  return useQuery(
    api.recipeWindow.dishTaskMaterials,
    dishId ? { dishId } : "skip",
  );
}

/** Ids as a stable, sorted list; undefined while the caller's ids load. */
function useIdKey(ids: ReadonlyArray<MaybeId> | undefined) {
  const key =
    ids === undefined
      ? undefined
      : [...new Set(ids.filter((id): id is string => !!id))].sort().join(",");
  return useMemo(
    () => (key === undefined ? undefined : key ? key.split(",") : []),
    [key],
  );
}

/** The latest price observation of each of these ingredients only. */
export function useLatestIngredientPriceRows(
  ingredientIds: ReadonlyArray<MaybeId> | undefined,
) {
  const ids = useIdKey(ingredientIds);
  const rows = useQuery(
    api.recipeWindow.latestPriceObservations,
    ids === undefined || ids.length === 0 ? "skip" : { ingredientIds: ids },
  );
  if (ids === undefined) return undefined;
  if (ids.length === 0) return [];
  return rows;
}

/** Recipe imports still in progress (at most eight, newest change first). */
export function useOpenComponentImports() {
  return useQuery(api.recipeWindow.openComponentImports, {});
}

/** Prep steps, their links, checks and invoice numbers of these events. */
export function usePrepBoardRows(eventIds: ReadonlyArray<MaybeId> | undefined) {
  const ids = useIdKey(eventIds);
  const rows = useQuery(
    api.recipeWindow.prepBoard,
    ids === undefined || ids.length === 0 ? "skip" : { eventIds: ids },
  );
  if (ids === undefined) return undefined;
  if (ids.length === 0)
    return { tasks: [], dependencies: [], qualityChecks: [], invoices: [] };
  return rows;
}
