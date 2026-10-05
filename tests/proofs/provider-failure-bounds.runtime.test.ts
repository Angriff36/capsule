/**
 * AC-119 (PR08-07), non-money channels: throttling, timeouts, sign-in expiry
 * and provider outages end in bounded retries or a visible state, never an
 * endless loop. (The accounting and payment legs of this row are paused by
 * the 2026-09-29 no-money rule.) Providers are fake fetches; synthetic
 * workspaces.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { encrypt } from "../../convex/lib/encryption";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-provider-bounds";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

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

async function seedWebhook(t: TestConvex) {
  await t.mutation(internal.webhookIntegrations.recordEndpoint, {
    type: "WebhookEndpointRegistered",
    tenantId: TENANT,
    endpointId: "ep-bounds",
    url: "https://hooks.example.test/bounds",
    label: "bounds",
    events: ["EventApproved"],
    secret: null,
    registeredAt: Date.now() - HOUR,
    registeredBy: "proof-manager",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("manifestEvents", {
      type: "EventApproved",
      entity: "Event",
      entityId: "event-bounds",
      payload: { tenantId: TENANT, eventId: "event-bounds" },
      createdAt: Date.now() - 5 * MINUTE,
    });
  });
}

async function passTime(t: TestConvex, minutes: number) {
  await t.run(async (ctx) => {
    for (const entity of [
      "WebhookDispatchTick",
      "WebhookDelivery",
      "WebhookDeliveryClaim",
    ]) {
      const rows = await ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", entity))
        .collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, {
          createdAt: row.createdAt - minutes * MINUTE,
        });
      }
    }
  });
}

async function managerView(t: TestConvex) {
  await t.run(async (ctx) => {
    await ctx.db.insert("people", {
      tenantId: TENANT,
      givenName: "Mo",
      familyName: "Proof",
      email: "mo@proof.test",
      role: "manager",
      employmentType: "full_time",
      status: "active",
      deletedAt: null,
      version: 1,
      authSubjectId: "bounds-mgr",
    } as never);
  });
  const [row] = await t
    .withIdentity({
      subject: "bounds-mgr",
      tokenIdentifier: "proof|bounds-mgr",
      tenantId: TENANT,
    })
    .query(api.webhookDeliveries.listDeliveryStates, {});
  return row;
}

const dispatch = (t: TestConvex) =>
  t.action(internal.webhookIntegrations.dispatchPending, {
    tenantId: TENANT,
    scheduleNext: false,
  });

describe("AC-119 provider failures stay bounded and visible", () => {
  it("a receiver that keeps asking us to slow down gets growing waits, then Capsule stops and says so", async () => {
    const t = setup();
    const sends: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        sends.push(Date.now());
        return new Response(null, { status: 429 });
      }),
    );
    await seedWebhook(t);
    for (let tick = 0; tick < 12; tick += 1) {
      await dispatch(t);
      await passTime(t, 1.1);
    }
    // Waits of 1 and 2 minutes, then stop after the third try.
    expect(sends).toHaveLength(3);
    expect(await managerView(t)).toMatchObject({
      state: "terminal_failed",
      attemptCount: 3,
      problem: "The other system asked us to slow down.",
    });
  });

  it("a receiver that never answers is a timeout, tried again later", async () => {
    const t = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      }),
    );
    await seedWebhook(t);
    await dispatch(t);
    expect(await managerView(t)).toMatchObject({
      state: "retryable_failed",
      attemptCount: 1,
      problem: "The other system did not answer in time.",
    });
  });

  it("an expired calendar sign-in stops the calendar loop and asks to reconnect; an outage keeps one later run", async () => {
    const t = setup();
    const refreshToken = await encrypt("proof-refresh", {
      entity: "GoogleCalendarConnection",
      property: "refreshToken",
    } as Parameters<typeof encrypt>[1]);
    await t.mutation(internal.googleCalendar.recordConnection, {
      tenantId: TENANT,
      connectionId: "conn-bounds",
      calendarId: "primary",
      connectedAt: Date.now() - HOUR,
      connectedBy: "proof-manager",
      refreshToken,
    });
    const scheduled = () =>
      t.run(
        async (ctx) =>
          (await ctx.db.system.query("_scheduled_functions").collect()).length,
      );
    const run = () =>
      t.action(internal.googleCalendar.reconcileTenant, {
        tenantId: TENANT,
        connectionId: "conn-bounds",
        scheduleNext: true,
      });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: "invalid_grant",
            error_description: "Token has been expired or revoked.",
          },
          { status: 400 },
        ),
      ),
    );
    expect(await run()).toMatchObject({ status: "needs_reconnect" });
    expect(await scheduled()).toBe(0);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "backend_error" }, { status: 503 }),
      ),
    );
    expect(await run()).toMatchObject({ status: "partial" });
    expect(await scheduled()).toBe(1);
  });
});
