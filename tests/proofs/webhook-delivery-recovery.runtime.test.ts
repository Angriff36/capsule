/**
 * AC-347 / AC-361 / AC-108 (webhook leg): outbound webhook work waits longer
 * after each failure, stops after the attempt limit (or at once for an error
 * that will not fix itself), shows "stopped" to a manager, and a manager's
 * "Try again" starts a fresh attempt budget. Every try of one event to one
 * endpoint carries the same delivery id, so a send whose answer Capsule never
 * saw (crash after the receiver took it) is resent with that id and the
 * receiver can drop the repeat. A failure that a later success passed is
 * still retried. The receiver is a fake fetch; synthetic workspaces.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-webhook-recovery";
const OTHER = "tenant-webhook-other";
const MINUTE = 60_000;

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Call {
  deliveryId: string | null;
  body: { deliveryId?: string };
}

/** status per call, in order; the last one repeats. */
function stubFetch(...statuses: number[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        _url: string,
        init: { body: string; headers: Record<string, string> },
      ) => {
        calls.push({
          deliveryId: init.headers["X-Capsule-Delivery-Id"] ?? null,
          body: JSON.parse(init.body),
        });
        const status = statuses[Math.min(calls.length, statuses.length) - 1];
        return new Response(null, { status });
      },
    ),
  );
  return calls;
}

async function seedManager(t: TestConvex, tenantId: string, subject: string) {
  await t.run(async (ctx) => {
    (await ctx.db.insert("people", {
      tenantId,
      givenName: "Mona",
      familyName: "Proof",
      email: `${subject}@proof.test`,
      role: "manager",
      employmentType: "full_time",
      status: "active",
      deletedAt: null,
      version: 1,
      authSubjectId: subject,
    } as never)) as Id<"people">;
  });
  return t.withIdentity({
    subject,
    tokenIdentifier: `proof|${subject}`,
    tenantId,
  });
}

async function registerEndpoint(t: TestConvex, tenantId: string, id: string) {
  await t.mutation(internal.webhookIntegrations.recordEndpoint, {
    type: "WebhookEndpointRegistered",
    tenantId,
    endpointId: id,
    url: `https://hooks.example.test/${id}`,
    label: id,
    events: ["EventApproved"],
    secret: null,
    registeredAt: Date.now() - 60 * MINUTE,
    registeredBy: "proof-manager",
  });
}

async function emitApproved(
  t: TestConvex,
  tenantId: string,
  eventId: string,
  minutesAgo: number,
): Promise<string> {
  return await t.run(async (ctx) =>
    String(
      await ctx.db.insert("manifestEvents", {
        type: "EventApproved",
        entity: "Event",
        entityId: eventId,
        payload: { tenantId, eventId },
        createdAt: Date.now() - minutesAgo * MINUTE,
      }),
    ),
  );
}

/** Move every earlier tick and try back in time, as if real time passed. */
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

const dispatch = (t: TestConvex, tenantId = TENANT) =>
  t.action(internal.webhookIntegrations.dispatchPending, {
    tenantId,
    scheduleNext: false,
  });

describe("webhook deliveries recover safely", () => {
  it("waits one minute, then two, between tries and stops after three", async () => {
    const t = setup();
    const calls = stubFetch(503);
    await registerEndpoint(t, TENANT, "ep-a");
    await emitApproved(t, TENANT, "event-1", 5);

    expect(await dispatch(t)).toEqual({ delivered: 0, attempted: 1 });
    // Tick 40 s later: the one-minute wait has not passed.
    await passTime(t, 0.7);
    expect(await dispatch(t)).toEqual({ delivered: 0, attempted: 0 });
    await passTime(t, 0.5);
    expect(await dispatch(t)).toEqual({ delivered: 0, attempted: 1 });
    // The second wait is two minutes.
    await passTime(t, 1.2);
    expect(await dispatch(t)).toEqual({ delivered: 0, attempted: 0 });
    await passTime(t, 1);
    expect(await dispatch(t)).toEqual({ delivered: 0, attempted: 1 });
    await passTime(t, 120);
    expect(await dispatch(t)).toEqual({ delivered: 0, attempted: 0 });
    expect(calls).toHaveLength(3);

    const manager = await seedManager(t, TENANT, "mgr-a");
    const [state] = await manager.query(
      api.webhookDeliveries.listDeliveryStates,
      {},
    );
    expect(state).toMatchObject({
      state: "terminal_failed",
      attemptCount: 3,
      maxAttempts: 3,
      nextRetryAt: null,
      lastHttpStatus: 503,
      problem: "The other system had a problem.",
    });
  });

  it("an error that will not fix itself stops at once and shows only fixed words", async () => {
    const t = setup();
    const calls = stubFetch(404);
    await registerEndpoint(t, TENANT, "ep-a");
    await emitApproved(t, TENANT, "event-1", 5);

    await dispatch(t);
    await passTime(t, 120);
    expect(await dispatch(t)).toEqual({ delivered: 0, attempted: 0 });
    expect(calls).toHaveLength(1);

    const manager = await seedManager(t, TENANT, "mgr-a");
    const [state] = await manager.query(
      api.webhookDeliveries.listDeliveryStates,
      {},
    );
    expect(state).toMatchObject({
      state: "terminal_failed",
      attemptCount: 1,
      problem: "The address was not found.",
    });
  });

  it("a manager's Try again gives a stopped delivery a fresh budget, with the same delivery id", async () => {
    const t = setup();
    const calls = stubFetch(500, 500, 500, 200);
    await registerEndpoint(t, TENANT, "ep-a");
    const sourceEventId = await emitApproved(t, TENANT, "event-1", 5);
    for (let tick = 0; tick < 4; tick += 1) {
      await dispatch(t);
      await passTime(t, 10);
    }
    expect(calls).toHaveLength(3);

    const manager = await seedManager(t, TENANT, "mgr-a");
    await manager.mutation(api.webhookDeliveries.retryDelivery, {
      endpointId: "ep-a",
      sourceEventId,
      eventType: "EventApproved",
    });
    await passTime(t, 1);
    expect(await dispatch(t)).toEqual({ delivered: 1, attempted: 1 });
    expect(calls).toHaveLength(4);
    expect(new Set(calls.map((call) => call.deliveryId))).toEqual(
      new Set([`ep-a:${sourceEventId}:EventApproved`]),
    );
    expect(
      calls.every((call) => call.body.deliveryId === calls[0].deliveryId),
    ).toBe(true);

    // Delivered is final: no more sends, and Try again is refused.
    await passTime(t, 120);
    expect(await dispatch(t)).toEqual({ delivered: 0, attempted: 0 });
    await expect(
      manager.mutation(api.webhookDeliveries.retryDelivery, {
        endpointId: "ep-a",
        sourceEventId,
        eventType: "EventApproved",
      }),
    ).rejects.toThrow("already delivered");
  });

  it("Try again is for a manager of the same workspace only", async () => {
    const t = setup();
    stubFetch(500);
    await registerEndpoint(t, TENANT, "ep-a");
    const sourceEventId = await emitApproved(t, TENANT, "event-1", 5);
    await dispatch(t);

    const outsider = await seedManager(t, OTHER, "mgr-other");
    await expect(
      outsider.mutation(api.webhookDeliveries.retryDelivery, {
        endpointId: "ep-a",
        sourceEventId,
        eventType: "EventApproved",
      }),
    ).rejects.toThrow("no longer exists");
    expect(
      await outsider.query(api.webhookDeliveries.listDeliveryStates, {}),
    ).toEqual([]);
  });

  it("a send whose answer was lost is resent with the same delivery id, and a passed failure is still retried", async () => {
    const t = setup();
    const calls = stubFetch(200);
    await registerEndpoint(t, TENANT, "ep-a");
    const early = await emitApproved(t, TENANT, "event-early", 6);
    const late = await emitApproved(t, TENANT, "event-late", 5);

    // The early event failed on the last tick; the later one got through, so
    // the success watermark is past the early event.
    await t.mutation(internal.webhookIntegrations.recordDelivery, {
      tenantId: TENANT,
      deliveryId: "d-early",
      endpointId: "ep-a",
      sourceEventId: early,
      eventType: "EventApproved",
      status: "failed",
      attempt: 1,
      httpStatus: null,
      error: "Endpoint timed out.",
      errorClass: "timeout",
      occurredAt: Date.now() - 6 * MINUTE,
      deliveredAt: Date.now() - 3 * MINUTE,
    });
    await t.mutation(internal.webhookIntegrations.recordDelivery, {
      tenantId: TENANT,
      deliveryId: "d-late",
      endpointId: "ep-a",
      sourceEventId: late,
      eventType: "EventApproved",
      status: "succeeded",
      attempt: 1,
      httpStatus: 200,
      error: null,
      occurredAt: Date.now() - 5 * MINUTE,
      deliveredAt: Date.now() - 3 * MINUTE,
    });

    expect(await dispatch(t)).toEqual({ delivered: 1, attempted: 1 });
    expect(calls.map((call) => call.deliveryId)).toEqual([
      `ep-a:${early}:EventApproved`,
    ]);
  });
});
