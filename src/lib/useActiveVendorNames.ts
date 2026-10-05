import { useQuery } from "convex/react";
import { api } from "./api";

/**
 * Names of the company's active vendors (convex/vendorNames.ts). Unlike the
 * generated vendor list, roster editors may read these. `undefined` while
 * loading. Workforce features must not import convex/react; call this.
 */
export function useActiveVendorNames(): string[] | undefined {
  return useQuery(api.vendorNames.active, {});
}
