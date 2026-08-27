/** Infer catalog cost from the tenant's own ingredient catalog. */

import type { LookupCostSource } from "./lookupCostFromOpenPrices";

type IngredientRow = {
  name?: string | null;
  category?: string | null;
  unit?: string | null;
  costPerUnit?: number | null;
};

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

export function resolveTenantCatalogCostFallback(
  rows: readonly IngredientRow[],
  args: {
    productName: string;
    category?: string;
    catalogUnit: string;
    excludeName?: string;
  },
): { costPerUnit?: number; costNote?: string; source?: LookupCostSource } {
  const unit = args.catalogUnit;
  const priced = rows.filter(
    (row) =>
      String(row.unit) === unit &&
      Number(row.costPerUnit) > 0 &&
      String(row.name ?? "")
        .trim()
        .toLowerCase() !== args.excludeName?.trim().toLowerCase(),
  );
  if (priced.length === 0) {
    return {};
  }

  const category = args.category?.trim();
  if (category) {
    const categoryPeers = priced.filter((row) => row.category === category);
    if (categoryPeers.length >= 2) {
      const categoryMedian = median(
        categoryPeers.map((row) => Number(row.costPerUnit)),
      );
      if (categoryMedian != null && categoryMedian > 0) {
        return {
          costPerUnit: Math.round(categoryMedian * 100) / 100,
          costNote: `Catalog cost estimated from your other "${category}" ingredients (median ${categoryMedian.toFixed(2)} per ${unit}).`,
          source: "tenant_category",
        };
      }
    }
  }

  const tokens = nameTokens(args.productName);
  if (tokens.length > 0) {
    const namePeers = priced.filter((row) => {
      const haystack = String(row.name ?? "").toLowerCase();
      return tokens.some((token) => haystack.includes(token));
    });
    if (namePeers.length >= 2) {
      const nameMedian = median(
        namePeers.map((row) => Number(row.costPerUnit)),
      );
      if (nameMedian != null && nameMedian > 0) {
        return {
          costPerUnit: Math.round(nameMedian * 100) / 100,
          costNote: `Catalog cost estimated from similar ingredients already in your catalog (median ${nameMedian.toFixed(2)} per ${unit}).`,
          source: "tenant_name",
        };
      }
    }
  }

  return {};
}

/** Loose same-unit median — suggestion only, never auto-written. */
export function resolveTenantUnitMedianSuggestion(
  rows: readonly IngredientRow[],
  catalogUnit: string,
  excludeName?: string,
): { suggestedCostPerUnit?: number; costNote?: string } {
  const priced = rows.filter(
    (row) =>
      String(row.unit) === catalogUnit &&
      Number(row.costPerUnit) > 0 &&
      String(row.name ?? "")
        .trim()
        .toLowerCase() !== excludeName?.trim().toLowerCase(),
  );
  if (priced.length < 2) return {};
  const catalogMedian = median(priced.map((row) => Number(row.costPerUnit)));
  if (catalogMedian == null || catalogMedian <= 0) return {};
  return {
    suggestedCostPerUnit: Math.round(catalogMedian * 100) / 100,
    costNote: `No exact match — your other "${catalogUnit}" items average about ${catalogMedian.toFixed(2)} per ${catalogUnit}.`,
  };
}
