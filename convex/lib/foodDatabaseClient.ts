import { ConvexError } from "convex/values";

/** OFF requires App/Version (contact) — bare "Capsule/1.0" gets HTTP 503. */
export const OPEN_FOOD_FACTS_USER_AGENT =
  "Capsule/1.0 (https://github.com/Angriff36/capsule)";

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";

export function fdcApiKey(): string {
  return process.env.USDA_FDC_API_KEY?.trim() || "DEMO_KEY";
}

/** Coerce external API string fields — some rows return numbers or objects. */
export function safeLookupString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

type FdcErrorBody = {
  error?: { code?: string; message?: string };
};

function fdcFailureMessage(status: number, body: FdcErrorBody): string {
  const code = body.error?.code;
  if (code === "OVER_RATE_LIMIT" || status === 429) {
    return "USDA FoodData Central is temporarily rate-limited — wait a minute and try again.";
  }
  if (code === "API_KEY_INVALID") {
    return "USDA FoodData Central API key is invalid on this deployment.";
  }
  const detail = body.error?.message?.trim();
  if (detail) return detail;
  return `Food database request failed (${status})`;
}

export async function fdcFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${FDC_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConvexError(
      `Food database request failed (${response.status}) — unexpected response.`,
    );
  }
  const errorBody = body as FdcErrorBody;
  if (!response.ok || errorBody.error) {
    throw new ConvexError(fdcFailureMessage(response.status, errorBody));
  }
  return body as T;
}

export async function offFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": OPEN_FOOD_FACTS_USER_AGENT,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ConvexError(
      `Open Food Facts request failed (${response.status})`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ConvexError(
      "Open Food Facts returned an unexpected response — try again in a moment.",
    );
  }
}
