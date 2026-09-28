/**
 * Runtime proof (AC-425, PL-ROUTES): the drive time follows the kitchen the
 * company picked for the event (never a hard-coded address; a second kitchen
 * gives its own route), checked addresses and time zones, and the company
 * rules for safety buffer, traffic and refresh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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

const M = api.mutations;

describe("route source facts (AC-425)", () => {
  it("uses the kitchen chosen for the event, and a second kitchen gives its own route", async () => {
    const google = fakeRoutes((from) =>
      from.startsWith("7 Branch") ? 900 : 2400,
    );
    const { t, owner, event } = await routeWorld();
    const branch = (await owner.mutation(M.OperatingLocation_createViaAdd, {
      name: "Boulder branch",
      addressLine1: "7 Branch Street",
      city: "Boulder",
      countryCode: "US",
      timeZone: "America/Denver",
    })) as { docId: string };

    // Two kitchens and no choice: nothing is guessed.
    let status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.origin).toEqual({
      ok: false,
      problem:
        "Your company has more than one kitchen. Choose which one this event leaves from.",
    });
    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    expect(google.requests).toHaveLength(0);

    await owner.mutation(M.Event_chooseOperatingLocation, {
      docId: event,
      operatingLocationId: branch.docId,
    });
    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    expect(google.requests[0].body.origin.address).toBe(
      "7 Branch Street, Boulder, US",
    );
    const saved = await t.run((ctx) => ctx.db.get(event));
    expect(saved!.timingOutboundTravelMinutes).toBe(15);
    expect(saved!.timingSafetyBufferMinutes).toBe(15);
    status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.legs[0].fact!.origin!.id).toBe(branch.docId);
  });

  it("asks for a kitchen when the company has none", async () => {
    fakeRoutes(() => 2400);
    const { owner, kitchen, event } = await routeWorld();
    await owner.mutation(M.OperatingLocation_deactivate, { docId: kitchen });
    const status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.origin).toEqual({
      ok: false,
      problem:
        "Add your kitchen's address in company settings so Capsule can work out drive times.",
    });
    const readiness = await owner.query(api.eventReadiness.getEventReadiness, {
      eventId: event,
    });
    const issue = readiness!.domains
      .flatMap((domain) => domain.issues)
      .find((row) => row.code === "planning.route_required");
    expect(issue!.reason).toContain("Add your kitchen's address");
  });

  it("checks time zones: a venue's own zone, else the kitchen's, never a made-up one", async () => {
    fakeRoutes(() => 2400);
    const { owner, venue, event } = await routeWorld();
    let status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.destination).toMatchObject({
      ok: true,
      endpoint: { timeZone: "America/Denver", timeZoneSource: "kitchen" },
    });

    await owner.mutation(M.Venue_setTimeZone, {
      docId: venue,
      timeZone: "Mars/Olympus",
    });
    status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.destination).toEqual({
      ok: false,
      problem:
        'Red Rocks Hall has time zone "Mars/Olympus", which is not a real time zone.',
    });

    await owner.mutation(M.Venue_setTimeZone, {
      docId: venue,
      timeZone: "America/Chicago",
    });
    status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.destination).toMatchObject({
      ok: true,
      endpoint: { timeZone: "America/Chicago", timeZoneSource: "own" },
    });
  });

  it("follows the company rules for buffer, traffic and refresh", async () => {
    const google = fakeRoutes(() => 2400);
    const { t, owner, event } = await routeWorld();
    const organization = (await owner.mutation(
      M.Organization_createViaRegister,
      {
        name: "Route Proof Catering",
      },
    )) as { docId: Id<"organizations"> };
    await owner.mutation(M.Organization_configureRoutePolicy, {
      docId: organization.docId,
      safetyBufferMinutes: 30,
      trafficPolicy: "no_traffic",
      refreshHours: 6,
    });

    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    expect(google.requests[0].body.routingPreference).toBe("TRAFFIC_UNAWARE");
    expect(google.requests[0].body.departureTime).toBeUndefined();
    const saved = await t.run((ctx) => ctx.db.get(event));
    expect(saved!.timingOutboundTravelMinutes).toBe(40);
    expect(saved!.timingSafetyBufferMinutes).toBe(30);
    expect(saved!.timingReturnTravelMinutes).toBe(40);
    const fact = (await storedRouteFacts(t, event))[0].payload.fact;
    expect(fact.trafficPolicy).toBe("no_traffic");
    expect(fact.trafficApplied).toBe(false);
    expect(fact.expiresAt - fact.fetchedAt).toBe(6 * 3_600_000);
  });

  it("marks the drive time out of date when the kitchen address changes", async () => {
    fakeRoutes(() => 2400);
    const { owner, kitchen, event } = await routeWorld();
    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    await owner.mutation(M.OperatingLocation_revise, {
      docId: kitchen,
      name: "Main kitchen",
      addressLine1: "200 New Commissary Way",
      city: "Denver",
      countryCode: "US",
      timeZone: "America/Denver",
    });
    const status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.legs[0].state).toBe("stale");
    expect(status!.legs[0].staleReasons).toContain("The kitchen changed.");
    expect(status!.legs[1].staleReasons).toContain("The kitchen changed.");
  });
});
