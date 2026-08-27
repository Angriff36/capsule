import { openFoodFactsUserAgent } from "./foodDatabaseClient";

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

export type LookupCostHint = {
  costPerUnit?: number;
  costNote: string;
};

function normalizeBarcode(raw?: string | null): string | undefined {
  const digits = raw?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits : undefined;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
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
  return roundMoney((packagePrice / packageGrams) * catalogGrams);
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

/** Resolve a catalog unit cost from Open Prices when a barcode match exists. */
export async function resolveLookupCostHint(
  barcodeRaw: string | undefined,
  catalogUnit: string,
  servingGramsPerUnit?: number,
): Promise<LookupCostHint> {
  const barcode = normalizeBarcode(barcodeRaw);
  if (!barcode) {
    return {
      costNote:
        "USDA does not publish retail prices and this record has no barcode — enter cost manually.",
    };
  }

  const rows = await fetchOpenPrices(barcode);
  const best = pickBestPriceRow(rows);
  if (!best?.price || !best.product?.product_quantity) {
    return {
      costNote:
        "No USD retail price found for this barcode — enter cost manually.",
    };
  }

  const packageGrams = best.product.product_quantity;
  const costPerUnit = computeCostPerCatalogUnit(
    best.price,
    packageGrams,
    catalogUnit,
    servingGramsPerUnit,
  );

  if (costPerUnit == null || costPerUnit <= 0) {
    return {
      costNote:
        catalogUnit === "each" && !servingGramsPerUnit
          ? "A retail price was found but cost per each needs a label serving size — enter cost manually or switch unit."
          : "A retail price was found but could not be scaled to this stock unit — enter cost manually.",
    };
  }

  const currency = best.currency ?? "USD";
  const when = best.date ? ` (${best.date})` : "";
  return {
    costPerUnit,
    costNote: `Catalog cost estimated from Open Prices retail data (${best.price.toFixed(2)} ${currency} for ${packageGrams} g package${when}). Verify before relying on it.`,
  };
}
