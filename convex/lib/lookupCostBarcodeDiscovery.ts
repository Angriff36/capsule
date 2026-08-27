import { offFetchJson, openFoodFactsUserAgent } from "./foodDatabaseClient";

const OFF_SEARCH_BASE = "https://world.openfoodfacts.org/cgi/search.pl";

/** Find OFF barcodes that might carry Open Prices retail data for a product name. */
export async function discoverOffBarcodesForProduct(
  productName: string,
  brandOwner?: string,
): Promise<string[]> {
  const query = [brandOwner, productName].filter(Boolean).join(" ").trim();
  if (query.length < 2) return [];

  const params = new URLSearchParams({
    action: "process",
    search_terms: query,
    json: "true",
    page_size: "8",
    fields: "code,product_name,brands",
  });

  try {
    const payload = (await offFetchJson(
      `${OFF_SEARCH_BASE}?${params.toString()}`,
    )) as {
      products?: Array<{ code?: unknown; product_name?: unknown }>;
    };
    const rows = Array.isArray(payload.products) ? payload.products : [];
    const codes: string[] = [];
    for (const row of rows) {
      const digits = String(row.code ?? "").replace(/\D/g, "");
      if (digits.length >= 8 && !codes.includes(digits)) {
        codes.push(digits);
      }
    }
    return codes;
  } catch {
    return [];
  }
}

export async function fetchOpenPricesProductMeta(barcode: string): Promise<{
  product_quantity?: number;
  product_quantity_unit?: string;
  price_count?: number;
} | null> {
  const response = await fetch(
    `https://prices.openfoodfacts.org/api/v1/products/code/${encodeURIComponent(barcode)}`,
    { headers: { "User-Agent": openFoodFactsUserAgent() } },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    items?: Array<{
      product_quantity?: number;
      product_quantity_unit?: string;
      price_count?: number;
    }>;
  };
  return payload.items?.[0] ?? null;
}
