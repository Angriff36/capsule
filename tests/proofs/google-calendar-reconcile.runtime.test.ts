/**
 * PL-CALENDAR (AC-116, AC-351): against a fake Google Calendar that keeps its
 * entries by id (a second insert of the same id answers 409, an update of a
 * missing id answers 404, like Google):
 * - two overlapping runs leave exactly one entry per event;
 * - an unchanged event is skipped; a real change (name, time, venue,
 *   headcount) updates the same entry once; a change Google does not show is
 *   not sent;
 * - cancelling the event removes its entry, once;
 * - a revoked Google grant parks the connection as "connect again" and
 *   writes nothing;
 * - connecting a different calendar (a new target) puts the event there once.
 * Synthetic workspace.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { encrypt } from "../../convex/lib/encryption";
import { newCalendarBasis } from "../../convex/lib/googleCalendarBasis";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-cal-reconcile";
const HOUR = 60 * 60_000;

beforeEach(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "proof-client");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "proof-secret");
  vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://proof.example/callback");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A fake Google Calendar: entries kept by id, Google's answers for clashes. */
function fakeGoogle() {
  const google = {
    revoked: false,
    entries: new Map<string, Record<string, unknown>>(),
    calls: [] as string[],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method?: string; body?: unknown }) => {
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return google.revoked
          ? Response.json(
              {
                error: "invalid_grant",
                error_description: "Token has been expired or revoked.",
              },
              { status: 400 },
            )
          : Response.json({ access_token: "proof-access", expires_in: 3600 });
      }
      const method = init.method ?? "GET";
      if (method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        const id = String(body.id);
        google.calls.push(`POST ${id}`);
        if (google.entries.has(id)) {
          return Response.json(
            { error: { message: "The requested identifier already exists." } },
            { status: 409 },
          );
        }
        google.entries.set(id, body);
        return Response.json({ id });
      }
      const id = decodeURIComponent(url.split("/events/")[1]!.split("?")[0]!);
      google.calls.push(`${method} ${id}`);
      if (!google.entries.has(id)) {
        return Response.json(
          { error: { message: "Not Found" } },
          { status: 404 },
        );
      }
      if (method === "DELETE") {
        google.entries.delete(id);
        return new Response(null, { status: 204 });
      }
      google.entries.set(id, {
        ...google.entries.get(id),
        ...(JSON.parse(String(init.body)) as Record<string, unknown>),
      });
      return Response.json({ id });
    }),
  );
  return google;
}

async function setup() {
  const t = convexTest(schema, modules);
  const connect = async (connectionId: string) => {
    const refreshToken = await encrypt("proof-refresh-token", {
      entity: "GoogleCalendarConnection",
      property: "refreshToken",
    } as Parameters<typeof encrypt>[1]);
    const connectedAt = Date.now();
    await t.mutation(internal.googleCalendar.recordConnection, {
      tenantId: TENANT,
      connectionId,
      calendarId: "primary",
      connectedAt,
      connectedBy: "manager-reconcile",
      refreshToken,
      basis: newCalendarBasis(connectedAt, false),
    });
  };
  const sync = (connectionId: string) =>
    t.action(internal.googleCalendar.reconcileTenant, {
      tenantId: TENANT,
      connectionId,
      scheduleNext: false,
    }) as Promise<{
      status: string;
      createdOrUpdated: number;
      deleted: number;
      skipped: number;
      failed: number;
    }>;
  const addEvent = () =>
    t.run(async (ctx) =>
      ctx.db.insert("events", {
        tenantId: TENANT,
        title: "Harbor Gala",
        eventType: "gala",
        stage: "approved",
        startsAt: Date.now() + 48 * HOUR,
        endsAt: Date.now() + 52 * HOUR,
        venueName: "Pier 4",
        expectedHeadcount: 120,
        version: 1,
      }),
    );
  const patchEvent = (
    eventId: Id<"events">,
    patch: Partial<{
      title: string;
      stage: string;
      expectedHeadcount: number;
      serviceRequirements: string;
    }>,
  ) =>
    t.run(async (ctx) => {
      await ctx.db.patch(eventId, patch as Partial<Doc<"events">>);
    });
  return { t, connect, sync, addEvent, patchEvent };
}

describe("PL-CALENDAR one calendar entry per event", () => {
  it("overlapping runs leave one entry; real changes update it once; cancellation removes it", async () => {
    const p = await setup();
    const google = fakeGoogle();
    await p.connect("conn-a");
    const eventId = await p.addEvent();

    // Two runs at the same time: both try to add, Google refuses the second
    // add of the same id, and that run updates the same entry instead.
    await Promise.all([p.sync("conn-a"), p.sync("conn-a")]);
    expect(google.entries.size).toBe(1);
    const [entryId] = [...google.entries.keys()];

    // Nothing changed: nothing is sent.
    google.calls.length = 0;
    expect(await p.sync("conn-a")).toMatchObject({
      createdOrUpdated: 0,
      skipped: 1,
    });
    expect(google.calls).toEqual([]);

    // A change Google does not show (service needs): still nothing sent.
    await p.patchEvent(eventId, { serviceRequirements: "Bring extra linens" });
    expect(await p.sync("conn-a")).toMatchObject({ createdOrUpdated: 0 });
    expect(google.calls).toEqual([]);

    // A real change: the same entry is updated once.
    await p.patchEvent(eventId, {
      title: "Harbor Gala (moved inside)",
      expectedHeadcount: 140,
    });
    expect(await p.sync("conn-a")).toMatchObject({ createdOrUpdated: 1 });
    expect(google.calls).toEqual([`PATCH ${entryId}`]);
    expect(google.entries.size).toBe(1);
    expect(String(google.entries.get(entryId!)?.summary)).toContain(
      "moved inside",
    );
    google.calls.length = 0;
    expect(await p.sync("conn-a")).toMatchObject({ createdOrUpdated: 0 });
    expect(google.calls).toEqual([]);

    // Cancelled: the entry is removed, once.
    await p.patchEvent(eventId, { stage: "cancelled" });
    expect(await p.sync("conn-a")).toMatchObject({ deleted: 1 });
    expect(google.entries.size).toBe(0);
    google.calls.length = 0;
    expect(await p.sync("conn-a")).toMatchObject({ deleted: 0 });
    expect(google.calls).toEqual([]);
  });

  it("a revoked grant writes nothing and asks to connect again", async () => {
    const p = await setup();
    const google = fakeGoogle();
    await p.connect("conn-r");
    await p.addEvent();
    google.revoked = true;
    expect(await p.sync("conn-r")).toMatchObject({
      status: "needs_reconnect",
    });
    expect(google.calls).toEqual([]);
    const manager = p.t.withIdentity({
      subject: "manager-reconcile",
      org_id: TENANT,
      role: "admin",
    });
    expect(
      (await manager.query(api.googleCalendarHealth.connectionHealth, {}))
        .state,
    ).toBe("needs_reconnect");
  });

  it("a new target calendar gets the event once, under the same id", async () => {
    const p = await setup();
    const first = fakeGoogle();
    await p.connect("conn-1");
    await p.addEvent();
    await p.sync("conn-1");
    const [entryId] = [...first.entries.keys()];

    // Reconnected to a different Google calendar: it starts empty.
    const second = fakeGoogle();
    await p.connect("conn-2");
    await Promise.all([p.sync("conn-2"), p.sync("conn-2")]);
    expect([...second.entries.keys()]).toEqual([entryId]);
    second.calls.length = 0;
    expect(await p.sync("conn-2")).toMatchObject({ createdOrUpdated: 0 });
    expect(second.calls).toEqual([]);
  });
});
