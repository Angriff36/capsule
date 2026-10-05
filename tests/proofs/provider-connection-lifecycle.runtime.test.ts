/**
 * PL-CONNECTIONS (AC-113, AC-114, AC-121, AC-344) - Google Calendar, the
 * non-money provider, through its whole life:
 * connect (basis + scopes recorded, "waiting for its first sync", not "in
 * step") -> failed sync (backlog lists the event, the event shows the failure)
 * -> scoped retry of that ONE event -> clean sync (last successful sync) ->
 * disconnect -> reconnect resumes on the same calendar entries, and a revoked
 * Google grant asks for a reconnect. The tenant's one IntegrationConnection
 * row follows every step and never holds a secret. Google is a fake fetch;
 * synthetic workspace.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { encrypt } from "../../convex/lib/encryption";
import { newCalendarBasis } from "../../convex/lib/googleCalendarBasis";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-connection-lifecycle";
const HOUR = 60 * 60_000;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

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

type Write = { googleEventId: string; method: string };

/** Fake Google: `token` "ok" | "revoked"; event writes answer `writeStatus`. */
function stubGoogle(options: { token: "ok" | "revoked"; writeStatus: number }) {
  const writes: Write[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method?: string; body?: unknown }) => {
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return options.token === "ok"
          ? Response.json({ access_token: "proof-access", expires_in: 3600 })
          : Response.json(
              {
                error: "invalid_grant",
                error_description: "Token has been expired or revoked.",
              },
              { status: 400 },
            );
      }
      const method = init.method ?? "GET";
      const googleEventId =
        method === "POST"
          ? String((JSON.parse(String(init.body)) as { id: string }).id)
          : decodeURIComponent(url.split("/events/")[1]!.split("?")[0]!);
      writes.push({ googleEventId, method });
      return options.writeStatus < 300
        ? Response.json({ id: googleEventId })
        : Response.json(
            { error: { message: "Backend Error" } },
            { status: options.writeStatus },
          );
    }),
  );
  return writes;
}

async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "manager-lifecycle",
    org_id: TENANT,
    role: "admin",
  });
  const connect = async (connectionId: string, includePast = false) => {
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
      connectedBy: "manager-lifecycle",
      refreshToken,
      basis: newCalendarBasis(connectedAt, includePast),
      scopes: SCOPE,
    });
  };
  const sync = (connectionId: string) =>
    t.action(internal.googleCalendar.reconcileTenant, {
      tenantId: TENANT,
      connectionId,
      scheduleNext: false,
    }) as Promise<{ status: string; createdOrUpdated: number; failed: number }>;
  const addEvent = (title: string, startsAt: number) =>
    t.run(async (ctx) =>
      ctx.db.insert("events", {
        tenantId: TENANT,
        title,
        eventType: "wedding",
        stage: "approved",
        startsAt,
        endsAt: startsAt + 4 * HOUR,
        version: 1,
      }),
    );
  const health = () =>
    manager.query(api.googleCalendarHealth.connectionHealth, {});
  const marker = (eventId: Id<"events">) =>
    manager.query(api.googleCalendarHealth.eventSyncMarker, { eventId });
  const connectionRows = () =>
    t.run(async (ctx) =>
      (
        await ctx.db
          .query("integrationConnections")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", TENANT))
          .collect()
      ).filter((row) => row.provider === "google_calendar"),
    );
  return {
    t,
    manager,
    connect,
    sync,
    addEvent,
    health,
    marker,
    connectionRows,
  };
}

describe("PL-CONNECTIONS Google Calendar connection lifecycle", () => {
  it("connect -> failed sync -> scoped retry of one event -> disconnect -> reconnect resumes", async () => {
    const p = await setup();
    await p.connect("conn-1");
    const upcoming = await p.addEvent("Garden Wedding", Date.now() + 24 * HOUR);
    const past = await p.addEvent(
      "Last Month Lunch",
      Date.now() - 30 * 24 * HOUR,
    );

    // Connected is not "in step": nothing has synced yet (AC-113). The basis
    // is recorded before any sync (AC-114): the past event is left off.
    expect(await p.health()).toMatchObject({
      state: "waiting_first_sync",
      lastSuccessfulSyncAt: null,
      waitingCount: 1,
      basis: { includePast: false },
      scopes: SCOPE,
    });
    // One connection record per tenant (AC-344), no secret in it.
    let rows = await p.connectionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "connected",
      externalAccountId: "primary",
      scopes: SCOPE,
      credentialRef: "manifestEvents:GoogleCalendarConnected",
    });
    expect(rows[0]!.lastSuccessfulSyncAt ?? null).toBeNull();
    expect(JSON.stringify(rows)).not.toContain("proof-refresh-token");

    // Google fails every write: the run says so, the backlog names the event,
    // and the event itself shows the failure (AC-121).
    stubGoogle({ token: "ok", writeStatus: 503 });
    expect(await p.sync("conn-1")).toMatchObject({
      status: "partial",
      failed: 1,
    });
    const failing = await p.health();
    expect(failing).toMatchObject({
      state: "needs_attention",
      lastSuccessfulSyncAt: null,
      waitingCount: 0,
    });
    expect(failing.failed.map((item) => item.eventId)).toEqual([
      String(upcoming),
    ]);
    expect(await p.marker(upcoming)).toMatchObject({
      status: "failed",
      canRetry: true,
    });
    rows = await p.connectionRows();
    expect(rows[0]).toMatchObject({ status: "error" });
    expect(rows[0]!.lastErrorMessage).toContain(
      "did not reach Google Calendar",
    );

    // Scoped retry: only that one event is sent; a newer event waits for the
    // next run.
    const later = await p.addEvent("Board Dinner", Date.now() + 72 * HOUR);
    let writes = stubGoogle({ token: "ok", writeStatus: 200 });
    expect(
      await p.manager.action(api.googleCalendar.retryEvent, {
        eventId: upcoming,
      }),
    ).toEqual({ status: "synced", error: null });
    expect(writes).toHaveLength(1);
    const upcomingGoogleId = writes[0]!.googleEventId;
    expect(await p.marker(upcoming)).toMatchObject({ status: "synced" });
    expect(await p.marker(later)).toBeNull();
    expect(await p.health()).toMatchObject({ waitingCount: 1, failed: [] });

    // A clean full run: last successful sync is set, everywhere.
    writes = stubGoogle({ token: "ok", writeStatus: 200 });
    expect(await p.sync("conn-1")).toMatchObject({ status: "ok" });
    const clean = await p.health();
    expect(clean.state).toBe("in_step");
    expect(typeof clean.lastSuccessfulSyncAt).toBe("number");
    rows = await p.connectionRows();
    expect(rows[0]).toMatchObject({ status: "connected" });
    expect(typeof rows[0]!.lastSuccessfulSyncAt).toBe("number");
    // The past event was never sent.
    expect(await p.marker(past)).toBeNull();

    // Disconnect: the record says revoked; the event no longer reports.
    await p.manager.action(api.googleCalendar.disconnect, {});
    expect((await p.health()).state).toBe("not_connected");
    expect(await p.marker(upcoming)).toBeNull();
    rows = await p.connectionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "revoked" });

    // Reconnect: the same record is reused and the same entries are updated.
    await p.connect("conn-2");
    rows = await p.connectionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "connected" });
    expect((await p.health()).state).toBe("waiting_first_sync");
    writes = stubGoogle({ token: "ok", writeStatus: 200 });
    expect(await p.sync("conn-2")).toMatchObject({
      status: "ok",
      createdOrUpdated: 2,
    });
    expect(writes.map((write) => write.method)).not.toContain("POST");
    expect(writes.map((write) => write.googleEventId)).toContain(
      upcomingGoogleId,
    );
    expect((await p.health()).state).toBe("in_step");
  });

  it("a revoked Google grant asks for a reconnect and a retry says so plainly", async () => {
    const p = await setup();
    await p.connect("conn-r");
    const event = await p.addEvent("Gala", Date.now() + 24 * HOUR);
    stubGoogle({ token: "revoked", writeStatus: 200 });
    expect(await p.sync("conn-r")).toMatchObject({
      status: "needs_reconnect",
    });
    expect((await p.health()).state).toBe("needs_reconnect");
    const rows = await p.connectionRows();
    expect(rows[0]).toMatchObject({ status: "error" });
    expect(rows[0]!.lastErrorMessage).toContain("Connect again");
    await expect(
      p.manager.action(api.googleCalendar.retryEvent, { eventId: event }),
    ).rejects.toThrow(/Connect Google Calendar again/u);
  });

  it("past events go on the calendar only when the connect said so", async () => {
    const p = await setup();
    await p.connect("conn-past", true);
    const past = await p.addEvent("Spring Lunch", Date.now() - 30 * 24 * HOUR);
    expect(await p.health()).toMatchObject({
      waitingCount: 1,
      basis: { includePast: true },
    });
    stubGoogle({ token: "ok", writeStatus: 200 });
    expect(await p.sync("conn-past")).toMatchObject({ createdOrUpdated: 1 });
    expect(await p.marker(past)).toMatchObject({ status: "synced" });
  });
});
