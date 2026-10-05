/**
 * AC-361 (CF-13.6) / AC-208 / AC-346: replaying the same outbox delivery
 * creates no second message. Two dispatch runs that reach the same webhook
 * or text alert at the same moment send it once (each send is claimed in a
 * mutation first). A webhook whose answer was lost goes again with the same
 * delivery id, so a receiver that keeps ids acts once; a text whose answer
 * was lost is never re-sent on its own. Providers are fake fetches;
 * synthetic workspaces.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-outbox-replay";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-proof");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "proof-token");
  vi.stubEnv("TWILIO_FROM_NUMBER", "+15550000000");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A receiver that acts once per delivery id, like a careful integration. */
function stubReceiver() {
  const posts: string[] = [];
  const acted = new Set<string>();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        url: string,
        init: { headers?: Record<string, string>; body?: unknown },
      ) => {
        if (url.includes("twilio")) {
          posts.push("sms");
          return Response.json({ sid: `SM${posts.length}` });
        }
        const id = init.headers?.["X-Capsule-Delivery-Id"] ?? "";
        posts.push(id);
        acted.add(id);
        return new Response(null, { status: 200 });
      },
    ),
  );
  return { posts, acted };
}

async function seedWebhook(t: TestConvex): Promise<string> {
  await t.mutation(internal.webhookIntegrations.recordEndpoint, {
    type: "WebhookEndpointRegistered",
    tenantId: TENANT,
    endpointId: "ep-replay",
    url: "https://hooks.example.test/replay",
    label: "replay",
    events: ["EventApproved"],
    secret: null,
    registeredAt: Date.now() - HOUR,
    registeredBy: "proof-manager",
  });
  return await t.run(async (ctx) =>
    String(
      await ctx.db.insert("manifestEvents", {
        type: "EventApproved",
        entity: "Event",
        entityId: "event-replay",
        payload: { tenantId: TENANT, eventId: "event-replay" },
        createdAt: Date.now() - 5 * MINUTE,
      }),
    ),
  );
}

async function seedSms(t: TestConvex) {
  await t.mutation(internal.smsAlerts.recordConfigEvent, {
    tenantId: TENANT,
    type: "SmsAlertsEnabled",
    actorId: "proof-manager",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("people", {
      tenantId: TENANT,
      givenName: "Pat",
      familyName: "Cook",
      email: "pat@example.test",
      phone: "5551110001",
      role: "kitchen_staff",
      employmentType: "full_time",
      status: "active",
      smsAlertsOptIn: true,
      version: 1,
    });
    await ctx.db.insert("events", {
      tenantId: TENANT,
      title: "Garden Wedding",
      eventType: "wedding",
      stage: "executing",
      startsAt: Date.now() + HOUR,
      version: 1,
    });
  });
}

const dispatch = (t: TestConvex) =>
  t.action(internal.webhookIntegrations.dispatchPending, {
    tenantId: TENANT,
    scheduleNext: false,
  });
const scan = (t: TestConvex) =>
  t.action(internal.smsAlerts.scanTenant, {
    tenantId: TENANT,
    scheduleNext: false,
  });

async function ledgerTypes(t: TestConvex, entity: string) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", entity))
        .collect()
    ).map((row) => row.type),
  );
}

describe("AC-361 replaying an outbox delivery sends nothing twice", () => {
  it("two webhook runs at the same moment send once", async () => {
    const t = setup();
    const receiver = stubReceiver();
    const sourceEventId = await seedWebhook(t);

    const claim = () =>
      t.mutation(internal.webhookIntegrations.claimDelivery, {
        tenantId: TENANT,
        endpointId: "ep-replay",
        sourceEventId,
        eventType: "EventApproved",
        occurredAt: Date.now() - 5 * MINUTE,
      });
    expect((await claim()).claimed).toBe(true);
    expect((await claim()).claimed).toBe(false);

    // The direct claim above holds the send; both runs skip it.
    const runs = await Promise.all([dispatch(t), dispatch(t)]);
    expect(runs.reduce((sum, run) => sum + run.attempted, 0)).toBe(0);
    expect(receiver.posts).toEqual([]);
  });

  it("two webhook runs racing on a fresh event post it once", async () => {
    const t = setup();
    const receiver = stubReceiver();
    await seedWebhook(t);
    await Promise.all([dispatch(t), dispatch(t), dispatch(t)]);
    expect(receiver.posts).toHaveLength(1);
    expect(await ledgerTypes(t, "WebhookDelivery")).toEqual([
      "WebhookDeliverySucceeded",
    ]);
  });

  it("a webhook whose answer was lost goes again under the same id; the receiver acts once", async () => {
    const t = setup();
    const receiver = stubReceiver();
    const sourceEventId = await seedWebhook(t);
    // A run claimed and posted, then died before it saved the answer.
    await t.mutation(internal.webhookIntegrations.claimDelivery, {
      tenantId: TENANT,
      endpointId: "ep-replay",
      sourceEventId,
      eventType: "EventApproved",
      occurredAt: Date.now() - 5 * MINUTE,
    });
    receiver.acted.add(`ep-replay:${sourceEventId}:EventApproved`);
    // While the claim is fresh, nobody sends.
    expect(await dispatch(t)).toEqual({ delivered: 0, attempted: 0 });
    await t.run(async (ctx) => {
      for (const entity of ["WebhookDeliveryClaim", "WebhookDispatchTick"]) {
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

    expect(await dispatch(t)).toEqual({ delivered: 1, attempted: 1 });
    expect(receiver.posts).toEqual([
      `ep-replay:${sourceEventId}:EventApproved`,
    ]);
    expect(receiver.acted.size).toBe(1);
    await t.run(async (ctx) => {
      const ticks = await ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", "WebhookDispatchTick"))
        .collect();
      for (const row of ticks) {
        await ctx.db.patch(row._id, { createdAt: row.createdAt - 10 * MINUTE });
      }
    });
    expect(await dispatch(t)).toEqual({ delivered: 0, attempted: 0 });
  });

  it("two text-alert scans at the same moment text once", async () => {
    const t = setup();
    const receiver = stubReceiver();
    await seedSms(t);
    await Promise.all([scan(t), scan(t), scan(t)]);
    expect(receiver.posts).toEqual(["sms"]);
    expect(await ledgerTypes(t, "SmsAlert")).toEqual(["SmsAlertSent"]);
  });

  it("a text whose answer was lost is not sent again on its own", async () => {
    const t = setup();
    const receiver = stubReceiver();
    await seedSms(t);
    const [event] = await t.run(async (ctx) =>
      ctx.db.query("events").collect(),
    );
    const [person] = await t.run(async (ctx) =>
      ctx.db.query("people").collect(),
    );
    const claim = await t.mutation(internal.smsAlertClaims.claimAlert, {
      tenantId: TENANT,
      triggerKey: `event:${String(event!._id)}:t2h`,
      personId: String(person!._id),
    });
    expect(claim.claimed).toBe(true);
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", "SmsAlertClaim"))
        .collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, { createdAt: row.createdAt - HOUR });
      }
    });
    await scan(t);
    await scan(t);
    expect(receiver.posts).toEqual([]);
  });
});
