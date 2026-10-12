import { useMutation } from "convex/react";
import { api } from "./api";

// A catering-book package as a priced menu in the catalog
// (convex/lib/operationalTransactions.ts cateringPackageAsMenu).
export const useCateringPackageAsMenu = () =>
  useMutation(api.lib.operationalTransactions.cateringPackageAsMenu);
