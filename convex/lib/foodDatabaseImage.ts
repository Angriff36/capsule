import {
  offFetchJson,
  openFoodFactsUserAgent,
  safeLookupString,
} from "./foodDatabaseClient";

const OFF_BASE = "https://world.openfoodfacts.org/api/v2";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const TRUSTED_IMAGE_HOST_SUFFIXES = [
  ".openfoodfacts.org",
  ".openfoodfacts.net",
] as const;

export type FetchedCatalogImage = {
  bytes: ArrayBuffer;
  contentType: string;
  fileName: string;
};

function normalizeBarcode(raw?: string | null): string | undefined {
  const digits = raw?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits : undefined;
}

export function isTrustedCatalogImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return TRUSTED_IMAGE_HOST_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

export function pickOffImageUrl(product?: {
  image_front_url?: unknown;
  image_url?: unknown;
}): string | undefined {
  const candidate =
    safeLookupString(product?.image_front_url) ??
    safeLookupString(product?.image_url);
  return candidate && isTrustedCatalogImageUrl(candidate) ? candidate : undefined;
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

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<ArrayBuffer | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) return null;
  }

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) return null;
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

async function fetchTrustedImageResponse(
  url: string,
): Promise<Response | null> {
  if (!isTrustedCatalogImageUrl(url)) return null;

  let current = url.trim();
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetch(current, {
      headers: { "User-Agent": openFoodFactsUserAgent() },
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      const next = new URL(location, current).toString();
      if (!isTrustedCatalogImageUrl(next)) return null;
      current = next;
      continue;
    }

    if (!response.ok) return null;
    return response;
  }

  return null;
}

/** Download an external product image for Convex storage import. */
export async function fetchCatalogImage(
  url: string,
): Promise<FetchedCatalogImage | null> {
  const response = await fetchTrustedImageResponse(url);
  if (!response) return null;

  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  if (!contentType?.startsWith("image/")) return null;

  const bytes = await readLimitedBody(response, MAX_IMAGE_BYTES);
  if (!bytes || bytes.byteLength === 0) return null;

  const trimmed = url.trim();
  const tail = trimmed.split("/").pop()?.split("?")[0]?.trim();
  const fileName =
    tail && tail.includes(".")
      ? tail
      : `ingredient-lookup.${extensionFor(contentType)}`;

  return { bytes, contentType, fileName };
}

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}
