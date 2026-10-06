/**
 * AUTHOR SEAM — real road time between a run's stops for the route planner.
 * The browser sends the stop addresses in the order it shows; the server asks
 * the map service (the same key as event drive times) and returns where each
 * stop is and how long each leg takes. Nothing is stored.
 */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { computeMapboxTrip } from "./lib/routeProvider";

// Event drive-time audience plus the people who drive and plan runs.
const ROUTE_PLANNER_ROLES = new Set([
  "admin",
  "owner",
  "system",
  "manager",
  "event_manager",
  "event_staff",
  "logistics_manager",
  "logistics_staff",
  "driver",
  "kitchen_manager",
  "inventory_manager",
  "sales_manager",
  "finance_manager",
  "workforce_manager",
]);

export const driveLegs = action({
  args: { addresses: v.array(v.string()) },
  handler: async (
    ctx,
    { addresses },
  ): Promise<{
    configured: boolean;
    points: ({ lat: number; lon: number } | null)[];
    legs: ({ seconds: number; meters: number } | null)[];
  }> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !ROUTE_PLANNER_ROLES.has(auth.role))
      throw new Error("Only logistics and event staff can plan routes.");
    const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
    if (!token)
      return {
        configured: false,
        points: addresses.map(() => null),
        legs: addresses.map(() => null),
      };
    const trip = await computeMapboxTrip(addresses.slice(0, 25), token);
    return { configured: true, ...trip };
  },
});
