/**
 * Shared setup for the PL-ROUTES proofs (AC-382, AC-425, AC-426): a company
 * with kitchens, a venue with an address and time zone, an event with timing
 * rules, and a stand-in for the Google Routes API that records every request.
 */
import { convexTest } from "convex-test";
import { vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

export const ROUTE_TENANT = "tenant-route-a";
export const SERVE_AT = Date.UTC(2030, 5, 14, 22, 0);
export const ENDS_AT = Date.UTC(2030, 5, 15, 2, 0);

export function stubRouteEnv(withKey = true) {
  if (withKey) vi.stubEnv("GOOGLE_MAPS_API_KEY", "route-key-proof");
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    vi.stubEnv(
      "CONVEX_FIELD_ENCRYPTION_KEY",
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
    );
  }
}

export type RouteRequest = {
  url: string;
  headers: Record<string, string>;
  body: {
    origin: { address?: string; location?: unknown };
    destination: { address?: string; location?: unknown };
    travelMode: string;
    routingPreference: string;
    departureTime?: string;
  };
};

/**
 * Google Routes stand-in. `seconds(originAddress)` picks the drive time so a
 * second kitchen gives a different answer; `mode` "down" answers 503.
 */
export function fakeRoutes(
  seconds: (origin: string, destination: string) => number,
) {
  const requests: RouteRequest[] = [];
  const state = { mode: "ok" as "ok" | "down" | "no_route" };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        url: string,
        init: { headers?: Record<string, string>; body?: string } = {},
      ) => {
        const body = JSON.parse(init.body ?? "{}") as RouteRequest["body"];
        requests.push({ url, headers: init.headers ?? {}, body });
        if (state.mode === "down") return new Response("{}", { status: 503 });
        if (state.mode === "no_route") return Response.json({});
        const from = body.origin.address ?? "pin";
        const to = body.destination.address ?? "pin";
        return Response.json({
          routes: [
            { duration: `${seconds(from, to)}s`, distanceMeters: 31_500 },
          ],
        });
      },
    ),
  );
  return { requests, state };
}

export async function routeWorld(tenantId = ROUTE_TENANT) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({
    subject: `owner-${tenantId}`,
    org_id: tenantId,
    role: "owner",
  });
  const M = api.mutations;
  const kitchen = (await owner.mutation(M.OperatingLocation_createViaAdd, {
    name: "Main kitchen",
    addressLine1: "100 Commissary Way",
    city: "Denver",
    region: "CO",
    postalCode: "80202",
    countryCode: "us",
    timeZone: "America/Denver",
  })) as { docId: Id<"operatingLocations"> };
  const venue = (await owner.mutation(M.Venue_createViaRegister, {
    name: "Red Rocks Hall",
    venueType: "other",
    capacity: 200,
    addressLine1: "18300 W Alameda Pkwy",
    city: "Morrison",
    region: "CO",
    countryCode: "US",
  })) as { docId: Id<"venues"> };
  const client = (await owner.mutation(M.Client_createViaRegister, {
    clientType: "company",
    companyName: "Route Proof Co",
  })) as { docId: string };
  const event = (await owner.mutation(M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Route proof dinner",
    eventType: "catering",
    startsAt: SERVE_AT,
    endsAt: ENDS_AT,
    expectedHeadcount: 80,
    primaryContactName: "Pat Planner",
    budgetAmount: 4000,
    quotedPrice: 4000,
    venueId: venue.docId,
    venueName: "Red Rocks Hall",
  })) as { docId: Id<"events"> };
  await owner.mutation(M.Event_configureTiming, {
    docId: event.docId,
    serviceStartsAt: SERVE_AT,
    setupMinutes: 180,
    loadMinutes: 60,
    cleanupMinutes: 60,
    unloadMinutes: 30,
  });
  return {
    t,
    owner,
    kitchen: kitchen.docId,
    venue: venue.docId,
    event: event.docId,
  };
}

type RouteTest = Awaited<ReturnType<typeof routeWorld>>["t"];

/** Planned timeline blocks by milestone key. */
export async function timelineByMilestone(t: RouteTest, eventId: Id<"events">) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("eventTimelineActivities")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
  );
  return new Map(
    rows
      .filter((row) => row.deletedAt == null && row.timingMilestone != null)
      .map((row) => [String(row.timingMilestone), row]),
  );
}

export async function storedRouteFacts(t: RouteTest, eventId: Id<"events">) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", String(eventId)))
      .collect(),
  );
  return rows.filter((row) => row.entity === "EventRoute");
}
