// The supply manifest guard keeps Convex hooks in the facilities seam layer.
// This query remains intentionally untransformed so the provenance panel keeps
// its loading, unavailable, and populated states exactly as before.
import { useQuery } from "convex/react";
import { api } from "../../lib/api";

export function useIngredientDemandProvenance(demandId: string) {
  return useQuery(api.demandProvenance.get, {
    ingredientDemandId: demandId as never,
  });
}
