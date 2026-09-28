/**
 * Runtime proof (AC-426, PL-ROUTES): the server asks the route provider and
 * stores a traceable route fact - kitchen and venue record + version,
 * provider, travel mode, departure basis, traffic policy, duration, distance,
 * fetched time, expiry, request id. A provider that is down, not set up, or
 * finds no route, and an address that cannot be resolved, keep travel
 * unknown and raise ROUTE_REQUIRED; a failed refresh after a good answer
 * keeps the old fact marked out of date. Another workspace reads nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  fakeRoutes,
  routeWorld,
  storedRouteFacts,
  stubRouteEnv,
} from "./route-facts.runtime.helpers";

beforeEach(() => stubRouteEnv());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const readinessCodes = async (
  owner: Awaited<ReturnType<typeof routeWorld>>["owner"],
  eventId: string,
) => {
  const readiness = await owner.query(api.eventReadiness.getEventReadiness, {
    eventId,
  });
  return readiness!.domains.flatMap((domain) =>
    domain.issues.map((issue) => issue.code),
  );
};

describe("route fact (AC-426)", () => {
  it("stores the provider answer with full provenance and sets travel from it", async () => {
    const google = fakeRoutes(() => 2400);
    const { t, owner, kitchen, venue, event } = await routeWorld();

    const result = await owner.action(api.eventRoutes.refreshEventRoute, {
      eventId: event,
    });
    expect(result.applied).toBe(true);
    expect(result.legs.map((leg) => leg.ok)).toEqual([true, true]);

    // The server called the provider, once per leg, with the key and both addresses.
    expect(google.requests).toHaveLength(2);
    const [out, back] = google.requests;
    expect(out.url).toBe(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
    );
    expect(out.headers["X-Goog-Api-Key"]).toBe("route-key-proof");
    expect(out.body.origin.address).toBe(
      "100 Commissary Way, Denver CO 80202, US",
    );
    expect(out.body.destination.address).toBe(
      "18300 W Alameda Pkwy, Morrison CO, US",
    );
    expect(out.body.travelMode).toBe("DRIVE");
    expect(out.body.routingPreference).toBe("TRAFFIC_AWARE");
    expect(out.body.departureTime).toBeDefined();
    expect(back.body.origin.address).toBe(out.body.destination.address);
    expect(back.body.destination.address).toBe(out.body.origin.address);

    const rows = await storedRouteFacts(t, event);
    expect(rows).toHaveLength(2);
    const outbound = rows
      .map((row) => row.payload.fact)
      .find((fact) => fact.leg === "outbound");
    expect(outbound).toMatchObject({
      status: "ok",
      origin: { kind: "operating_location", id: String(kitchen), version: "1" },
      destination: { kind: "venue", id: String(venue), version: "1" },
      provider: "google_routes",
      travelMode: "drive",
      basis: "departure",
      trafficPolicy: "traffic_aware",
      trafficApplied: true,
      durationSeconds: 2400,
      distanceMeters: 31_500,
      failureCode: null,
    });
    expect(outbound.expiresAt - outbound.fetchedAt).toBe(24 * 3_600_000);
    expect(outbound.requestId).toContain(String(event));
    expect(rows.every((row) => row.payload.tenantId === "tenant-route-a")).toBe(
      true,
    );

    // 40 minutes of road, plus the 15-minute company buffer on the way out.
    const saved = await t.run((ctx) => ctx.db.get(event));
    expect(saved!.timingOutboundTravelMinutes).toBe(55);
    expect(saved!.timingReturnTravelMinutes).toBe(40);

    const status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.legs.map((leg) => leg.state)).toEqual([
      "current",
      "current",
    ]);
    expect(status!.routeRequired).toBe(false);
    const codes = await readinessCodes(owner, event);
    expect(codes).not.toContain("planning.route_required");
    expect(codes).not.toContain("planning.route_stale");
  });

  it("keeps travel unknown and raises ROUTE_REQUIRED when the provider fails", async () => {
    const google = fakeRoutes(() => 2400);
    google.state.mode = "down";
    const { t, owner, event } = await routeWorld();

    const result = await owner.action(api.eventRoutes.refreshEventRoute, {
      eventId: event,
    });
    expect(result.applied).toBe(false);
    expect(result.legs.every((leg) => !leg.ok)).toBe(true);
    const saved = await t.run((ctx) => ctx.db.get(event));
    expect(saved!.timingOutboundTravelMinutes ?? null).toBeNull();
    expect(saved!.timingReturnTravelMinutes ?? null).toBeNull();

    const facts = (await storedRouteFacts(t, event)).map(
      (row) => row.payload.fact,
    );
    expect(facts.map((fact) => fact.failureCode)).toEqual([
      "PROVIDER_ERROR",
      "PROVIDER_ERROR",
    ]);
    expect(facts.every((fact) => fact.durationSeconds === null)).toBe(true);

    const status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.routeRequired).toBe(true);
    expect(status!.legs[0].state).toBe("missing");
    expect(await readinessCodes(owner, event)).toContain(
      "planning.route_required",
    );

    // No route found is the same: nothing guessed.
    google.state.mode = "no_route";
    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    const after = await t.run((ctx) => ctx.db.get(event));
    expect(after!.timingOutboundTravelMinutes ?? null).toBeNull();
  });

  it("keeps travel unknown when the route service is not set up", async () => {
    vi.unstubAllEnvs();
    stubRouteEnv(false);
    const google = fakeRoutes(() => 2400);
    const { t, owner, event } = await routeWorld();

    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    expect(google.requests).toHaveLength(0);
    const facts = (await storedRouteFacts(t, event)).map(
      (row) => row.payload.fact,
    );
    expect(facts.map((fact) => fact.failureCode)).toEqual([
      "PROVIDER_UNAVAILABLE",
      "PROVIDER_UNAVAILABLE",
    ]);
    const status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.providerConfigured).toBe(false);
    expect(status!.routeRequired).toBe(true);
  });

  it("does not ask the provider for an address it cannot resolve", async () => {
    const google = fakeRoutes(() => 2400);
    const { t, owner, venue, event } = await routeWorld();
    await owner.mutation(api.mutations.Venue_updateDetails, {
      docId: venue,
      name: "Red Rocks Hall",
      venueType: "other",
    });

    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    expect(google.requests).toHaveLength(0);
    const facts = (await storedRouteFacts(t, event)).map(
      (row) => row.payload.fact,
    );
    expect(facts.map((fact) => fact.failureCode)).toEqual([
      "ADDRESS_UNRESOLVED",
      "ADDRESS_UNRESOLVED",
    ]);
    const status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.legs[0].problem).toBe(
      "Red Rocks Hall needs a street address and city, or a map pin.",
    );
  });

  it("keeps the last good fact, marked out of date, when a later refresh fails", async () => {
    const google = fakeRoutes(() => 2400);
    const { t, owner, event } = await routeWorld();
    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });

    google.state.mode = "down";
    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    const saved = await t.run((ctx) => ctx.db.get(event));
    expect(saved!.timingOutboundTravelMinutes).toBe(55);

    const status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.routeRequired).toBe(false);
    expect(status!.legs[0].state).toBe("stale");
    expect(status!.legs[0].fact!.durationSeconds).toBe(2400);
    expect(status!.legs[0].staleReasons.join(" ")).toContain(
      "The last refresh failed",
    );
    expect(await readinessCodes(owner, event)).toContain(
      "planning.route_stale",
    );
  });

  it("gives another workspace nothing and lets no one outside it refresh", async () => {
    fakeRoutes(() => 2400);
    const { t, event } = await routeWorld();
    const outsider = t.withIdentity({
      subject: "owner-route-b",
      org_id: "tenant-route-b",
      role: "owner",
    });
    expect(
      await outsider.query(api.eventRoutes.getEventRoute, { eventId: event }),
    ).toBeNull();
    await expect(
      outsider.action(api.eventRoutes.refreshEventRoute, { eventId: event }),
    ).rejects.toThrow("Event not found");
    const kitchenStaff = t.withIdentity({
      subject: "kitchen-route-a",
      org_id: "tenant-route-a",
      role: "kitchen_staff",
    });
    await expect(
      kitchenStaff.action(api.eventRoutes.refreshEventRoute, {
        eventId: event,
      }),
    ).rejects.toThrow("Event staff and managers may plan the event timeline");
    // The travel step itself is server-only.
    const owner = t.withIdentity({
      subject: "owner-tenant-route-a",
      org_id: "tenant-route-a",
      role: "owner",
    });
    await expect(
      owner.mutation(api.mutations.Event_applyRouteTravel, {
        docId: event,
        outboundTravelMinutes: 5,
      }),
    ).rejects.toThrow("can't be started by hand");
  });
});
