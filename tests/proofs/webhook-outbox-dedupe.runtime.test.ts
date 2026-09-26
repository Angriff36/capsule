/**
 * Runtime proof (AC-191 outbound-outbox slice): external follow-on work for
 * subscribed domain events goes through the durable manifestEvents outbox in
 * `convex/webhookIntegrations.ts`, and repeated dispatch ticks deliver each
 * outbox event to each endpoint exactly once. A failing endpoint is retried
 * on later ticks up to the attempt limit and then left alone, and the events
 * of one tenant never reach the endpoint of another tenant.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-outbox-a";
const OTHER_TENANT = "tenant-outbox-b";
const MINUTE = 60_000;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(null, { status });
    }),
  );
  return calls;
}

async function registerEndpoint(
  t: TestConvex,
  tenantId: string,
  endpointId: string,
  url: string,
): Promise<void> {
  await t.mutation(internal.webhookIntegrations.recordEndpoint, {
    type: "WebhookEndpointRegistered",
    tenantId,
    endpointId,
    url,
    label: endpointId,
    events: ["EventApproved"],
    secret: null,
    registeredAt: Date.now() - 10 * MINUTE,
    registeredBy: "proof-manager",
  });
}

async function emitApproved(
  t: TestConvex,
  tenantId: string,
  eventId: string,
): Promise<string> {
  return await t.run(async (ctx) =>
    String(
      await ctx.db.insert("manifestEvents", {
        type: "EventApproved",
        entity: "Event",
        entityId: eventId,
        payload: { tenantId, eventId },
        createdAt: Date.now() - 5 * MINUTE,
      }),
    ),
  );
}

/** Move earlier dispatch ticks out of the duplicate-chain collapse window so
 * the next dispatch is a real later tick, not a collapsed one. */
async function ageTicks(t: TestConvex): Promise<void> {
  await t.run(async (ctx) => {
    const ticks = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entity", (q) => q.eq("entity", "WebhookDispatchTick"))
      .collect();
    for (const tick of ticks) {
      await ctx.db.patch(tick._id, { createdAt: tick.createdAt - 2 * MINUTE });
    }
  });
}

async function dispatch(t: TestConvex, tenantId: string) {
  return await t.action(internal.webhookIntegrations.dispatchPending, {
    tenantId,
    scheduleNext: false,
  });
}

async function deliveryRows(t: TestConvex) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("manifestEvents")
      .withIndex("by_entity", (q) => q.eq("entity", "WebhookDelivery"))
      .collect(),
  );
}

describe("webhook outbox delivers each event once per endpoint", () => {
  it("repeated ticks send each outbox event once and record one success each", async () => {
    const t = setup();
    const calls = stubFetch(200);
    await registerEndpoint(t, TENANT, "ep-a", "https://hooks.example.test/a");
    const first = await emitApproved(t, TENANT, "event-1");
    const second = await emitApproved(t, TENANT, "event-2");

    expect(await dispatch(t, TENANT)).toEqual({ delivered: 2, attempted: 2 });
    await ageTicks(t);
    expect(await dispatch(t, TENANT)).toEqual({ delivered: 0, attempted: 0 });
    await ageTicks(t);
    expect(await dispatch(t, TENANT)).toEqual({ delivered: 0, attempted: 0 });

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.url)).toEqual([
      "https://hooks.example.test/a",
      "https://hooks.example.test/a",
    ]);
    const rows = await deliveryRows(t);
    expect(rows.map((row) => row.type)).toEqual([
      "WebhookDeliverySucceeded",
      "WebhookDeliverySucceeded",
    ]);
    expect(
      rows.map(
        (row) => (row.payload as { sourceEventId: string }).sourceEventId,
      ),
    ).toEqual([first, second]);
  });

  it("a tick inside the collapse window sends nothing", async () => {
    const t = setup();
    const calls = stubFetch(200);
    await registerEndpoint(t, TENANT, "ep-a", "https://hooks.example.test/a");
    await emitApproved(t, TENANT, "event-1");

    expect(await dispatch(t, TENANT)).toEqual({ delivered: 1, attempted: 1 });
    await emitApproved(t, TENANT, "event-2");
    expect(await dispatch(t, TENANT)).toEqual({ delivered: 0, attempted: 0 });
    expect(calls).toHaveLength(1);

    await ageTicks(t);
    expect(await dispatch(t, TENANT)).toEqual({ delivered: 1, attempted: 1 });
    expect(calls).toHaveLength(2);
  });

  it("a failing endpoint is retried on later ticks up to three attempts, then left alone", async () => {
    const t = setup();
    const calls = stubFetch(500);
    await registerEndpoint(t, TENANT, "ep-a", "https://hooks.example.test/a");
    await emitApproved(t, TENANT, "event-1");

    for (let tick = 0; tick < 5; tick += 1) {
      await dispatch(t, TENANT);
      await ageTicks(t);
    }

    expect(calls).toHaveLength(3);
    const rows = await deliveryRows(t);
    expect(rows.map((row) => row.type)).toEqual([
      "WebhookDeliveryFailed",
      "WebhookDeliveryFailed",
      "WebhookDeliveryFailed",
    ]);
    expect(
      rows.map((row) => (row.payload as { attempt: number }).attempt),
    ).toEqual([1, 2, 3]);
  });

  it("a later success after a failure is sent once and not retried again", async () => {
    const t = setup();
    stubFetch(500);
    await registerEndpoint(t, TENANT, "ep-a", "https://hooks.example.test/a");
    await emitApproved(t, TENANT, "event-1");
    await dispatch(t, TENANT);
    await ageTicks(t);

    const calls = stubFetch(200);
    expect(await dispatch(t, TENANT)).toEqual({ delivered: 1, attempted: 1 });
    await ageTicks(t);
    expect(await dispatch(t, TENANT)).toEqual({ delivered: 0, attempted: 0 });
    expect(calls).toHaveLength(1);
  });

  it("only the newest dispatch chain keeps running; older chains end", async () => {
    const t = setup();
    const calls = stubFetch(200);
    await registerEndpoint(t, TENANT, "ep-a", "https://hooks.example.test/a");
    await registerEndpoint(t, TENANT, "ep-b", "https://hooks.example.test/b");
    await t.mutation(internal.webhookIntegrations.recordChainStart, {
      tenantId: TENANT,
      chainId: "chain-old",
    });
    await t.mutation(internal.webhookIntegrations.recordChainStart, {
      tenantId: TENANT,
      chainId: "chain-new",
    });
    await emitApproved(t, TENANT, "event-1");

    const chainTick = (chainId?: string) =>
      t.action(internal.webhookIntegrations.dispatchPending, {
        tenantId: TENANT,
        scheduleNext: true,
        chainId,
      });
    const scheduledChains = () =>
      t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).map(
          (job) => (job.args[0] as { chainId?: string }).chainId,
        ),
      );

    expect(await chainTick("chain-old")).toEqual({
      delivered: 0,
      attempted: 0,
    });
    expect(await chainTick(undefined)).toEqual({ delivered: 0, attempted: 0 });
    expect(await scheduledChains()).toEqual([]);
    expect(calls).toHaveLength(0);

    expect(await chainTick("chain-new")).toEqual({
      delivered: 2,
      attempted: 2,
    });
    expect(await scheduledChains()).toEqual(["chain-new"]);
  });

  it("events of one tenant never reach the endpoint of another tenant", async () => {
    const t = setup();
    const calls = stubFetch(200);
    await registerEndpoint(t, TENANT, "ep-a", "https://hooks.example.test/a");
    await registerEndpoint(
      t,
      OTHER_TENANT,
      "ep-b",
      "https://hooks.example.test/b",
    );
    await emitApproved(t, TENANT, "event-a");

    expect(await dispatch(t, OTHER_TENANT)).toEqual({
      delivered: 0,
      attempted: 0,
    });
    expect(await dispatch(t, TENANT)).toEqual({ delivered: 1, attempted: 1 });
    expect(calls.map((call) => call.url)).toEqual([
      "https://hooks.example.test/a",
    ]);
    const rows = await deliveryRows(t);
    expect(
      rows.map((row) => (row.payload as { tenantId: string }).tenantId),
    ).toEqual([TENANT]);
  });
});
