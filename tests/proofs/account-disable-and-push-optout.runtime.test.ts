/**
 * AC-153 (PR12-07): switching a person off takes effect on the sign-in they
 * already have open — the next read comes back empty and the next change is
 * refused, with no new sign-in. Phone alerts follow the account's switch on
 * the server: turning team-chat alerts off from one device stops every
 * device of that account, and a switched-off person gets no alerts at all,
 * even with the switch left on. Synthetic workspace.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-account-disable";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const base = {
      tenantId,
      familyName: "Proof",
      employmentType: "full_time",
      status: "active",
      deletedAt: null,
      version: 1,
    };
    const ownerId = (await ctx.db.insert("people", {
      ...base,
      givenName: "Olive",
      email: "olive@example.test",
      role: "owner",
      authSubjectId: "disable-owner",
    } as never)) as Id<"people">;
    const salesId = (await ctx.db.insert("people", {
      ...base,
      givenName: "Sam",
      email: "sam@example.test",
      role: "sales_manager",
      authSubjectId: "disable-sales",
    } as never)) as Id<"people">;
    for (const endpoint of ["phone", "laptop"]) {
      await ctx.db.insert("pushSubscriptions", {
        tenantId,
        authSubjectId: "disable-sales",
        personId: salesId,
        endpoint: `https://push.example.test/${endpoint}`,
        p256dh: "key",
        auth: "secret",
        deletedAt: null,
        version: 1,
      });
    }
    return { ownerId, salesId };
  });
}

async function sendDm(
  t: ReturnType<typeof convexTest>,
  from: Id<"people">,
  to: Id<"people">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("staffMessages", {
      tenantId,
      senderPersonId: from,
      recipientPersonId: to,
      senderAuthSubjectId: "disable-owner",
      recipientAuthSubjectId: "disable-sales",
      body: "encrypted",
      deletedAt: null,
      version: 1,
    }),
  );
}

async function pushTargets(
  t: ReturnType<typeof convexTest>,
  messageId: Id<"staffMessages">,
) {
  const job = await t.query(internal.teamChatPush.buildPushJob, {
    messageId,
    now: Date.now(),
  });
  return job?.targets.map((target) => target.endpoint).sort() ?? [];
}

describe("AC-153 switching access and alerts off reaches open sign-ins and every device", () => {
  it("a switched-off person is refused on the sign-in they already have", async () => {
    const t = convexTest(schema, modules);
    const { salesId } = await seed(t);
    const owner = t.withIdentity({
      subject: "disable-owner",
      tokenIdentifier: "proof|owner",
      tenantId,
    });
    // The same sign-in all the way through, still carrying company claims.
    const sales = t.withIdentity({
      subject: "disable-sales",
      tokenIdentifier: "proof|sales",
      role: "org:owner",
      tenantId,
    });
    const { docId: clientId } = (await sales.mutation(
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Before the switch" },
    )) as { docId: Id<"clients"> };
    expect(
      ((await sales.query(api.queries.listClient, {})) as unknown[]).length,
    ).toBe(1);

    await owner.mutation(api.mutations.Person_deactivate, {
      docId: salesId,
      version: 1,
    });

    expect(await sales.query(api.authStatus.getAuthStatus, {})).toMatchObject({
      hasTenant: false,
      role: "anonymous",
    });
    expect(await sales.query(api.queries.listClient, {})).toEqual([]);
    expect(await sales.query(api.queries.getClient, { id: clientId })).toBe(
      null,
    );
    expect(
      await refused(() =>
        sales.mutation(api.mutations.Client_createViaRegister, {
          clientType: "company",
          companyName: "After the switch",
        }),
      ),
    ).toBe(true);
    expect(
      await refused(() =>
        sales.mutation(api.chatNotifyPreference.set, { enabled: true }),
      ),
    ).toBe(true);
  });

  it("alerts off on one device stops every device; a switched-off person gets none", async () => {
    const t = convexTest(schema, modules);
    const { ownerId, salesId } = await seed(t);
    const owner = t.withIdentity({
      subject: "disable-owner",
      tokenIdentifier: "proof|owner",
      tenantId,
    });
    const sales = t.withIdentity({
      subject: "disable-sales",
      tokenIdentifier: "proof|sales-phone",
      tenantId,
    });

    // Default is off: no device is woken.
    expect(await pushTargets(t, await sendDm(t, ownerId, salesId))).toEqual([]);

    await sales.mutation(api.chatNotifyPreference.set, { enabled: true });
    expect(await pushTargets(t, await sendDm(t, ownerId, salesId))).toEqual([
      "https://push.example.test/laptop",
      "https://push.example.test/phone",
    ]);

    // Turned off from the phone: the laptop, which never reopened the app,
    // stops too.
    await sales.mutation(api.chatNotifyPreference.set, { enabled: false });
    expect(await sales.query(api.chatNotifyPreference.mine, {})).toBe(false);
    expect(await pushTargets(t, await sendDm(t, ownerId, salesId))).toEqual([]);

    // Switched back on, then the person is switched off: nothing is sent to
    // any of their devices although their alert switch still says on.
    await sales.mutation(api.chatNotifyPreference.set, { enabled: true });
    await owner.mutation(api.mutations.Person_deactivate, {
      docId: salesId,
      version: 1,
    });
    expect(await pushTargets(t, await sendDm(t, ownerId, salesId))).toEqual([]);
  });
});
