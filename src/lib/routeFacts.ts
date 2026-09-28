/**
 * Drive-time rules (spec §8.4, PL-ROUTES). Pure: no Convex, no fetch.
 *
 * The kitchen-to-venue drive time is a stored route fact that a server route
 * provider answered. These rules decide which kitchen and which address a
 * route uses, what departure time it asks about, and whether a stored fact is
 * still current. They never estimate a road time: an address that cannot be
 * resolved, or a provider that did not answer, leaves travel unknown.
 */

export type RouteLeg = "outbound" | "return";
export const ROUTE_LEGS: readonly RouteLeg[] = ["outbound", "return"];

export type RouteTrafficPolicy = "traffic_aware" | "no_traffic";

export type RoutePolicy = {
  safetyBufferMinutes: number;
  trafficPolicy: RouteTrafficPolicy;
  refreshHours: number;
};

/** Company rules when none are saved: 15 minutes spare, expected traffic,
 * refetch after a day. */
export const DEFAULT_ROUTE_POLICY: RoutePolicy = {
  safetyBufferMinutes: 15,
  trafficPolicy: "traffic_aware",
  refreshHours: 24,
};

export function readRoutePolicy(
  organization: {
    routeSafetyBufferMinutes?: number | null;
    routeTrafficPolicy?: string | null;
    routeRefreshHours?: number | null;
  } | null,
): RoutePolicy {
  const buffer = organization?.routeSafetyBufferMinutes;
  const hours = organization?.routeRefreshHours;
  const traffic = organization?.routeTrafficPolicy;
  return {
    safetyBufferMinutes:
      typeof buffer === "number" && buffer >= 0
        ? buffer
        : DEFAULT_ROUTE_POLICY.safetyBufferMinutes,
    trafficPolicy:
      traffic === "traffic_aware" || traffic === "no_traffic"
        ? traffic
        : DEFAULT_ROUTE_POLICY.trafficPolicy,
    refreshHours:
      typeof hours === "number" && hours > 0
        ? hours
        : DEFAULT_ROUTE_POLICY.refreshHours,
  };
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

type AddressFields = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
};

function addressLine(fields: AddressFields): string {
  const cityLine = [
    text(fields.city),
    text(fields.region),
    text(fields.postalCode),
  ]
    .filter(Boolean)
    .join(" ");
  return [
    text(fields.addressLine1),
    text(fields.addressLine2),
    cityLine,
    text(fields.countryCode),
  ]
    .filter(Boolean)
    .join(", ");
}

/** One end of a route, with the record and version it came from. */
export type RouteEndpoint = {
  kind: "operating_location" | "venue" | "event_address";
  id: string;
  /** Record version; for a typed event address, the address text itself. */
  version: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  timeZone: string;
  /** "own" when the record names its zone; "kitchen" when the venue has none
   * and the kitchen's zone is used. */
  timeZoneSource: "own" | "kitchen";
};

export type EndpointResult =
  { ok: true; endpoint: RouteEndpoint } | { ok: false; problem: string };

export type OperatingLocationFacts = AddressFields & {
  _id: string;
  name?: string | null;
  timeZone?: string | null;
  status?: string | null;
  deletedAt?: number | null;
  version?: number | null;
};

export type VenueFacts = AddressFields & {
  _id: string;
  name?: string | null;
  timeZone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deletedAt?: number | null;
  version?: number | null;
};

const liveLocation = (row: OperatingLocationFacts) =>
  row.deletedAt == null && (row.status ?? "active") === "active";

/**
 * The kitchen the crew leaves from: the event's choice, else the company's
 * only active kitchen. Never a hard-coded address.
 */
export function resolveOrigin(
  chosenId: string | null | undefined,
  locations: OperatingLocationFacts[],
): EndpointResult {
  let location: OperatingLocationFacts | undefined;
  if (chosenId) {
    location = locations.find((row) => String(row._id) === String(chosenId));
    if (!location || location.deletedAt != null) {
      return {
        ok: false,
        problem:
          "The kitchen chosen for this event was removed. Choose another kitchen.",
      };
    }
    if (!liveLocation(location)) {
      return {
        ok: false,
        problem: `${text(location.name) || "The chosen kitchen"} is switched off. Choose another kitchen.`,
      };
    }
  } else {
    const active = locations.filter(liveLocation);
    if (active.length === 0) {
      return {
        ok: false,
        problem:
          "Add your kitchen's address in company settings so Capsule can work out drive times.",
      };
    }
    if (active.length > 1) {
      return {
        ok: false,
        problem:
          "Your company has more than one kitchen. Choose which one this event leaves from.",
      };
    }
    location = active[0];
  }
  const name = text(location.name) || "Kitchen";
  if (
    !text(location.addressLine1) ||
    !text(location.city) ||
    !text(location.countryCode)
  ) {
    return {
      ok: false,
      problem: `${name} needs a street address, city and country.`,
    };
  }
  if (!isValidTimeZone(location.timeZone)) {
    return {
      ok: false,
      problem: `${name} needs a real time zone, like America/New_York.`,
    };
  }
  return {
    ok: true,
    endpoint: {
      kind: "operating_location",
      id: String(location._id),
      version: String(location.version ?? 1),
      name,
      address: addressLine(location),
      latitude: null,
      longitude: null,
      timeZone: location.timeZone!.trim(),
      timeZoneSource: "own",
    },
  };
}

/**
 * The venue end: the linked Venue record, else the address typed on the
 * event. A venue with no time zone uses the kitchen's and says so.
 */
export function resolveDestination(
  event: {
    _id: string;
    venueId?: string | null;
    venueName?: string | null;
    venueAddress?: string | null;
  },
  venue: VenueFacts | null,
  kitchenTimeZone: string | null,
): EndpointResult {
  if (venue && venue.deletedAt == null) {
    const name = text(venue.name) || text(event.venueName) || "The venue";
    const hasPin =
      typeof venue.latitude === "number" && typeof venue.longitude === "number";
    const hasStreet = text(venue.addressLine1) && text(venue.city);
    if (!hasPin && !hasStreet) {
      return {
        ok: false,
        problem: `${name} needs a street address and city, or a map pin.`,
      };
    }
    const own = text(venue.timeZone);
    if (own && !isValidTimeZone(own)) {
      return {
        ok: false,
        problem: `${name} has time zone "${own}", which is not a real time zone.`,
      };
    }
    const timeZone = own || kitchenTimeZone;
    if (!timeZone) return { ok: false, problem: `${name} needs a time zone.` };
    return {
      ok: true,
      endpoint: {
        kind: "venue",
        id: String(venue._id),
        version: String(venue.version ?? 1),
        name,
        address: hasStreet ? addressLine(venue) : "",
        latitude: hasPin ? venue.latitude! : null,
        longitude: hasPin ? venue.longitude! : null,
        timeZone,
        timeZoneSource: own ? "own" : "kitchen",
      },
    };
  }
  const typed = text(event.venueAddress);
  if (!typed) {
    return {
      ok: false,
      problem: "Add the venue address so Capsule can work out drive times.",
    };
  }
  if (!kitchenTimeZone)
    return { ok: false, problem: "The venue needs a time zone." };
  return {
    ok: true,
    endpoint: {
      kind: "event_address",
      id: String(event._id),
      version: typed,
      name: text(event.venueName) || typed,
      address: typed,
      latitude: null,
      longitude: null,
      timeZone: kitchenTimeZone,
      timeZoneSource: "kitchen",
    },
  };
}

export type RouteTimingFacts = {
  serviceStartsAt?: number | null;
  timingSetupMinutes?: number | null;
  endsAt?: number | null;
  timingCleanupMinutes?: number | null;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The event time each leg serves, the same sums as the Event timing
 * computeds: arriving on site (serve time - setup) for the way out, leaving
 * the venue (end + cleanup) for the way back. Neither depends on travel. A
 * new anchor makes the stored fact out of date.
 */
export function legAnchor(
  leg: RouteLeg,
  event: RouteTimingFacts,
): number | null {
  if (leg === "outbound") {
    return finite(event.serviceStartsAt) && finite(event.timingSetupMinutes)
      ? event.serviceStartsAt - event.timingSetupMinutes * 60_000
      : null;
  }
  return finite(event.endsAt) && finite(event.timingCleanupMinutes)
    ? event.endsAt + event.timingCleanupMinutes * 60_000
    : null;
}

/**
 * The departure time the provider is asked about. Outbound leaves before the
 * on-site time: the last known drive time (or an hour) plus the buffer.
 */
export function legDepartureTime(
  leg: RouteLeg,
  anchor: number | null,
  policy: RoutePolicy,
  previousDurationSeconds: number | null,
): number | null {
  if (anchor == null) return null;
  if (leg === "return") return anchor;
  const driveMs = (previousDurationSeconds ?? 3600) * 1000;
  return anchor - driveMs - policy.safetyBufferMinutes * 60_000;
}

export type RouteFailureCode =
  "ADDRESS_UNRESOLVED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_ERROR" | "NO_ROUTE";

/** One stored route answer (or failed attempt) for one leg. */
export type RouteFactRecord = {
  leg: RouteLeg;
  status: "ok" | "failed";
  origin: { kind: string; id: string; version: string } | null;
  destination: { kind: string; id: string; version: string } | null;
  provider: string;
  travelMode: "drive";
  basis: "departure";
  anchorTime: number | null;
  departureTime: number | null;
  trafficPolicy: RouteTrafficPolicy;
  /** False when traffic could not be used (no future departure time). */
  trafficApplied: boolean;
  durationSeconds: number | null;
  distanceMeters: number | null;
  fetchedAt: number;
  expiresAt: number | null;
  requestId: string;
  failureCode: RouteFailureCode | null;
  failureReason: string | null;
};

export type RouteLegState = {
  leg: RouteLeg;
  /** current: a fact that still matches; stale: an older fact kept but out
   * of date; missing: no usable fact (ROUTE_REQUIRED). */
  state: "current" | "stale" | "missing";
  fact: RouteFactRecord | null;
  staleReasons: string[];
  /** Why there is no usable fact, or why the last refresh failed. */
  problem: string | null;
};

const sameRef = (
  a: { id: string; version: string } | null,
  b: { id: string; version: string } | null,
) => a != null && b != null && a.id === b.id && a.version === b.version;

/**
 * Whether the newest successful fact for a leg still matches the kitchen,
 * venue, event time and refresh window now. A later failed refresh keeps the
 * fact but marks it stale; it is never shown as current.
 */
export function evaluateRouteLeg(
  leg: RouteLeg,
  records: RouteFactRecord[],
  now: {
    origin: EndpointResult;
    destination: EndpointResult;
    anchorTime: number | null;
    at: number;
  },
): RouteLegState {
  const mine = records
    .filter((row) => row.leg === leg)
    .sort((a, b) => a.fetchedAt - b.fetchedAt);
  const latestOk =
    [...mine].reverse().find((row) => row.status === "ok") ?? null;
  const latest = mine.length ? mine[mine.length - 1] : null;
  const endpointProblem = !now.origin.ok
    ? now.origin.problem
    : !now.destination.ok
      ? now.destination.problem
      : null;
  if (!latestOk) {
    return {
      leg,
      state: "missing",
      fact: null,
      staleReasons: [],
      problem:
        endpointProblem ??
        latest?.failureReason ??
        "The drive time has not been fetched yet.",
    };
  }
  const reasons: string[] = [];
  const [from, to] =
    leg === "outbound"
      ? [now.origin, now.destination]
      : [now.destination, now.origin];
  const [factFrom, factTo] = [latestOk.origin, latestOk.destination];
  if (
    !from.ok ||
    !sameRef(factFrom, { id: from.endpoint.id, version: from.endpoint.version })
  )
    reasons.push(
      leg === "outbound" ? "The kitchen changed." : "The venue changed.",
    );
  if (
    !to.ok ||
    !sameRef(factTo, { id: to.endpoint.id, version: to.endpoint.version })
  )
    reasons.push(
      leg === "outbound" ? "The venue changed." : "The kitchen changed.",
    );
  if (latestOk.anchorTime !== now.anchorTime)
    reasons.push("The event times changed.");
  if (latestOk.expiresAt != null && now.at > latestOk.expiresAt)
    reasons.push("The drive time is older than the company refresh rule.");
  const failedAfter =
    latest &&
    latest.status === "failed" &&
    latest.fetchedAt > latestOk.fetchedAt;
  if (failedAfter)
    reasons.push(
      `The last refresh failed: ${latest.failureReason ?? "no answer"}`,
    );
  return {
    leg,
    state: reasons.length ? "stale" : "current",
    fact: latestOk,
    staleReasons: reasons,
    problem: failedAfter ? latest.failureReason : null,
  };
}

/** Minutes the event timeline uses for a leg: the road time rounded up,
 * plus the safety buffer on the way out. */
export function legTravelMinutes(
  leg: RouteLeg,
  durationSeconds: number,
  policy: RoutePolicy,
): number {
  const drive = Math.ceil(durationSeconds / 60);
  return leg === "outbound" ? drive + policy.safetyBufferMinutes : drive;
}
