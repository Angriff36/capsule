/**
 * Runtime proof (governed writes, 2026-09-29): the run-of-show alert switch
 * and its sent-alert ledger change only through generated commands.
 *
 * convex/runOfShowAlerts.ts claimLoop / recordDisabled run
 * RunAlertSetting.create / enable / disable, and recordRunPushResults runs
 * RunAlertDelivery.record, each as the tenant's system role. Tenants whose
 * switch and sent alerts live only in the legacy hand-written manifestEvents
 * rows keep working: a legacy enabled loop keeps its ownership until the
 * switch is next used, and a legacy sent alert is not sent again. Nobody can
 * run these commands directly.
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

const TENANT = "tenant-run-alert-governed";

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

async function legacyEnable({ t }: Harness, ownsLoop: boolean) {
  return await t.run(async (ctx) =>
    String(
      await ctx.db.insert("manifestEvents", {
        type: "RunAlertsEnabled",
        entity: "RunAlertConfig",
        entityId: TENANT,
        payload: ownsLoop
          ? { tenantId: TENANT, actorId: null, ownsLoop: true }
          : { tenantId: TENANT, actorId: null },
        createdAt: Date.now(),
      }),
    ),
  );
}

const mayScan = (h: Harness, generation?: string) =>
  h.t.query(internal.runOfShowAlerts.mayScan, {
    tenantId: TENANT,
    ...(generation ? { generation } : {}),
  });

async function events({ t }: Harness, type: string) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).filter(
      (row) => row.type === type,
    ),
  );
}

describe("run-of-show alert switch", () => {
  it("claim and disable run RunAlertSetting commands and own the loop by generation", async () => {
    const h = harness();

    const first = await h.t.mutation(internal.runOfShowAlerts.claimLoop, {
      tenantId: TENANT,
      actorId: "manager-1",
    });
    expect(first).toEqual(expect.any(String));
    expect(
      await h.t.mutation(internal.runOfShowAlerts.claimLoop, {
        tenantId: TENANT,
      }),
    ).toBeNull();
    expect(await mayScan(h, first!)).toBe(true);
    expect(await mayScan(h)).toBe(false);

    await h.t.mutation(internal.runOfShowAlerts.recordDisabled, {
      tenantId: TENANT,
      actorId: "manager-1",
    });
    expect(await mayScan(h, first!)).toBe(false);
    const second = await h.t.mutation(internal.runOfShowAlerts.claimLoop, {
      tenantId: TENANT,
    });
    expect(second).not.toBe(first);
    expect(await mayScan(h, first!)).toBe(false);
    expect(await mayScan(h, second!)).toBe(true);

    const settings = await h.t.run(async (ctx) =>
      ctx.db.query("runAlertSettings").collect(),
    );
    expect(settings).toEqual([
      expect.objectContaining({
        tenantId: TENANT,
        enabled: true,
        generation: second,
      }),
    ]);
    expect(await events(h, "RunAlertsEnabled")).toHaveLength(2);
    expect((await events(h, "RunAlertsDisabled")).map((row) => row.payload))
      .toEqual([
        {
          runAlertSettingId: settings[0]!._id,
          tenantId: TENANT,
          actorId: "manager-1",
        },
      ]);
  });

  it("a legacy enabled tenant keeps its loop until the switch is next used", async () => {
    const h = harness();
    const legacyGeneration = await legacyEnable(h, true);

    expect(await mayScan(h, legacyGeneration)).toBe(true);
    expect(
      await h.t.mutation(internal.runOfShowAlerts.claimLoop, {
        tenantId: TENANT,
      }),
    ).toBeNull();

    await h.t.mutation(internal.runOfShowAlerts.recordDisabled, {
      tenantId: TENANT,
    });
    expect(await mayScan(h, legacyGeneration)).toBe(false);
    const generation = await h.t.mutation(
      internal.runOfShowAlerts.claimLoop,
      { tenantId: TENANT },
    );
    expect(await mayScan(h, generation!)).toBe(true);
    expect(await mayScan(h, legacyGeneration)).toBe(false);
  });

  it("a pre-generation legacy loop scans until the switch is next used", async () => {
    const h = harness();
    await legacyEnable(h, false);
    expect(await mayScan(h)).toBe(true);

    await h.t.mutation(internal.runOfShowAlerts.claimLoop, {
      tenantId: TENANT,
    });
    // Enabled already (legacy), so claim is a no-op and the old loop stays.
    expect(await mayScan(h)).toBe(true);

    await h.t.mutation(internal.runOfShowAlerts.recordDisabled, {
      tenantId: TENANT,
    });
    await h.t.mutation(internal.runOfShowAlerts.claimLoop, {
      tenantId: TENANT,
    });
    expect(await mayScan(h)).toBe(false);
  });

  it("nobody runs the switch or the ledger commands directly", async () => {
    const h = harness();
    await h.t.run(async (ctx) =>
      ctx.db.insert("people", {
        tenantId: TENANT,
        givenName: "Pat",
        familyName: "Owner",
        email: "owner@example.test",
        role: "owner",
        employmentType: "full_time",
        status: "active",
        authSubjectId: "owner",
        version: 1,
      }),
    );
    const owner = h.proof.asRole({
      subject: "owner",
      role: "owner",
      tenantId: TENANT,
    });
    await h.t.mutation(internal.runOfShowAlerts.recordDisabled, {
      tenantId: TENANT,
    });
    const [setting] = await h.t.run(async (ctx) =>
      ctx.db.query("runAlertSettings").collect(),
    );

    await expect(
      owner.mutation(api.mutations.RunAlertSetting_enable, {
        docId: setting!._id as Id<"runAlertSettings">,
        generation: "forged",
      }),
    ).rejects.toThrow(/Guard 0 failed/);
    await expect(
      owner.mutation(api.mutations.RunAlertSetting_create, {}),
    ).rejects.toThrow(/Guard 0 failed/);
    await expect(
      owner.mutation(api.mutations.RunAlertDelivery_createViaRecord, {
        activityId: "activity-1",
        kind: "start",
      }),
    ).rejects.toThrow(/Guard 0 failed/);
  });
});

describe("run-of-show sent-alert ledger", () => {
  async function activity({ t }: Harness): Promise<string> {
    return await t.run(async (ctx) => {
      const eventId = await ctx.db.insert("events", {
        tenantId: TENANT,
        title: "Garden Wedding",
        eventType: "wedding",
        stage: "executing",
        startsAt: Date.now(),
        version: 1,
      });
      return String(
        await ctx.db.insert("eventTimelineActivities", {
          tenantId: TENANT,
          eventId,
          name: "Pass appetizers",
          startsAt: Date.now(),
          version: 1,
        }),
      );
    });
  }

  async function device({ t }: Harness): Promise<Id<"pushSubscriptions">> {
    return await t.run(async (ctx) => {
      const personId = await ctx.db.insert("people", {
        tenantId: TENANT,
        givenName: "Pat",
        familyName: "Cook",
        email: "cook@example.test",
        role: "kitchen_staff",
        employmentType: "full_time",
        status: "active",
        authSubjectId: "cook",
        version: 1,
      });
      return await ctx.db.insert("pushSubscriptions", {
        tenantId: TENANT,
        authSubjectId: "cook",
        personId,
        endpoint: "phone-1",
        p256dh: "p",
        auth: "a",
        version: 1,
      });
    });
  }

  it("a delivered alert is recorded once through RunAlertDelivery.record", async () => {
    const h = harness();
    const activityId = await activity(h);
    const phone = await device(h);
    const record = () =>
      h.t.mutation(internal.runOfShowAlerts.recordRunPushResults, {
        alertKey: { activityId, kind: "start" },
        used: [phone],
        gone: [],
        now: Date.now(),
      });

    await record();
    await record();

    const rows = await h.t.run(async (ctx) =>
      ctx.db.query("runAlertDeliveries").collect(),
    );
    expect(rows).toEqual([
      expect.objectContaining({ tenantId: TENANT, activityId, kind: "start" }),
    ]);
    const sent = await events(h, "RunAlertSent");
    expect(sent.map((row) => [row.entity, row.payload])).toEqual([
      ["RunAlertDelivery", { activityId, kind: "start" }],
    ]);
  });

  it("an alert on the legacy ledger is not recorded again", async () => {
    const h = harness();
    const activityId = await activity(h);
    const phone = await device(h);
    await h.t.run(async (ctx) =>
      ctx.db.insert("manifestEvents", {
        type: "RunAlertSent",
        entity: "RunAlert",
        entityId: activityId,
        payload: { activityId, kind: "start" },
        createdAt: Date.now(),
      }),
    );

    await h.t.mutation(internal.runOfShowAlerts.recordRunPushResults, {
      alertKey: { activityId, kind: "start" },
      used: [phone],
      gone: [],
      now: Date.now(),
    });

    expect(
      await h.t.run(async (ctx) => ctx.db.query("runAlertDeliveries").collect()),
    ).toEqual([]);
  });
});
