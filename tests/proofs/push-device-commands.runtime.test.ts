/**
 * Runtime proof (governed writes, 2026-09-29): web push devices change only
 * through generated PushSubscription commands.
 *
 * convex/pushSubscriptions.ts register / unregister / releaseByEndpoint and
 * the delivery callback (recordDeviceResults) run createViaRegister, renew,
 * unregister, releaseDevice and recordDelivery. The commands emit the domain
 * events; a browser that changes hands (same tenant or another tenant) is
 * retired for its previous owner; a retry leaves one live row; a direct call
 * cannot take over, refresh or release someone else's device.
 */
import { convexTest } from "convex-test";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

beforeAll(ensureTestFieldEncryptionKey);

const TENANT = "tenant-push-cmd-a";
const OTHER_TENANT = "tenant-push-cmd-b";
const ENDPOINT = "https://push.example.test/device-1";

function harness() {
  const t = convexTest(schema, modules);
  const proof = createManifestTestContext({
    convexTest: (() => t) as never,
    schema,
    modules,
  });
  return { t, proof };
}
type Harness = ReturnType<typeof harness>;

async function addStaff(
  { t }: Harness,
  tenantId: string,
  subject: string,
): Promise<Id<"people">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("people", {
      tenantId,
      givenName: "Pat",
      familyName: subject,
      email: `${subject}@example.test`,
      role: "kitchen_staff",
      employmentType: "full_time",
      status: "active",
      authSubjectId: subject,
      version: 1,
    }),
  );
}

function as(h: Harness, tenantId: string, subject: string) {
  return h.proof.asRole({ subject, role: "kitchen_staff", tenantId });
}

const keys = (tag: string) => ({
  p256dh: `p256dh-${tag}`,
  auth: `auth-${tag}`,
});

async function rows({ t }: Harness) {
  return await t.run(async (ctx) =>
    ctx.db.query("pushSubscriptions").collect(),
  );
}

async function events({ t }: Harness, type: string) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).filter(
      (row) => row.type === type,
    ),
  );
}

describe("push devices change only through PushSubscription commands", () => {
  it("register creates one row through the command and a retry refreshes it", async () => {
    const h = harness();
    await addStaff(h, TENANT, "cook");
    const cook = as(h, TENANT, "cook");

    const first = (await cook.mutation(api.pushSubscriptions.register, {
      endpoint: ENDPOINT,
      ...keys("1"),
    })) as { subscriptionId: string };
    const second = (await cook.mutation(api.pushSubscriptions.register, {
      endpoint: ENDPOINT,
      ...keys("2"),
    })) as { subscriptionId: string };

    expect(second.subscriptionId).toBe(first.subscriptionId);
    const all = await rows(h);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      authSubjectId: "cook",
      p256dh: "p256dh-2",
      version: 2,
    });
    const registered = await events(h, "PushSubscriptionRegistered");
    expect(registered.map((row) => row.payload)).toEqual([
      {
        pushSubscriptionId: first.subscriptionId,
        tenantId: TENANT,
        authSubjectId: "cook",
      },
      {
        pushSubscriptionId: first.subscriptionId,
        tenantId: TENANT,
        authSubjectId: "cook",
      },
    ]);
  });

  it("a browser that changes hands is retired for its previous owners, in any tenant", async () => {
    const h = harness();
    await addStaff(h, TENANT, "cook");
    await addStaff(h, TENANT, "server");
    await addStaff(h, OTHER_TENANT, "outsider");

    const cookRow = (await as(h, TENANT, "cook").mutation(
      api.pushSubscriptions.register,
      { endpoint: ENDPOINT, ...keys("cook") },
    )) as { subscriptionId: string };
    const outsiderRow = (await as(h, OTHER_TENANT, "outsider").mutation(
      api.pushSubscriptions.register,
      { endpoint: ENDPOINT, ...keys("outsider") },
    )) as { subscriptionId: string };
    const serverRow = (await as(h, TENANT, "server").mutation(
      api.pushSubscriptions.register,
      { endpoint: ENDPOINT, ...keys("server") },
    )) as { subscriptionId: string };

    const live = (await rows(h)).filter((row) => row.deletedAt == null);
    expect(live.map((row) => String(row._id))).toEqual([
      serverRow.subscriptionId,
    ]);
    const removed = await events(h, "PushSubscriptionRemoved");
    expect(removed.map((row) => row.payload)).toEqual([
      { pushSubscriptionId: cookRow.subscriptionId, tenantId: TENANT },
      {
        pushSubscriptionId: outsiderRow.subscriptionId,
        tenantId: OTHER_TENANT,
      },
    ]);

    // The cook signs in on it again: their own row comes back, the server's goes.
    const again = (await as(h, TENANT, "cook").mutation(
      api.pushSubscriptions.register,
      { endpoint: ENDPOINT, ...keys("cook-2") },
    )) as { subscriptionId: string };
    expect(again.subscriptionId).toBe(cookRow.subscriptionId);
    const liveAfter = (await rows(h)).filter((row) => row.deletedAt == null);
    expect(liveAfter.map((row) => String(row._id))).toEqual([
      cookRow.subscriptionId,
    ]);
  });

  it("unregister is the owner's; releaseByEndpoint needs only the endpoint", async () => {
    const h = harness();
    await addStaff(h, TENANT, "cook");
    await addStaff(h, TENANT, "server");
    await as(h, TENANT, "cook").mutation(api.pushSubscriptions.register, {
      endpoint: ENDPOINT,
      ...keys("cook"),
    });

    const notOwner = (await as(h, TENANT, "server").mutation(
      api.pushSubscriptions.unregister,
      { endpoint: ENDPOINT },
    )) as { removed: number };
    expect(notOwner.removed).toBe(0);
    expect((await rows(h)).filter((row) => row.deletedAt == null)).toHaveLength(
      1,
    );

    const owner = (await as(h, TENANT, "cook").mutation(
      api.pushSubscriptions.unregister,
      { endpoint: ENDPOINT },
    )) as { removed: number };
    expect(owner.removed).toBe(1);
    expect((await rows(h)).filter((row) => row.deletedAt == null)).toEqual([]);

    await as(h, TENANT, "cook").mutation(api.pushSubscriptions.register, {
      endpoint: ENDPOINT,
      ...keys("cook-2"),
    });
    const released = (await h.t.mutation(
      api.pushSubscriptions.releaseByEndpoint,
      { endpoint: ENDPOINT },
    )) as { removed: number };
    expect(released.removed).toBe(1);
    expect((await rows(h)).filter((row) => row.deletedAt == null)).toEqual([]);
    expect(await events(h, "PushSubscriptionRemoved")).toHaveLength(2);
  });

  it("direct command calls cannot take over, refresh or release another person's device", async () => {
    const h = harness();
    await addStaff(h, TENANT, "cook");
    await addStaff(h, TENANT, "server");
    const cook = as(h, TENANT, "cook");
    const server = as(h, TENANT, "server");
    const { subscriptionId } = (await cook.mutation(
      api.pushSubscriptions.register,
      { endpoint: ENDPOINT, ...keys("cook") },
    )) as { subscriptionId: string };
    const docId = subscriptionId as Id<"pushSubscriptions">;

    await expect(
      server.mutation(api.mutations.PushSubscription_createViaRegister, {
        endpoint: ENDPOINT,
        ...keys("server"),
      }),
    ).rejects.toThrow(/already has notifications on/);
    await expect(
      server.mutation(api.mutations.PushSubscription_renew, {
        docId,
        ...keys("server"),
      }),
    ).rejects.toThrow(/own push devices/);
    await expect(
      server.mutation(api.mutations.PushSubscription_releaseDevice, {
        docId,
        endpoint: ENDPOINT,
      }),
    ).rejects.toThrow(/own push devices/);
    await expect(
      cook.mutation(api.mutations.PushSubscription_releaseDevice, {
        docId,
        endpoint: "https://push.example.test/other",
      }),
    ).rejects.toThrow(/Guard 1 failed/);
    await expect(
      cook.mutation(api.mutations.PushSubscription_recordDelivery, {
        docId,
        at: Date.now(),
      }),
    ).rejects.toThrow(/Guard 1 failed/);
    await expect(
      h.t.mutation(api.pushSubscriptions.register, {
        endpoint: ENDPOINT,
        ...keys("anon"),
      }),
    ).rejects.toThrow(/Sign in/);

    const all = await rows(h);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      authSubjectId: "cook",
      p256dh: "p256dh-cook",
    });
    expect(all[0]!.deletedAt ?? null).toBeNull();
  });

  it("delivery results record use and retire only the exact gone version", async () => {
    const h = harness();
    await addStaff(h, TENANT, "cook");
    const cook = as(h, TENANT, "cook");
    const phone = (await cook.mutation(api.pushSubscriptions.register, {
      endpoint: ENDPOINT,
      ...keys("phone"),
    })) as { subscriptionId: string };
    const tablet = (await cook.mutation(api.pushSubscriptions.register, {
      endpoint: "https://push.example.test/tablet",
      ...keys("tablet"),
    })) as { subscriptionId: string };
    const phoneId = phone.subscriptionId as Id<"pushSubscriptions">;
    const tabletId = tablet.subscriptionId as Id<"pushSubscriptions">;

    await h.t.mutation(internal.teamChatPush.recordPushResults, {
      used: [phoneId],
      gone: [{ id: tabletId, version: 0 }],
      now: 1234,
    });
    let all = await rows(h);
    expect(all.find((row) => row._id === phoneId)?.lastUsedAt).toBe(1234);
    expect(all.find((row) => row._id === tabletId)?.deletedAt).toBeUndefined();

    await h.t.mutation(internal.teamChatPush.recordPushResults, {
      used: [],
      gone: [{ id: tabletId, version: 1 }],
      now: 5678,
    });
    all = await rows(h);
    expect(all.find((row) => row._id === tabletId)?.deletedAt).toEqual(
      expect.any(Number),
    );
    const removed = await events(h, "PushSubscriptionRemoved");
    expect(removed.map((row) => row.payload)).toEqual([
      { pushSubscriptionId: tabletId, tenantId: TENANT },
    ]);
  });
});
