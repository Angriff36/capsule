import { useListOrganization } from "./manifest-convex-react";
import { readPricingRules, type PricingRules } from "./pricingRules";

/** The company's price rules (src/lib/pricingRules.ts); undefined while loading. */
export function usePricingRules(): PricingRules | undefined {
  const organizations = useListOrganization();
  if (organizations === undefined) return undefined;
  const record =
    organizations.find(
      (row) => row.deletedAt == null && String(row.status) === "active",
    ) ??
    organizations.find((row) => row.deletedAt == null) ??
    null;
  return readPricingRules(record);
}
