import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useStorageUrls } from "./fileStorageClient";
import type { IngredientCatalogRow } from "../features/kitchen/IngredientCatalogLabel";

/** undefined = no provider; null = batch loading; object = resolved urls. */
const IngredientCatalogImageContext = createContext<
  Record<string, string | null> | null | undefined
>(undefined);

export function IngredientCatalogImageProvider({
  ingredients,
  children,
}: {
  ingredients: readonly IngredientCatalogRow[] | undefined;
  children: ReactNode;
}) {
  const storageIds = useMemo(
    () => [
      ...new Set(
        (ingredients ?? [])
          .map((row) => row.primaryImageStorageId)
          .filter((id): id is string => Boolean(id)),
      ),
    ],
    [ingredients],
  );
  const imageUrls = useStorageUrls(storageIds);
  const contextValue =
    storageIds.length === 0 ? {} : imageUrls === undefined ? null : imageUrls;
  return (
    <IngredientCatalogImageContext.Provider value={contextValue}>
      {children}
    </IngredientCatalogImageContext.Provider>
  );
}

export function useIngredientCatalogImageBatchActive() {
  return useContext(IngredientCatalogImageContext) !== undefined;
}

export function useIngredientCatalogImageBatchLoading() {
  return useContext(IngredientCatalogImageContext) === null;
}

export function useIngredientCatalogImageUrl(storageId?: string | null) {
  const imageUrls = useContext(IngredientCatalogImageContext);
  if (!storageId || imageUrls == null) return undefined;
  return imageUrls[storageId] ?? null;
}
