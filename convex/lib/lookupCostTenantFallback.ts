/** Infer catalog cost from the tenant's own ingredient catalog. */

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
): { costPerUnit?: number; costNote?: string } {
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
    const categoryMedian = median(
      categoryPeers.map((row) => Number(row.costPerUnit)),
    );
    if (categoryMedian != null && categoryMedian > 0) {
      return {
        costPerUnit: Math.round(categoryMedian * 100) / 100,
        costNote: `Catalog cost estimated from your other "${category}" ingredients (median ${categoryMedian.toFixed(2)} per ${unit}).`,
      };
    }
  }

  const tokens = nameTokens(args.productName);
  if (tokens.length > 0) {
    const namePeers = priced.filter((row) => {
      const haystack = String(row.name ?? "").toLowerCase();
      return tokens.some((token) => haystack.includes(token));
    });
    const nameMedian = median(namePeers.map((row) => Number(row.costPerUnit)));
    if (nameMedian != null && nameMedian > 0) {
      return {
        costPerUnit: Math.round(nameMedian * 100) / 100,
        costNote: `Catalog cost estimated from similar ingredients already in your catalog (median ${nameMedian.toFixed(2)} per ${unit}).`,
      };
    }
  }

  return catalogUnitMedianFallback(priced, unit);
}

function catalogUnitMedianFallback(
  priced: IngredientRow[],
  unit: string,
): { costPerUnit?: number; costNote?: string } {
  if (priced.length < 2) return {};
  const catalogMedian = median(priced.map((row) => Number(row.costPerUnit)));
  if (catalogMedian == null || catalogMedian <= 0) return {};
  return {
    costPerUnit: Math.round(catalogMedian * 100) / 100,
    costNote: `Catalog cost estimated from your other "${unit}" ingredients (median ${catalogMedian.toFixed(2)} per ${unit}).`,
  };
}
