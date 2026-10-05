import { v } from "convex/values";
import { action } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

/**
 * Finds an address with Google (Ryan 2026-10-04: Google finds addresses the
 * free OpenStreetMap search misses). Uses the same GOOGLE_MAPS_API_KEY as the
 * drive routes. No key, no sign-in, or no match answers null and the browser
 * falls back to OpenStreetMap.
 */
export const lookup = action({
  args: { query: v.string() },
  handler: async (
    ctx,
    { query },
  ): Promise<{ lat: number; lon: number } | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") return null;
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!key || query.trim().length === 0) return null;
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`,
      );
      if (!response.ok) return null;
      const body = (await response.json()) as {
        status?: string;
        results?: {
          geometry?: { location?: { lat?: number; lng?: number } };
        }[];
      };
      const location = body.results?.[0]?.geometry?.location;
      if (
        body.status !== "OK" ||
        location?.lat == null ||
        location.lng == null
      ) {
        return null;
      }
      return { lat: location.lat, lon: location.lng };
    } catch {
      return null;
    }
  },
});
