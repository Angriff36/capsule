import {
  offFetchJson,
  openFoodFactsUserAgent,
  safeLookupString,
} from "./foodDatabaseClient";

const OFF_BASE = "https://world.openfoodfacts.org/api/v2";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type FetchedCatalogImage = {
  bytes: ArrayBuffer;
  contentType: string;
  fileName: string;
};

function normalizeBarcode(raw?: string | null): string | undefined {
  const digits = raw?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits : undefined;
}

export function pickOffImageUrl(product?: {
  image_front_url?: unknown;
  image_url?: unknown;
}): string | undefined {
  return (
    safeLookupString(product?.image_front_url) ??
    safeLookupString(product?.image_url)
  );
}

/** Resolve a front-of-pack image URL from an Open Food Facts barcode. */
export async function resolveOffImageByBarcode(
  barcode: string,
): Promise<string | undefined> {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) return undefined;
  try {
    const payload = (await offFetchJson(
      `${OFF_BASE}/product/${encodeURIComponent(normalized)}?fields=image_front_url,image_url,status`,
    )) as {
      status?: number;
      product?: { image_front_url?: unknown; image_url?: unknown };
    };
    if (payload.status === 0 || !payload.product) return undefined;
    return pickOffImageUrl(payload.product);
  } catch {
    return undefined;
  }
}

/** Download an external product image for Convex storage import. */
export async function fetchCatalogImage(
  url: string,
): Promise<FetchedCatalogImage | null> {
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) return null;

  const response = await fetch(trimmed, {
    headers: { "User-Agent": openFoodFactsUserAgent() },
  });
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (!contentType?.startsWith("image/")) return null;

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;

  const tail = trimmed.split("/").pop()?.split("?")[0]?.trim();
  const fileName =
    tail && tail.includes(".") ? tail : `ingredient-lookup.${extensionFor(contentType)}`;

  return { bytes, contentType, fileName };
}

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}
