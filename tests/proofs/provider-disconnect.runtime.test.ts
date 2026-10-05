/**
 * Runtime proof (PL-CONSENT: AC-120) on Google Calendar, the outside service
 * Capsule syncs that is not money work (QuickBooks and Stripe are left alone
 * by the no-live-money rule, Ryan 2026-09-29).
 *
 * - After a manager disconnects, the sync already queued does nothing and
 *   queues no next run; the sync records stay readable.
 * - The status says when it was disconnected and how many events stay on
 *   the calendar; it never shows a token.
 * - Connecting again updates the same calendar entry; nothing is added twice.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { encrypt } from "../../convex/lib/encryption";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-disconnect-a";
const HOUR = 60 * 60_000;

beforeEach(() => {
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  );
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "proof-client");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "proof-secret");
  vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://proof.example/callback");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubGoogle() {
  const writes: Array<{ method: string; googleEventId: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method?: string; body?: unknown }) => {
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return Response.json({
          access_token: "proof-access",
          expires_in: 3600,
        });
      }
      if (url.startsWith("https://oauth2.googleapis.com/revoke")) {
        return new Response(null, { status: 200 });
      }
      const method = init.method ?? "GET";
      const googleEventId =
        method === "POST"
          ? String((JSON.parse(String(init.body)) as { id: string }).id)
          : decodeURIComponent(url.split("/events/")[1]!.split("?")[0]!);
      writes.push({ method, googleEventId });
      return Response.json({ id: googleEventId });
    }),
  );
  return writes;
}

describe("disconnecting Google Calendar", () => {
  it("stops queued work, keeps the records, explains what stays, and reconnecting adds nothing twice", async () => {
    const t = convexTest(schema, modules);
    const manager = t.withIdentity({
      subject: "manager-disconnect",
      org_id: TENANT,
      role: "admin",
    });
    const writes = stubGoogle();
    const connect = async (connectionId: string) => {
      const refreshToken = await encrypt("proof-refresh-token", {
        entity: "GoogleCalendarConnection",
        property: "refreshToken",
      } as Parameters<typeof encrypt>[1]);
      await t.mutation(internal.googleCalendar.recordConnection, {
        tenantId: TENANT,
        connectionId,
        calendarId: "primary",
        connectedAt: Date.now(),
        connectedBy: "manager-disconnect",
        refreshToken,
      });
    };
    const sync = (connectionId: string, scheduleNext = false) =>
      t.action(internal.googleCalendar.reconcileTenant, {
        tenantId: TENANT,
        connectionId,
        scheduleNext,
      });
    const queuedSyncs = () =>
      t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (row) => row.name.includes("reconcileTenant"),
        ),
      );

    await connect("conn-1");
    await t.run(async (ctx) => {
      await ctx.db.insert("events", {
        tenantId: TENANT,
        title: "Garden Wedding",
        eventType: "wedding",
        stage: "approved",
        startsAt: Date.now() + 24 * HOUR,
        endsAt: Date.now() + 28 * HOUR,
        version: 1,
      });
    });
    expect(await sync("conn-1")).toMatchObject({ createdOrUpdated: 1 });
    expect(writes).toHaveLength(1);

    await manager.action(api.googleCalendar.disconnect, {});

    // The run that was already queued for the old connection does nothing.
    const before = (await queuedSyncs()).length;
    expect(await sync("conn-1", true)).toMatchObject({
      status: "disconnected",
    });
    expect(writes).toHaveLength(1);
    expect((await queuedSyncs()).length).toBe(before);

    // Records stay; the status explains what stays on the calendar.
    const records = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("manifestEvents")
          .withIndex("by_entity", (q) => q.eq("entity", "GoogleCalendarEvent"))
          .collect()
      ).map((row) => row.type),
    );
    expect(records).toEqual(["GoogleCalendarEventSynced"]);
    const status = await manager.query(
      api.googleCalendar.getConnectionStatus,
      {},
    );
    expect(status).toMatchObject({
      connected: false,
      entriesLeftOnCalendar: 1,
    });
    expect(typeof status.disconnectedAt).toBe("number");
    const shown = JSON.stringify(status);
    expect(shown).not.toContain("proof-refresh-token");
    expect(shown).not.toContain("proof-access");
    expect(shown).not.toContain("ciphertext");

    // Reconnect: the same entry is updated, not added again.
    await connect("conn-2");
    expect(await sync("conn-2")).toMatchObject({ createdOrUpdated: 1 });
    expect(writes).toHaveLength(2);
    expect(writes[1]!.googleEventId).toBe(writes[0]!.googleEventId);
    expect(writes[1]!.method).not.toBe("POST");
  });
});
