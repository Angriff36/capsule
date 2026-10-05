/**
 * AUTHOR SEAM — the server route provider (spec §8.4, PL-ROUTES).
 *
 * Default provider: Google Maps Routes API (computeRoutes), called from the
 * server with the GOOGLE_MAPS_API_KEY Convex environment value. No key, a
 * network error, an error answer or no route all come back as a failure; the
 * caller keeps travel unknown. Nothing here ever estimates a road time.
 */
import type {
  RouteEndpoint,
  RouteFailureCode,
  RouteTrafficPolicy,
} from "../../src/lib/routeFacts";

export const GOOGLE_ROUTES_PROVIDER = "google_routes";
const COMPUTE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

export type RouteProviderRequest = {
  from: RouteEndpoint;
  to: RouteEndpoint;
  departureTime: number | null;
  trafficPolicy: RouteTrafficPolicy;
  now: number;
};

export type RouteProviderAnswer =
  | {
      ok: true;
      provider: string;
      durationSeconds: number;
      distanceMeters: number;
      trafficApplied: boolean;
    }
  | {
      ok: false;
      provider: string;
      failureCode: RouteFailureCode;
      failureReason: string;
      trafficApplied: boolean;
    };

function waypoint(endpoint: RouteEndpoint) {
  if (endpoint.latitude != null && endpoint.longitude != null) {
    return {
      location: {
        latLng: { latitude: endpoint.latitude, longitude: endpoint.longitude },
      },
    };
  }
  return { address: endpoint.address };
}

/** "1234s" -> 1234. */
function parseSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)s$/u.exec(value.trim());
  return match ? Math.round(Number(match[1])) : null;
}

export function routeProviderConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

export async function computeDriveRoute(
  request: RouteProviderRequest,
): Promise<RouteProviderAnswer> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  // Traffic needs a departure time in the future; otherwise ask for plain
  // road time and record that traffic was not used.
  const trafficApplied =
    request.trafficPolicy === "traffic_aware" &&
    request.departureTime != null &&
    request.departureTime > request.now + 60_000;
  const failed = (failureCode: RouteFailureCode, failureReason: string) => ({
    ok: false as const,
    provider: GOOGLE_ROUTES_PROVIDER,
    failureCode,
    failureReason,
    trafficApplied,
  });
  if (!key) {
    return failed(
      "PROVIDER_UNAVAILABLE",
      "Drive times are not switched on yet: the route service key is not set.",
    );
  }
  const body: Record<string, unknown> = {
    origin: waypoint(request.from),
    destination: waypoint(request.to),
    travelMode: "DRIVE",
    routingPreference: trafficApplied ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE",
  };
  if (trafficApplied) {
    body.departureTime = new Date(request.departureTime!).toISOString();
  }
  let response: Response;
  try {
    response = await fetch(COMPUTE_ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return failed("PROVIDER_UNAVAILABLE", "The route service could not be reached.");
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    return failed(
      "PROVIDER_ERROR",
      `The route service refused the request (${response.status}). Check both addresses.`,
    );
  }
  const routes = (payload as { routes?: unknown[] } | null)?.routes;
  const first = Array.isArray(routes) ? (routes[0] as Record<string, unknown>) : null;
  const durationSeconds = parseSeconds(first?.duration);
  const distanceMeters =
    typeof first?.distanceMeters === "number" ? first.distanceMeters : null;
  if (!first || durationSeconds == null || distanceMeters == null) {
    return failed("NO_ROUTE", "The route service found no driving route between these addresses.");
  }
  return {
    ok: true,
    provider: GOOGLE_ROUTES_PROVIDER,
    durationSeconds,
    distanceMeters,
    trafficApplied,
  };
}
