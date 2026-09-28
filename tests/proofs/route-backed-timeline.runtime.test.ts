/**
 * Runtime proof (AC-382, PL-ROUTES): a stored route fact drives the event
 * timeline from staff on through staff off. Backward from serve time:
 * on-site = serve - setup; shop departure = on-site - road time - buffer;
 * staff on = departure - load. Forward: venue departure = end + cleanup;
 * back at the shop = + road time; staff off = + unload. A new event time
 * makes the drive time out of date until it is fetched again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  ENDS_AT,
  fakeRoutes,
  routeWorld,
  SERVE_AT,
  stubRouteEnv,
  timelineByMilestone,
} from "./route-facts.runtime.helpers";

beforeEach(() => stubRouteEnv());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const MIN = 60_000;

describe("route-backed timeline (AC-382)", () => {
  it("provider stub route fact drives staff-on through staff-off milestones", async () => {
    fakeRoutes((from) => (from.startsWith("100 Commissary") ? 2400 : 2700));
    const { t, owner, event } = await routeWorld();

    // Before the route: no travel, so no departure or staff-on time.
    let blocks = await timelineByMilestone(t, event);
    expect(blocks.get("shop_departure")?.startsAt ?? null).toBeNull();

    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    blocks = await timelineByMilestone(t, event);
    const at = (key: string) => blocks.get(key)?.startsAt;

    const onsite = SERVE_AT - 180 * MIN;
    const departShop = onsite - (40 + 15) * MIN; // 40 min road + 15 min buffer
    expect(at("onsite_arrival")).toBe(onsite);
    expect(at("shop_departure")).toBe(departShop);
    expect(at("staff_on")).toBe(departShop - 60 * MIN);
    const departVenue = ENDS_AT + 60 * MIN;
    expect(at("venue_departure")).toBe(departVenue);
    expect(at("shop_return")).toBe(departVenue + 45 * MIN); // 2700 s back
    expect(at("staff_off")).toBe(departVenue + 45 * MIN + 30 * MIN);
  });

  it("an event change queues a drive-time check that fetches once and then stops", async () => {
    vi.useFakeTimers();
    try {
      const google = fakeRoutes(() => 2400);
      const { t, owner, event } = await routeWorld();
      // Planning the timing queued a check a minute later.
      vi.advanceTimersByTime(61_000);
      await t.finishInProgressScheduledFunctions();
      expect(google.requests).toHaveLength(2);
      let saved = await t.run((ctx) => ctx.db.get(event));
      expect(saved!.timingOutboundTravelMinutes).toBe(40);

      // Its own travel update queues one more check, which finds it current.
      vi.advanceTimersByTime(61_000);
      await t.finishInProgressScheduledFunctions();
      expect(google.requests).toHaveLength(2);

      // Moving the event to a typed address fetches the new route.
      await owner.mutation(api.mutations.Event_changeVenue, {
        docId: event,
        venueName: "Garden Barn",
        venueAddress: "55 Farm Road, Golden CO, US",
      });
      vi.advanceTimersByTime(61_000);
      await t.finishInProgressScheduledFunctions();
      expect(google.requests).toHaveLength(4);
      expect(google.requests[2].body.destination.address).toBe(
        "55 Farm Road, Golden CO, US",
      );
      saved = await t.run((ctx) => ctx.db.get(event));
      expect(saved!.timingOutboundTravelMinutes).toBe(40);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a new serve time makes the drive time out of date until fetched again", async () => {
    const google = fakeRoutes(() => 2400);
    const { t, owner, event } = await routeWorld();
    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });

    const later = SERVE_AT + 60 * MIN;
    await owner.mutation(api.mutations.Event_configureTiming, {
      docId: event,
      serviceStartsAt: later,
      setupMinutes: 180,
      loadMinutes: 60,
      outboundTravelMinutes: 40,
      cleanupMinutes: 60,
      returnTravelMinutes: 40,
      unloadMinutes: 30,
    });
    let status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.legs[0].state).toBe("stale");
    expect(status!.legs[0].staleReasons).toContain("The event times changed.");

    google.requests.length = 0;
    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    // Asked about leaving 40 min road + 15 min buffer before the new on-site time.
    const onsite = later - 180 * MIN;
    expect(Date.parse(google.requests[0].body.departureTime!)).toBe(
      onsite - 55 * MIN,
    );
    status = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(status!.legs.map((leg) => leg.state)).toEqual([
      "current",
      "current",
    ]);
    const blocks = await timelineByMilestone(t, event);
    expect(blocks.get("shop_departure")?.startsAt).toBe(onsite - 55 * MIN);
  });
});
