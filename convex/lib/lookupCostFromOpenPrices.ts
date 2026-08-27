import { openFoodFactsUserAgent } from "./foodDatabaseClient";
import {
  discoverOffBarcodesForProduct,
  fetchOpenPricesProductMeta,
} from "./lookupCostBarcodeDiscovery";
import { resolveTenantCatalogCostFallback } from "./lookupCostTenantFallback";

const OPEN_PRICES_BASE = "https://prices.openfoodfacts.org/api/v1/prices";
const GRAMS_PER_OZ = 28.3495;
const GRAMS_PER_LB = 453.592;
const GRAMS_PER_KG = 1000;

type OpenPriceRow = {
  price?: number;
  currency?: string;
  date?: string;
  product?: {
    product_quantity?: number;
    product_quantity_unit?: string;
  };
  location?: {
    osm_address_country_code?: string;
  };
};

type TenantIngredientRow = {
  name?: string | null;
  category?: string | null;
  unit?: string | null;
  costPerUnit?: number | null;
};

export type LookupCostHint = {
  costPerUnit?: number;
  costNote: string;
};

function normalizeBarcode(raw?: string | null): string | undefined {
  const digits = raw?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits : undefined;
}

function gramsPerCatalogUnit(
  catalogUnit: string,
  servingGramsPerUnit?: number,
): number | null {
  switch (catalogUnit) {
    case "gram":
      return 1;
    case "kilogram":
      return GRAMS_PER_KG;
    case "ounce":
      return GRAMS_PER_OZ;
    case "pound":
      return GRAMS_PER_LB;
    case "each":
      return servingGramsPerUnit != null && servingGramsPerUnit > 0
        ? servingGramsPerUnit
        : null;
    default:
      return null;
  }
}

export function computeCostPerCatalogUnit(
  packagePrice: number,
  packageGrams: number,
  catalogUnit: string,
  servingGramsPerUnit?: number,
): number | null {
  if (
    !Number.isFinite(packagePrice) ||
    packagePrice <= 0 ||
    !Number.isFinite(packageGrams) ||
    packageGrams <= 0
  ) {
    return null;
  }
  const catalogGrams = gramsPerCatalogUnit(catalogUnit, servingGramsPerUnit);
  if (catalogGrams == null || catalogGrams <= 0) return null;
  return Math.round(((packagePrice / packageGrams) * catalogGrams) * 100) / 100;
}

function pickBestPriceRow(rows: OpenPriceRow[]): OpenPriceRow | undefined {
  const usable = rows.filter(
    (row) =>
      row.price != null &&
      Number.isFinite(row.price) &&
      row.price > 0 &&
      row.product?.product_quantity != null &&
      Number.isFinite(row.product.product_quantity) &&
      row.product.product_quantity > 0 &&
      (row.product.product_quantity_unit ?? "g").toLowerCase() === "g",
  );
  if (usable.length === 0) return undefined;

  const score = (row: OpenPriceRow) => {
    const country = row.location?.osm_address_country_code?.toUpperCase();
    const currency = row.currency?.toUpperCase();
    const date = Date.parse(row.date ?? "");
    const usBoost = country === "US" ? 1000 : 0;
    const usdBoost = currency === "USD" ? 200 : 0;
    const recency = Number.isFinite(date) ? date : 0;
    return usBoost + usdBoost + recency / 1_000_000_000;
  };

  const usdRows = usable.filter((row) => row.currency?.toUpperCase() === "USD");
  if (usdRows.length === 0) return undefined;
  return [...usdRows].sort((a, b) => score(b) - score(a))[0];
}

async function fetchOpenPrices(barcode: string): Promise<OpenPriceRow[]> {
  const params = new URLSearchParams({
    product_code: barcode,
    page_size: "25",
  });
  const response = await fetch(`${OPEN_PRICES_BASE}?${params.toString()}`, {
    headers: { "User-Agent": openFoodFactsUserAgent() },
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { items?: OpenPriceRow[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

async function resolveOpenPricesCost(
  barcodeCandidates: string[],
  catalogUnit: string,
  servingGramsPerUnit?: number,
): Promise<LookupCostHint | null> {
  for (const candidate of barcodeCandidates) {
    const rows = await fetchOpenPrices(candidate);
    const best = pickBestPriceRow(rows);
    if (!best?.price) continue;

    let packageGrams = best.product?.product_quantity;
    if (packageGrams == null || packageGrams <= 0) {
      const meta = await fetchOpenPricesProductMeta(candidate);
      packageGrams = meta?.product_quantity;
    }
    if (packageGrams == null || packageGrams <= 0) continue;

    const costPerUnit = computeCostPerCatalogUnit(
      best.price,
      packageGrams,
      catalogUnit,
      servingGramsPerUnit,
    );
    if (costPerUnit == null || costPerUnit <= 0) continue;

    const when = best.date ? ` (${best.date})` : "";
    return {
      costPerUnit,
      costNote: `Catalog cost from Open Prices retail data (${best.price.toFixed(2)} USD for ${packageGrams} g${when}).`,
    };
  }
  return null;
}

/** Resolve catalog unit cost from Open Prices, OFF barcode discovery, or tenant catalog. */
export async function resolveLookupCostHint(args: {
  barcode?: string;
  productName: string;
  brandOwner?: string;
  category?: string;
  catalogUnit: string;
  servingGramsPerUnit?: number;
  tenantIngredients?: readonly TenantIngredientRow[];
}): Promise<LookupCostHint> {
  const barcodeCandidates: string[] = [];
  const direct = normalizeBarcode(args.barcode);
  if (direct) barcodeCandidates.push(direct);
  const discovered = await discoverOffBarcodesForProduct(
    args.productName,
    args.brandOwner,
  );
  for (const code of discovered) {
    if (!barcodeCandidates.includes(code)) barcodeCandidates.push(code);
  }

  if (barcodeCandidates.length > 0) {
    const openPrices = await resolveOpenPricesCost(
      barcodeCandidates,
      args.catalogUnit,
      args.servingGramsPerUnit,
    );
    if (openPrices?.costPerUnit) return openPrices;
  }

  const tenantFallback = resolveTenantCatalogCostFallback(
    args.tenantIngredients ?? [],
    {
      productName: args.productName,
      category: args.category,
      catalogUnit: args.catalogUnit,
      excludeName: args.productName,
    },
  );
  if (tenantFallback.costPerUnit != null && tenantFallback.costPerUnit > 0) {
    return {
      costPerUnit: tenantFallback.costPerUnit,
      costNote:
        tenantFallback.costNote ??
        "Catalog cost estimated from similar items in your catalog.",
    };
  }

  if (barcodeCandidates.length === 0) {
    return {
      costNote:
        "No barcode for retail pricing — try a branded Open Food Facts match; cost will inherit from similar catalog items when available.",
    };
  }

  return {
    costNote:
      "No USD retail price on file for this barcode yet — cost will inherit from similar catalog items when available.",
  };
}
