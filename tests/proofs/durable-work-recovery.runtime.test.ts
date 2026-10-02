/**
 * AC-163 (PR13-08): outside-message work survives a lost worker, has one
 * owner at a time, stops when it is cancelled, never lets one workspace's
 * failing receiver hold up another, and shows managers what is waiting,
 * stopped or "not sure". (Imports have their own durable proofs:
 * backend-durable-import and import-resume-fault-injection.)
 * Receivers are fake fetches; synthetic workspaces.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const A = "tenant-durable-a";
const B = "tenant-durable-b";
const MINUTE = 60_000;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Receiver for workspace A always fails; workspace B's always works. */
function stubReceivers() {
  const posts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      posts.push(url);
      return new Response(null, { status: url.includes("/a") ? 503 : 200 });
    }),
  );
  return posts;
}

async function seed(t: TestConvex, tenantId: string, path: string) {
  await t.mutation(internal.webhookIntegrations.recordEndpoint, {
    type: "WebhookEndpointRegistered",
    tenantId,
    endpointId: `ep-${path}`,
    url: `https://hooks.example.test/${path}`,
    label: path,
    events: ["EventApproved"],
    secret: null,
    registeredAt: Date.now() - 60 * MINUTE,
    registeredBy: "proof-manager",
  });
  return await t.run(async (ctx) =>
    String(
      await ctx.db.insert("manifestEvents", {
        type: "EventApproved",
        entity: "Event",
        entityId: `event-${path}`,
        payload: { tenantId, eventId: `event-${path}` },
        createdAt: Date.now() - 5 * MINUTE,
      }),
    ),
  );
}

async function manager(t: TestConvex, tenantId: string, role = "manager") {
  const subject = `durable-${role}-${tenantId}`;
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

const dispatch = (t: TestConvex, tenantId: string) =>
  t.action(internal.webhookIntegrations.dispatchPending, {
    tenantId,
    scheduleNext: false,
  });

const webhooksHealth = async (actor: Awaited<ReturnType<typeof manager>>) =>
  (await actor.query(api.deliveryHealth.outsideMessageHealth, {}))?.find(
    (row) => row.channel === "webhooks",
  );

describe("AC-163 durable outside-message work", () => {
  it("one workspace's failing receiver never holds up another's", async () => {
    const t = setup();
    const posts = stubReceivers();
    await seed(t, A, "a");
    await seed(t, B, "b");

    for (let tick = 0; tick < 4; tick += 1) {
      await dispatch(t, A);
      await dispatch(t, B);
      await passTime(t, 10);
    }
    expect(posts.filter((url) => url.endsWith("/a"))).toHaveLength(3);
    expect(posts.filter((url) => url.endsWith("/b"))).toHaveLength(1);

    const healthA = await webhooksHealth(await manager(t, A));
    const healthB = await webhooksHealth(await manager(t, B));
    expect(healthA).toMatchObject({ stopped: 1, delivered: 0, waiting: 0 });
    expect(healthB).toMatchObject({ stopped: 0, delivered: 1, waiting: 0 });
  });

  it("a lost worker's send shows 'not sure', then finishes under the same id", async () => {
    const t = setup();
    stubReceivers();
    const sourceEventId = await seed(t, B, "b");
    await t.mutation(internal.webhookIntegrations.claimDelivery, {
      tenantId: B,
      endpointId: "ep-b",
      sourceEventId,
      eventType: "EventApproved",
      occurredAt: Date.now() - 5 * MINUTE,
    });
    const mgr = await manager(t, B);
    // Still inside its lease: another worker leaves it alone.
    expect(await dispatch(t, B)).toEqual({ delivered: 0, attempted: 0 });
    expect(await webhooksHealth(mgr)).toMatchObject({ waiting: 1 });

    await passTime(t, 10);
    expect(await webhooksHealth(mgr)).toMatchObject({ notSure: 1 });
    expect(await dispatch(t, B)).toEqual({ delivered: 1, attempted: 1 });
    expect(await webhooksHealth(mgr)).toMatchObject({
      notSure: 0,
      delivered: 1,
    });
  });

  it("removing an endpoint cancels its waiting retries", async () => {
    const t = setup();
    const posts = stubReceivers();
    await seed(t, A, "a");
    await dispatch(t, A);
    expect(posts).toHaveLength(1);

    await t.mutation(internal.webhookIntegrations.recordEndpoint, {
      type: "WebhookEndpointRemoved",
      tenantId: A,
      endpointId: "ep-a",
      url: "https://hooks.example.test/a",
      label: "a",
      events: ["EventApproved"],
      secret: null,
      registeredAt: Date.now() - 60 * MINUTE,
      registeredBy: "proof-manager",
    });
    await passTime(t, 30);
    expect(await dispatch(t, A)).toEqual({ delivered: 0, attempted: 0 });
    expect(posts).toHaveLength(1);
  });

  it("the waiting count shows how long the oldest has waited; only managers of the workspace see it", async () => {
    const t = setup();
    stubReceivers();
    await seed(t, A, "a");
    await dispatch(t, A);
    await passTime(t, 0.5);

    const health = await webhooksHealth(await manager(t, A));
    expect(health).toMatchObject({ waiting: 1, stopped: 0 });
    expect(
      Date.now() - (health?.oldestWaitingSince ?? Date.now()),
    ).toBeGreaterThanOrEqual(0.5 * MINUTE);

    expect(
      await (
        await manager(t, A, "staff")
      ).query(api.deliveryHealth.outsideMessageHealth, {}),
    ).toBeNull();
    expect(await webhooksHealth(await manager(t, B))).toMatchObject({
      waiting: 0,
      stopped: 0,
      delivered: 0,
    });
  });
});
