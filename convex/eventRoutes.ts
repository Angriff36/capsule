/**
 * AUTHOR SEAM — event drive times from the kitchen to the venue and back
 * (spec §8.4, PL-ROUTES: AC-382, AC-425, AC-426).
 *
 * refreshEventRoute asks the server route provider for both legs and stores
 * each answer as a route fact in the manifestEvents ledger (entity
 * "EventRoute", one row per attempt): kitchen and venue record + version,
 * provider, travel mode, departure basis, traffic policy, duration, distance,
 * fetched time, expiry and request id. A successful answer sets the event's
 * travel minutes through the server-only Event.applyRouteTravel step, so the
 * timeline and shifts follow. A failed answer or an unresolved address
 * changes no time: travel stays unknown (ROUTE_REQUIRED), or the last fact is
 * kept and shown as out of date. The browser never works out a drive time.
 */
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";
import {
  computeDriveRoute,
  GOOGLE_ROUTES_PROVIDER,
  routeProviderConfigured,
} from "./lib/routeProvider";
import {
  evaluateRouteLeg,
  legAnchor,
  legDepartureTime,
  legTravelMinutes,
  readRoutePolicy,
  resolveDestination,
  resolveOrigin,
  ROUTE_LEGS,
  type EndpointResult,
  type RouteFactRecord,
  type RouteLeg,
  type RouteLegState,
  type RoutePolicy,
  type VenueFacts,
} from "../src/lib/routeFacts";
import { insertStepEvent } from "./lib/commandAudit";

export const ROUTE_FACT_ENTITY = "EventRoute";
export const ROUTE_FACT_TYPE = "EventRouteFactRecorded";

const FINISHED_STAGES = new Set(["completed", "closed_out", "cancelled"]);

// Same audience as Event.configureTiming: event staff and managers.
const ROUTE_ROLES = new Set([
  "admin",
  "event_manager",
  "event_staff",
  "owner",
  "system",
  "finance_manager",
  "inventory_manager",
  "kitchen_manager",
  "logistics_manager",
  "manager",
  "sales_manager",
  "workforce_manager",
]);

export type EventRouteStatus = {
  eventId: string;
  origin: EndpointResult;
  destination: EndpointResult;
  policy: RoutePolicy;
  /** The event time each leg serves (on-site arrival, venue departure). */
  anchors: Record<RouteLeg, number | null>;
  legs: RouteLegState[];
  /** ROUTE_REQUIRED: at least one leg has no usable drive time. */
  routeRequired: boolean;
  /** At least one leg keeps an older drive time that no longer matches. */
  routeStale: boolean;
  providerConfigured: boolean;
  finished: boolean;
};

const VENUE_ADDRESS_FIELDS = [
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "countryCode",
] as const;

/** Venue address fields are stored encrypted; same envelope handling as the
 * generated __decryptDoc (copy of convex/eventDayBriefing.ts decryptField). */
async function decryptField(
  ctx: unknown,
  entity: string,
  property: string,
  raw: unknown,
): Promise<unknown> {
  if (typeof raw !== "string") return raw;
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !("v" in envelope) ||
    !("kid" in envelope) ||
    !("ct" in envelope)
  ) {
    return raw;
  }
  if ((envelope as { v: unknown }).v !== 1) {
    throw new Error(
      `Unsupported encryption envelope for ${entity}.${property}`,
    );
  }
  return await decrypt(
    (envelope as { ct: string }).ct,
    (envelope as { kid: string }).kid,
    { ctx, entity, property },
  );
}

/** The route facts stored for one event, oldest first. */
async function readRouteFacts(
  ctx: QueryCtx,
  tenantId: string,
  eventId: string,
): Promise<RouteFactRecord[]> {
  const rows = await ctx.db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", eventId))
    .collect();
  return rows
    .filter(
      (row) =>
        row.entity === ROUTE_FACT_ENTITY &&
        row.type === ROUTE_FACT_TYPE &&
        (row.payload as { tenantId?: unknown } | null)?.tenantId === tenantId,
    )
    .map((row) => (row.payload as { fact: RouteFactRecord }).fact)
    .sort((a, b) => a.fetchedAt - b.fetchedAt);
}

/**
 * Everything the drive time follows, read for the caller's workspace:
 * the event, its venue, the company kitchens and route rules, stored facts.
 * Null for a missing or other-workspace event.
 */
export async function readEventRouteStatus(
  ctx: QueryCtx,
  tenantId: string,
  eventId: Id<"events">,
  at: number,
): Promise<EventRouteStatus | null> {
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || event.deletedAt != null)
    return null;
  const [locations, organizations, facts] = await Promise.all([
    ctx.db
      .query("operatingLocations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
    ctx.db
      .query("organizations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
    readRouteFacts(ctx, tenantId, String(eventId)),
  ]);
  let venue: VenueFacts | null = null;
  const venueId = event.venueId
    ? ctx.db.normalizeId("venues", String(event.venueId))
    : null;
  if (venueId) {
    const row = await ctx.db.get(venueId);
    if (row && row.tenantId === tenantId) {
      venue = { ...row, _id: String(row._id) };
      for (const field of VENUE_ADDRESS_FIELDS) {
        venue[field] = (await decryptField(ctx, "Venue", field, row[field])) as
          string | null;
      }
    }
  }
  const organization =
    organizations.find((row) => row.deletedAt == null) ?? null;
  const policy = readRoutePolicy(organization);
  const origin = resolveOrigin(
    event.operatingLocationId ? String(event.operatingLocationId) : null,
    locations.map((row) => ({ ...row, _id: String(row._id) })),
  );
  const destination = resolveDestination(
    {
      _id: String(event._id),
      venueId: event.venueId ?? null,
      venueName: event.venueName ?? null,
      venueAddress: event.venueAddress ?? null,
    },
    venue,
    origin.ok ? origin.endpoint.timeZone : null,
  );
  const anchors = {
    outbound: legAnchor("outbound", event),
    return: legAnchor("return", event),
  };
  const legs = ROUTE_LEGS.map((leg) =>
    evaluateRouteLeg(leg, facts, {
      origin,
      destination,
      anchorTime: anchors[leg],
      at,
    }),
  );
  return {
    eventId: String(eventId),
    origin,
    destination,
    policy,
    anchors,
    legs,
    routeRequired: legs.some((leg) => leg.state === "missing"),
    routeStale: legs.some((leg) => leg.state === "stale"),
    providerConfigured: routeProviderConfigured(),
    finished: FINISHED_STAGES.has(String(event.stage)),
  };
}

/** The drive time panel: any signed-in staff member of the workspace. */
export const getEventRoute = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }): Promise<EventRouteStatus | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") return null;
    const id = ctx.db.normalizeId("events", eventId);
    if (!id) return null;
    return readEventRouteStatus(ctx, auth.tenantId, id, Date.now());
  },
});

export const loadRouteStatus = internalQuery({
  args: { tenantId: v.string(), eventId: v.id("events"), at: v.number() },
  handler: async (ctx, { tenantId, eventId, at }) =>
    readEventRouteStatus(ctx, tenantId, eventId, at),
});

const factValidator = v.object({
  leg: v.union(v.literal("outbound"), v.literal("return")),
  status: v.union(v.literal("ok"), v.literal("failed")),
  origin: v.union(
    v.null(),
    v.object({ kind: v.string(), id: v.string(), version: v.string() }),
  ),
  destination: v.union(
    v.null(),
    v.object({ kind: v.string(), id: v.string(), version: v.string() }),
  ),
  provider: v.string(),
  travelMode: v.literal("drive"),
  basis: v.literal("departure"),
  anchorTime: v.union(v.number(), v.null()),
  departureTime: v.union(v.number(), v.null()),
  trafficPolicy: v.union(v.literal("traffic_aware"), v.literal("no_traffic")),
  trafficApplied: v.boolean(),
  durationSeconds: v.union(v.number(), v.null()),
  distanceMeters: v.union(v.number(), v.null()),
  fetchedAt: v.number(),
  expiresAt: v.union(v.number(), v.null()),
  requestId: v.string(),
  failureCode: v.union(
    v.null(),
    v.literal("ADDRESS_UNRESOLVED"),
    v.literal("PROVIDER_UNAVAILABLE"),
    v.literal("PROVIDER_ERROR"),
    v.literal("NO_ROUTE"),
  ),
  failureReason: v.union(v.string(), v.null()),
});

/**
 * Stores the attempt for each leg, then sets the event's travel minutes from
 * the successful legs only, as the tenant's system role (the provider gave
 * the time, not a person). A failed leg keeps whatever travel it had.
 */
export const recordRouteFacts = internalMutation({
  args: {
    tenantId: v.string(),
    eventId: v.id("events"),
    safetyBufferMinutes: v.number(),
    facts: v.array(factValidator),
  },
  handler: async (ctx, { tenantId, eventId, safetyBufferMinutes, facts }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.tenantId !== tenantId || event.deletedAt != null) {
      throw new ConvexError("Event not found");
    }
    for (const fact of facts) {
      await insertStepEvent(ctx, {
        type: ROUTE_FACT_TYPE,
        entity: ROUTE_FACT_ENTITY,
        entityId: String(eventId),
        payload: { tenantId, eventId: String(eventId), fact },
        createdAt: fact.fetchedAt,
      });
    }
    if (FINISHED_STAGES.has(String(event.stage))) return { applied: false };
    const minutes = (leg: RouteLeg) => {
      const fact = facts.find((row) => row.leg === leg && row.status === "ok");
      return fact?.durationSeconds != null
        ? legTravelMinutes(fact.durationSeconds)
        : undefined;
    };
    const outboundTravelMinutes = minutes("outbound");
    const returnTravelMinutes = minutes("return");
    if (
      outboundTravelMinutes === undefined &&
      returnTravelMinutes === undefined
    ) {
      return { applied: false };
    }
    const system = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
    await system.runMutation(api.mutations.Event_applyRouteTravel, {
      docId: eventId,
      ...(outboundTravelMinutes !== undefined ? { outboundTravelMinutes } : {}),
      ...(returnTravelMinutes !== undefined ? { returnTravelMinutes } : {}),
      ...(outboundTravelMinutes !== undefined ? { safetyBufferMinutes } : {}),
    });
    return { applied: true };
  },
});

export type RefreshRouteResult = {
  legs: { leg: RouteLeg; ok: boolean; reason: string | null }[];
  applied: boolean;
};

const WEEK_MS = 7 * 24 * 3_600_000;

/** Fetch both drive times now (the "Get drive time" button, and the
 * automatic check refreshIfDue). */
async function refreshRoute(
  ctx: ActionCtx,
  tenantId: string,
  eventId: Id<"events">,
): Promise<RefreshRouteResult> {
  const now = Date.now();
  const status = await ctx.runQuery(internal.eventRoutes.loadRouteStatus, {
    tenantId,
    eventId,
    at: now,
  });
  if (!status) throw new ConvexError("Event not found");
  if (status.finished) {
    throw new ConvexError(
      "Finished or cancelled events keep their saved timing.",
    );
  }
  const facts: RouteFactRecord[] = [];
  for (const legState of status.legs) {
    const leg = legState.leg;
    const [from, to] =
      leg === "outbound"
        ? [status.origin, status.destination]
        : [status.destination, status.origin];
    const anchor = status.anchors[leg];
    const departureTime = legDepartureTime(
      leg,
      anchor,
      status.policy,
      legState.fact?.durationSeconds ?? null,
    );
    const base = {
      leg,
      origin: from.ok
        ? {
            kind: from.endpoint.kind,
            id: from.endpoint.id,
            version: from.endpoint.version,
          }
        : null,
      destination: to.ok
        ? {
            kind: to.endpoint.kind,
            id: to.endpoint.id,
            version: to.endpoint.version,
          }
        : null,
      travelMode: "drive" as const,
      basis: "departure" as const,
      anchorTime: anchor,
      departureTime,
      trafficPolicy: status.policy.trafficPolicy,
      fetchedAt: now,
      requestId: `${String(eventId)}:${leg}:${now}`,
    };
    if (!from.ok || !to.ok) {
      facts.push({
        ...base,
        status: "failed",
        provider: GOOGLE_ROUTES_PROVIDER,
        trafficApplied: false,
        durationSeconds: null,
        distanceMeters: null,
        expiresAt: null,
        failureCode: "ADDRESS_UNRESOLVED",
        failureReason: !from.ok
          ? from.problem
          : (to as { problem: string }).problem,
      });
      continue;
    }
    const answer = await computeDriveRoute({
      from: from.endpoint,
      to: to.endpoint,
      departureTime,
      trafficPolicy: status.policy.trafficPolicy,
      now,
    });
    facts.push(
      answer.ok
        ? {
            ...base,
            status: "ok",
            provider: answer.provider,
            trafficApplied: answer.trafficApplied,
            durationSeconds: answer.durationSeconds,
            distanceMeters: answer.distanceMeters,
            expiresAt: now + status.policy.refreshHours * 3_600_000,
            failureCode: null,
            failureReason: null,
          }
        : {
            ...base,
            status: "failed",
            provider: answer.provider,
            trafficApplied: answer.trafficApplied,
            durationSeconds: null,
            distanceMeters: null,
            expiresAt: null,
            failureCode: answer.failureCode,
            failureReason: answer.failureReason,
          },
    );
  }
  const { applied } = await ctx.runMutation(
    internal.eventRoutes.recordRouteFacts,
    {
      tenantId,
      eventId,
      safetyBufferMinutes: status.policy.safetyBufferMinutes,
      facts,
    },
  );
  // Check again when the answer goes out of date; an event more than a week
  // away waits until a week before (spec §8.4 route-refresh policy).
  const nextAnchor = Math.max(
    ...ROUTE_LEGS.map((leg) => status.anchors[leg] ?? 0),
  );
  if (facts.some((fact) => fact.status === "ok") && nextAnchor > now) {
    const delay = Math.max(
      status.policy.refreshHours * 3_600_000,
      nextAnchor - WEEK_MS - now,
    );
    await ctx.scheduler.runAfter(delay, internal.eventRoutes.refreshIfDue, {
      tenantId,
      eventId,
    });
  }
  return {
    legs: facts.map((fact) => ({
      leg: fact.leg,
      ok: fact.status === "ok",
      reason: fact.failureReason,
    })),
    applied,
  };
}

export const refreshEventRoute = action({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }): Promise<RefreshRouteResult> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") {
      throw new ConvexError("Workspace unavailable. Check your access.");
    }
    if (
      !ROUTE_ROLES.has(auth.role) ||
      orgCapabilityDeniesAction("eventAccess", auth.disabledCapabilities)
    ) {
      throw new ConvexError(
        "Event staff and managers may plan the event timeline",
      );
    }
    const id = await ctx.runQuery(internal.eventRoutes.normalizeEventId, {
      eventId,
    });
    if (!id) throw new ConvexError("Event not found");
    return refreshRoute(ctx, auth.tenantId, id);
  },
});

/**
 * The automatic check (after an event change, and when a drive time goes
 * out of date): fetches only when a leg is out of date or missing, both
 * addresses resolve, the route service is set up and the event is still
 * ahead. Otherwise it records nothing.
 */
export const refreshIfDue = internalAction({
  args: { tenantId: v.string(), eventId: v.id("events") },
  handler: async (ctx, { tenantId, eventId }): Promise<void> => {
    const now = Date.now();
    const status = await ctx.runQuery(internal.eventRoutes.loadRouteStatus, {
      tenantId,
      eventId,
      at: now,
    });
    if (!status || status.finished || !status.providerConfigured) return;
    if (!status.origin.ok || !status.destination.ok) return;
    if (status.legs.every((leg) => leg.state === "current")) return;
    const anchors = ROUTE_LEGS.map((leg) => status.anchors[leg]).filter(
      (value): value is number => value != null,
    );
    if (anchors.length > 0 && anchors.every((value) => value < now)) return;
    await refreshRoute(ctx, tenantId, eventId);
  },
});

export const normalizeEventId = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => ctx.db.normalizeId("events", eventId),
});
