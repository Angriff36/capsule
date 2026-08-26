import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useStorageUrls } from "./fileStorageClient";
import type { IngredientCatalogRow } from "../features/kitchen/IngredientCatalogLabel";

const IngredientCatalogImageContext = createContext<
  Record<string, string | null> | undefined
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
  return (
    <IngredientCatalogImageContext.Provider value={imageUrls}>
      {children}
    </IngredientCatalogImageContext.Provider>
  );
}

export function useIngredientCatalogImageUrl(storageId?: string | null) {
  const imageUrls = useContext(IngredientCatalogImageContext);
  if (!storageId || !imageUrls) return undefined;
  return imageUrls[storageId] ?? null;
}
