/**
 * Runtime proof (AC-191 calendar outbox slice): events go to Google Calendar
 * through the durable manifestEvents ledger in `convex/googleCalendar.ts`.
 * Repeated sync runs write each unchanged event once, a failed write is tried
 * again on the next run under the same fixed Google event id (so Google never
 * holds two copies), one tenant's run never writes another tenant's events,
 * and only the newest connection keeps a sync loop running.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { encrypt } from "../../convex/lib/encryption";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-cal-a";
const OTHER_TENANT = "tenant-cal-b";
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

/** Stubs Google: token refresh always works; calendar writes pass or fail. */
function stubGoogle(writesOk: boolean) {
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
      const method = init.method ?? "GET";
      const googleEventId =
        method === "POST"
          ? String((JSON.parse(String(init.body)) as { id: string }).id)
          : decodeURIComponent(url.split("/events/")[1]!.split("?")[0]!);
      writes.push({ method, googleEventId });
      return writesOk
        ? Response.json({ id: googleEventId })
        : Response.json(
            { error: { message: "Backend Error" } },
            { status: 500 },
          );
    }),
  );
  return writes;
}

async function connect(
  t: TestConvex,
  tenantId: string,
  connectionId: string,
  connectedAt = Date.now(),
): Promise<void> {
  const refreshToken = await encrypt("proof-refresh", {
    entity: "GoogleCalendarConnection",
    property: "refreshToken",
  } as Parameters<typeof encrypt>[1]);
  await t.mutation(internal.googleCalendar.recordConnection, {
    tenantId,
    connectionId,
    calendarId: "primary",
    connectedAt,
    connectedBy: "proof-manager",
    refreshToken,
  });
}

async function addApprovedEvent(t: TestConvex, tenantId: string) {
  return await t.run(async (ctx) =>
    String(
      await ctx.db.insert("events", {
        tenantId,
        title: "Garden Wedding",
        eventType: "wedding",
        stage: "approved",
        startsAt: Date.now() + 24 * HOUR,
        endsAt: Date.now() + 28 * HOUR,
        version: 1,
      }),
    ),
  );
}

async function sync(t: TestConvex, tenantId: string, connectionId: string) {
  return await t.action(internal.googleCalendar.reconcileTenant, {
    tenantId,
    connectionId,
    scheduleNext: false,
  });
}

async function syncRows(t: TestConvex) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", "GoogleCalendarEvent"))
        .collect()
    ).map((row) => ({
      type: row.type,
      tenantId: (row.payload as { tenantId: string }).tenantId,
    })),
  );
}

describe("calendar outbox writes each event once", () => {
  it("repeated sync runs write an unchanged event once", async () => {
    const t = setup();
    const writes = stubGoogle(true);
    await connect(t, TENANT, "conn-a");
    await addApprovedEvent(t, TENANT);

    expect(await sync(t, TENANT, "conn-a")).toMatchObject({
      status: "ok",
      createdOrUpdated: 1,
    });
    expect(await sync(t, TENANT, "conn-a")).toMatchObject({
      createdOrUpdated: 0,
      skipped: 1,
    });
    expect(await sync(t, TENANT, "conn-a")).toMatchObject({
      createdOrUpdated: 0,
      skipped: 1,
    });

    expect(writes).toHaveLength(1);
    expect((await syncRows(t)).map((row) => row.type)).toEqual([
      "GoogleCalendarEventSynced",
    ]);
  });

  it("a failed write is tried again next run under the same Google id, then sent once", async () => {
    const t = setup();
    const failedWrites = stubGoogle(false);
    await connect(t, TENANT, "conn-a");
    await addApprovedEvent(t, TENANT);
    expect(await sync(t, TENANT, "conn-a")).toMatchObject({
      status: "partial",
      failed: 1,
    });

    const writes = stubGoogle(true);
    expect(await sync(t, TENANT, "conn-a")).toMatchObject({
      createdOrUpdated: 1,
      failed: 0,
    });
    expect(await sync(t, TENANT, "conn-a")).toMatchObject({ skipped: 1 });

    expect(writes).toHaveLength(1);
    expect(writes[0]!.googleEventId).toBe(failedWrites[0]!.googleEventId);
    expect((await syncRows(t)).map((row) => row.type).sort()).toEqual([
      "GoogleCalendarEventSyncFailed",
      "GoogleCalendarEventSynced",
    ]);
  });

  it("one tenant's sync never writes another tenant's events", async () => {
    const t = setup();
    const writes = stubGoogle(true);
    await connect(t, TENANT, "conn-a");
    await connect(t, OTHER_TENANT, "conn-b");
    await addApprovedEvent(t, OTHER_TENANT);

    expect(await sync(t, TENANT, "conn-a")).toMatchObject({
      createdOrUpdated: 0,
    });
    expect(writes).toHaveLength(0);
    expect(await sync(t, TENANT, "conn-b")).toMatchObject({
      status: "disconnected",
    });
    expect(writes).toHaveLength(0);
    expect(await syncRows(t)).toEqual([]);
  });

  it("only the newest connection keeps a sync loop running", async () => {
    const t = setup();
    const writes = stubGoogle(true);
    await connect(t, TENANT, "conn-old", Date.now() - HOUR);
    await connect(t, TENANT, "conn-new");
    await addApprovedEvent(t, TENANT);

    const loopSync = (connectionId: string) =>
      t.action(internal.googleCalendar.reconcileTenant, {
        tenantId: TENANT,
        connectionId,
        scheduleNext: true,
      });
    const scheduledConnections = () =>
      t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).map(
          (job) => (job.args[0] as { connectionId: string }).connectionId,
        ),
      );

    expect(await loopSync("conn-old")).toMatchObject({
      status: "disconnected",
    });
    expect(await scheduledConnections()).toEqual([]);
    expect(writes).toHaveLength(0);

    expect(await loopSync("conn-new")).toMatchObject({
      status: "ok",
      createdOrUpdated: 1,
    });
    expect(await scheduledConnections()).toEqual(["conn-new"]);
  });
});
