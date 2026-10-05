import { useQuery } from "convex/react";
import { api } from "../../lib/api";

/** Authored seam for the demand trace projection; feature UI does not import Convex directly. */
export function useDemandProvenance(demandId: string) {
  return useQuery(api.demandProvenance.get, {
    ingredientDemandId: demandId as never,
  });
}
