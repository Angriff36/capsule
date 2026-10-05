/**
 * Replacement dossier (Nowsta reminders): a phone alert that does not reach a
 * phone shows to managers in Outside messages and on the System health list,
 * with whose phone it is, instead of only a server log line. One ledger row
 * per failure spell; a later alert that arrives, or turning alerts on again,
 * clears it; another company never sees it. Synthetic workspaces.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { classifyHealth } from "../../src/lib/operationalHealth";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const A = "tenant-phone-a";
const B = "tenant-phone-b";

async function person(
  t: TestConvex,
  tenantId: string,
  role: string,
  givenName: string,
) {
  const subject = `phone-${role}-${givenName}-${tenantId}`;
  const personId = await t.run(async (ctx) =>
    ctx.db.insert("people", {
      tenantId,
      givenName,
      familyName: "Proof",
      email: `${subject}@proof.test`,
      role,
      employmentType: "full_time",
      status: "active",
      deletedAt: null,
      version: 1,
      authSubjectId: subject,
    } as never),
  );
  return {
    personId: personId as Id<"people">,
    actor: t.withIdentity({
      subject,
      tokenIdentifier: `proof|${subject}`,
      tenantId,
    }),
  };
}

async function phone(t: TestConvex, tenantId: string, personId: Id<"people">) {
  return await t.run(async (ctx) =>
    ctx.db.insert("pushSubscriptions", {
      tenantId,
      authSubjectId: `phone-owner-${String(personId)}`,
      personId,
      endpoint: `https://push.example.test/${String(personId)}`,
      p256dh: "key",
      auth: "auth",
      createdAt: 1,
      updatedAt: 1,
      version: 1,
    }),
  );
}

const phoneHealth = async (actor: { query: TestConvex["query"] }) =>
  (await actor.query(api.deliveryHealth.outsideMessageHealth, {}))?.find(
    (row) => row.channel === "phoneAlerts",
  );

const failureRows = (t: TestConvex) =>
  t.run(async (ctx) =>
    ctx.db
      .query("manifestEvents")
      .withIndex("by_entity", (q) => q.eq("entity", "PushDevice"))
      .collect(),
  );

describe("phone alerts that do not arrive reach managers", () => {
  it("shows whose phone missed the alert, once per spell, until it gets one", async () => {
    const t = setup();
    const { actor: manager } = await person(t, A, "manager", "Mo");
    const { personId: cook } = await person(t, A, "staff", "Ana");
    const { actor: otherManager } = await person(t, B, "manager", "Bo");
    const cookPhone = await phone(t, A, cook);

    expect(await phoneHealth(manager)).toMatchObject({
      delivered: 0,
      stopped: 0,
    });

    await t.mutation(internal.teamChatPush.recordPushResults, {
      used: [],
      gone: [],
      failed: [cookPhone],
      now: 1_000,
    });
    // Run-of-show sends report through their own step; same spell, no new row.
    await t.mutation(internal.runOfShowAlerts.recordRunPushResults, {
      alertKey: { activityId: "activity-1", kind: "start" },
      used: [],
      gone: [],
      failed: [cookPhone],
      now: 2_000,
    });
    expect(await failureRows(t)).toHaveLength(1);

    const missed = await phoneHealth(manager);
    expect(missed).toMatchObject({
      label: "Phone alerts",
      stopped: 1,
      delivered: 0,
      missedBy: ["Ana Proof"],
    });
    const alerts = classifyHealth({
      now: 3_000,
      pageBuild: null,
      backend: undefined,
      messages: missed ? [missed] : [],
      calendar: null,
      quickBooks: null,
    });
    expect(alerts).toEqual([
      expect.objectContaining({
        key: "phoneAlerts-missed",
        level: "check",
        title: "1 phone did not get the last alert",
      }),
    ]);
    expect(alerts[0]?.detail).toContain("Ana Proof");

    // Another company sees nothing of it.
    expect(await phoneHealth(otherManager)).toMatchObject({
      stopped: 0,
      delivered: 0,
      missedBy: [],
    });
    // Not for staff.
    const { actor: staff } = await person(t, A, "staff", "Cy");
    expect(
      await staff.query(api.deliveryHealth.outsideMessageHealth, {}),
    ).toBeNull();

    // The next alert arrives: the phone counts as getting alerts again.
    await t.mutation(internal.teamChatPush.recordPushResults, {
      used: [cookPhone],
      gone: [],
      failed: [],
      now: 4_000,
    });
    expect(await phoneHealth(manager)).toMatchObject({
      stopped: 0,
      delivered: 1,
      missedBy: [],
    });

    // A new failure after that starts a new spell (a second row).
    await t.mutation(internal.teamChatPush.recordPushResults, {
      used: [],
      gone: [],
      failed: [cookPhone],
      now: 5_000,
    });
    expect(await failureRows(t)).toHaveLength(2);
    expect(await phoneHealth(manager)).toMatchObject({ stopped: 1 });

    // Turning phone alerts on again (the row is refreshed) clears it too.
    await t.run(async (ctx) => {
      await ctx.db.patch(cookPhone, { updatedAt: 6_000, version: 2 });
    });
    expect(await phoneHealth(manager)).toMatchObject({ stopped: 0 });
  });

  it("a removed phone drops out and is not recorded", async () => {
    const t = setup();
    const { actor: manager } = await person(t, A, "manager", "Mo");
    const { personId: cook } = await person(t, A, "staff", "Ana");
    const cookPhone = await phone(t, A, cook);
    await t.run(async (ctx) => {
      await ctx.db.patch(cookPhone, { deletedAt: 10 });
    });
    await t.mutation(internal.teamChatPush.recordPushResults, {
      used: [],
      gone: [],
      failed: [cookPhone],
      now: 1_000,
    });
    expect(await failureRows(t)).toHaveLength(0);
    expect(await phoneHealth(manager)).toMatchObject({ stopped: 0 });
  });
});
