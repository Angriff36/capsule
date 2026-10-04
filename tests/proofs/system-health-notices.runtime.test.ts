/**
 * AC-165 (PR13-10): System health problems that need someone to act reach the
 * managers' notification bell on every screen, link to the System health list,
 * and stay inside the workspace. Staff never get them. Receivers are fake
 * fetches; synthetic workspaces.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const A = "tenant-health-a";
const B = "tenant-health-b";
const MINUTE = 60_000;

afterEach(() => {
  vi.unstubAllGlobals();
});

async function person(t: TestConvex, tenantId: string, role: string) {
  const subject = `health-${role}-${tenantId}`;
  await t.run(async (ctx) => {
    await ctx.db.insert("people", {
      tenantId,
      givenName: "Mo",
      familyName: "Proof",
      email: `${subject}@proof.test`,
      role,
      employmentType: "full_time",
      status: "active",
      deletedAt: null,
      version: 1,
      authSubjectId: subject,
    } as never);
  });
  return t.withIdentity({
    subject,
    tokenIdentifier: `proof|${subject}`,
    tenantId,
  });
}

/** A webhook to a receiver that always fails, tried until Capsule stops. */
async function stoppedWebhook(t: TestConvex, tenantId: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  await t.mutation(internal.webhookIntegrations.recordEndpoint, {
    type: "WebhookEndpointRegistered",
    tenantId,
    endpointId: "ep-health",
    url: "https://hooks.example.test/health",
    label: "health",
    events: ["EventApproved"],
    secret: null,
    registeredAt: Date.now() - 60 * MINUTE,
    registeredBy: "proof-manager",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("manifestEvents", {
      type: "EventApproved",
      entity: "Event",
      entityId: "event-health",
      payload: { tenantId, eventId: "event-health" },
      createdAt: Date.now() - 5 * MINUTE,
    });
  });
  for (let tick = 0; tick < 4; tick += 1) {
    await t.action(internal.webhookIntegrations.dispatchPending, {
      tenantId,
      scheduleNext: false,
    });
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
            createdAt: row.createdAt - 10 * MINUTE,
          });
        }
      }
    });
  }
}

async function calendarNeedsReconnect(t: TestConvex, tenantId: string) {
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("manifestEvents", {
      type: "GoogleCalendarConnected",
      entity: "GoogleCalendarConnection",
      entityId: tenantId,
      payload: {
        tenantId,
        connectionId: "conn-health",
        calendarId: "primary",
        connectedAt: now - 60 * MINUTE,
        connectedBy: "proof-manager",
        refreshToken: { ciphertext: "x", keyId: "k" },
      },
      createdAt: now - 60 * MINUTE,
    });
    await ctx.db.insert("manifestEvents", {
      type: "GoogleCalendarReconciled",
      entity: "GoogleCalendarConnection",
      entityId: tenantId,
      payload: {
        tenantId,
        connectionId: "conn-health",
        status: "needs_reconnect",
      },
      createdAt: now - 5 * MINUTE,
    });
  });
}

describe("AC-165 System health in the notification bell", () => {
  it("a stopped message and a broken calendar reach the workspace's managers only", async () => {
    const t = setup();
    await stoppedWebhook(t, A);
    await calendarNeedsReconnect(t, A);

    const notices = await (
      await person(t, A, "manager")
    ).query(api.systemHealthNotices.attention, {});
    expect(notices.map((notice) => notice.id).sort()).toEqual([
      "system-health:calendar-reconnect",
      "system-health:webhooks-stopped",
    ]);
    for (const notice of notices) {
      expect(notice).toMatchObject({
        kind: "system_health",
        link: "/admin/integrations",
      });
      expect(notice.message).not.toMatch(/hooks\.example|503|token/i);
    }

    expect(
      await (
        await person(t, A, "kitchen_staff")
      ).query(api.systemHealthNotices.attention, {}),
    ).toEqual([]);
    expect(
      await (
        await person(t, B, "owner")
      ).query(api.systemHealthNotices.attention, {}),
    ).toEqual([]);
  });

  it("nothing wrong means nothing in the bell", async () => {
    const t = setup();
    expect(
      await (
        await person(t, A, "owner")
      ).query(api.systemHealthNotices.attention, {}),
    ).toEqual([]);
  });
});
