// Route planning helpers: geocode delivery destinations and suggest a visit
// order via a nearest-neighbor heuristic. Pure functions except the geocoder.

export type GeoPoint = { lat: number; lon: number };

export type RouteStop = {
  id: string;
  destination: string;
  windowStartsAt?: number | null;
};

// ponytail: flat city-driving estimate; swap for a routing API if precision matters.
export const AVG_SPEED_KMH = 40;

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

const byWindow = (a: RouteStop, b: RouteStop) =>
  (a.windowStartsAt ?? 0) - (b.windowStartsAt ?? 0);

// Nearest-neighbor: start at the geocoded stop with the earliest window, then
// repeatedly visit the closest remaining geocoded stop. Stops without
// coordinates are appended at the end in window order.
export function suggestVisitOrder(
  stops: RouteStop[],
  coords: ReadonlyMap<string, GeoPoint>,
): string[] {
  const geocoded = stops.filter((stop) => coords.has(stop.id)).sort(byWindow);
  const ungeocoded = stops
    .filter((stop) => !coords.has(stop.id))
    .sort(byWindow);
  const order: string[] = [];
  let current = geocoded.shift();
  while (current) {
    order.push(current.id);
    const here = coords.get(current.id) as GeoPoint;
    let nearestIndex = -1;
    let nearestKm = Infinity;
    geocoded.forEach((stop, index) => {
      const km = haversineKm(here, coords.get(stop.id) as GeoPoint);
      if (km < nearestKm) {
        nearestKm = km;
        nearestIndex = index;
      }
    });
    current =
      nearestIndex === -1 ? undefined : geocoded.splice(nearestIndex, 1)[0];
  }
  return [...order, ...ungeocoded.map((stop) => stop.id)];
}

export type RouteLeg = { distanceKm: number; minutes: number } | null;

// Leg from the previous stop to each stop (first leg and legs touching an
// ungeocoded stop are null).
export function routeLegs(
  orderedIds: string[],
  coords: ReadonlyMap<string, GeoPoint>,
): RouteLeg[] {
  return orderedIds.map((id, index) => {
    if (index === 0) return null;
    const from = coords.get(orderedIds[index - 1]);
    const to = coords.get(id);
    if (!from || !to) return null;
    const distanceKm = haversineKm(from, to);
    return { distanceKm, minutes: (distanceKm / AVG_SPEED_KMH) * 60 };
  });
}

const CACHE_PREFIX = "capsule.geocode:";

// Geocode a free-text destination via Nominatim (OpenStreetMap), caching hits
// and misses in localStorage so repeat renders never re-query.
export async function geocodeDestination(
  destination: string,
): Promise<GeoPoint | null> {
  const key = CACHE_PREFIX + destination.trim().toLowerCase();
  try {
    const cached = localStorage.getItem(key);
    if (cached !== null) return cached === "" ? null : JSON.parse(cached);
  } catch {
    // storage unavailable — fall through to a live lookup
  }
  let point: GeoPoint | null = null;
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(destination)}`,
      { headers: { Accept: "application/json" } },
    );
    if (response.ok) {
      const results = (await response.json()) as {
        lat?: string;
        lon?: string;
      }[];
      const hit = results[0];
      if (hit?.lat != null && hit?.lon != null) {
        point = { lat: Number(hit.lat), lon: Number(hit.lon) };
      }
    }
  } catch {
    return null; // network failure: do not cache, retry next visit
  }
  try {
    localStorage.setItem(key, point ? JSON.stringify(point) : "");
  } catch {
    // ignore quota errors
  }
  return point;
}
