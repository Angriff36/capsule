/**
 * Runtime proof (AC-191 SMS outbox slice): high-urgency SMS alerts go out
 * through `convex/smsAlerts.ts` (state in the governed SmsAlertSetting /
 * SmsAlertDelivery entities since 2026-09-29, legacy ledger rows still
 * honored), and
 * repeated scans send each alert to each opted-in person exactly once. A
 * failing send is retried on later scans up to three attempts and then left
 * alone, and the alerts of one tenant never reach the people of another.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-sms-a";
const OTHER_TENANT = "tenant-sms-b";
const HOUR = 60 * 60_000;

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-proof");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "proof-token");
  vi.stubEnv("TWILIO_FROM_NUMBER", "+15550000000");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubTwilio(ok: boolean) {
  const calls: Array<{ to: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
      calls.push({ to: String(init.body.get("To")) });
      return ok
        ? Response.json({ sid: "SM" + calls.length })
        : Response.json(
            { message: "Invalid number", code: 21211 },
            { status: 400 },
          );
    }),
  );
  return calls;
}

function manager(t: TestConvex, tenantId: string, role = "manager") {
  return t.withIdentity({
    subject: `proof-${role}-${tenantId}`,
    org_id: tenantId,
    role,
  });
}

/** Governed enable: the manager's own identity through SmsAlertSetting. */
async function enable(
  t: TestConvex,
  tenantId: string,
  chainId = `chain-${tenantId}`,
): Promise<void> {
  await manager(t, tenantId).mutation(internal.smsAlerts.setEnabled, {
    enabled: true,
    chainId,
  });
}

/** A hand-written row exactly as the pre-2026-09-29 code wrote it. */
async function legacyLedgerRow(
  t: TestConvex,
  tenantId: string,
  entity: "SmsAlertConfig" | "SmsAlert",
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("manifestEvents", {
      type,
      entity,
      entityId: tenantId,
      payload: { tenantId, ...payload },
      createdAt: Date.now(),
    });
  });
}

async function addPerson(
  t: TestConvex,
  tenantId: string,
  phone: string,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("people", {
      tenantId,
      givenName: "Pat",
      familyName: "Cook",
      email: phone + "@example.test",
      phone,
      role: "kitchen_staff",
      employmentType: "full_time",
      status: "active",
      smsAlertsOptIn: true,
      version: 1,
    });
  });
}

async function addEventSoon(t: TestConvex, tenantId: string): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("events", {
      tenantId,
      title: "Garden Wedding",
      eventType: "wedding",
      stage: "executing",
      startsAt: Date.now() + HOUR,
      version: 1,
    });
  });
}

async function scan(t: TestConvex, tenantId: string) {
  return await t.action(internal.smsAlerts.scanTenant, {
    tenantId,
    scheduleNext: false,
  });
}

/** Send outcomes: events emitted by the SmsAlertDelivery commands. */
async function alertRows(t: TestConvex) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", "SmsAlertDelivery"))
        .collect()
    ).map((row) => ({
      type: row.type,
      tenantId: (row.payload as { tenantId: string }).tenantId,
    })),
  );
}

describe("SMS outbox sends each alert once per person", () => {
  it("repeated scans send each alert once and record one success each", async () => {
    const t = setup();
    const calls = stubTwilio(true);
    await enable(t, TENANT);
    await addPerson(t, TENANT, "5551110001");
    await addPerson(t, TENANT, "5551110002");
    await addEventSoon(t, TENANT);

    expect(await scan(t, TENANT)).toMatchObject({ sent: 2, failed: 0 });
    expect(await scan(t, TENANT)).toMatchObject({ sent: 0, skipped: 2 });
    expect(await scan(t, TENANT)).toMatchObject({ sent: 0, skipped: 2 });

    expect(calls.map((call) => call.to)).toEqual([
      "+15551110001",
      "+15551110002",
    ]);
    expect((await alertRows(t)).map((row) => row.type)).toEqual([
      "SmsAlertSent",
      "SmsAlertSent",
    ]);
  });

  it("a failing send is retried on later scans up to three attempts, then left alone", async () => {
    const t = setup();
    const calls = stubTwilio(false);
    await enable(t, TENANT);
    await addPerson(t, TENANT, "5551110001");
    await addEventSoon(t, TENANT);

    for (let tick = 0; tick < 5; tick += 1) await scan(t, TENANT);

    expect(calls).toHaveLength(3);
    expect((await alertRows(t)).map((row) => row.type)).toEqual([
      "SmsAlertFailed",
      "SmsAlertFailed",
      "SmsAlertFailed",
    ]);
  });

  it("a later success after a failure is sent once and not sent again", async () => {
    const t = setup();
    stubTwilio(false);
    await enable(t, TENANT);
    await addPerson(t, TENANT, "5551110001");
    await addEventSoon(t, TENANT);
    await scan(t, TENANT);

    const calls = stubTwilio(true);
    expect(await scan(t, TENANT)).toMatchObject({ sent: 1, failed: 0 });
    expect(await scan(t, TENANT)).toMatchObject({ sent: 0, skipped: 1 });
    expect(calls).toHaveLength(1);
  });

  it("alerts of one tenant never reach the people of another tenant", async () => {
    const t = setup();
    const calls = stubTwilio(true);
    await enable(t, TENANT);
    await enable(t, OTHER_TENANT);
    await addPerson(t, TENANT, "5551110001");
    await addPerson(t, OTHER_TENANT, "5552220002");
    await addEventSoon(t, TENANT);

    expect(await scan(t, OTHER_TENANT)).toMatchObject({ sent: 0 });
    expect(await scan(t, TENANT)).toMatchObject({ sent: 1 });
    expect(calls.map((call) => call.to)).toEqual(["+15551110001"]);
    expect((await alertRows(t)).map((row) => row.tenantId)).toEqual([TENANT]);
  });

  it("only the newest scan chain keeps running; older chains end", async () => {
    const t = setup();
    const calls = stubTwilio(true);
    for (const chainId of ["chain-old", "chain-new"]) {
      await enable(t, TENANT, chainId);
    }
    await addPerson(t, TENANT, "5551110001");
    await addEventSoon(t, TENANT);

    const chainScan = (chainId?: string) =>
      t.action(internal.smsAlerts.scanTenant, {
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

    expect(await chainScan("chain-old")).toMatchObject({
      status: "superseded",
      sent: 0,
    });
    expect(await chainScan(undefined)).toMatchObject({
      status: "superseded",
      sent: 0,
    });
    expect(await scheduledChains()).toEqual([]);
    expect(calls).toHaveLength(0);

    expect(await chainScan("chain-new")).toMatchObject({
      status: "ok",
      sent: 1,
    });
    expect(await scheduledChains()).toEqual(["chain-new"]);
  });

  it("only managers switch alerts; nobody writes send or scan records by hand", async () => {
    const t = setup();
    await expect(
      manager(t, TENANT, "kitchen_staff").mutation(
        internal.smsAlerts.setEnabled,
        { enabled: true, chainId: "chain-x" },
      ),
    ).rejects.toThrow();
    await enable(t, TENANT);
    const status = await manager(t, TENANT).query(api.smsAlerts.getStatus, {});
    expect(status.enabled).toBe(true);

    // The generated public commands are system-only for the scan's records.
    await expect(
      manager(t, TENANT, "admin").mutation(
        api.mutations.SmsAlertDelivery_createViaOpen,
        { triggerKey: "event:x:t2h", personId: "p", alertType: "event_soon" },
      ),
    ).rejects.toThrow(/Guard/);
    // A second settings row for the tenant is refused.
    await expect(
      manager(t, TENANT, "admin").mutation(
        api.mutations.SmsAlertSetting_createViaOpen,
        {},
      ),
    ).rejects.toThrow(/already has SMS alert settings/);

    // Enable/disable are emitted by the command, not hand-written.
    const types = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("manifestEvents")
          .withIndex("by_entity", (q) => q.eq("entity", "SmsAlertSetting"))
          .collect()
      ).map((row) => row.type),
    );
    expect(types).toEqual(["SmsAlertsEnabled"]);
  });

  it("legacy ledger rows keep working: legacy enable, sends and chain are honored", async () => {
    const t = setup();
    const calls = stubTwilio(true);
    await legacyLedgerRow(t, TENANT, "SmsAlertConfig", "SmsAlertsEnabled", {
      actorId: "legacy-manager",
      chainId: "chain-legacy",
    });
    await addPerson(t, TENANT, "5551110001");
    await addPerson(t, TENANT, "5551110002");
    await addEventSoon(t, TENANT);
    const eventId = await t.run(async (ctx) =>
      String((await ctx.db.query("events").first())?._id),
    );
    const firstPerson = await t.run(async (ctx) =>
      String((await ctx.db.query("people").first())?._id),
    );
    await legacyLedgerRow(t, TENANT, "SmsAlert", "SmsAlertSent", {
      triggerKey: `event:${eventId}:t2h`,
      personId: firstPerson,
      alertType: "event_soon",
      messageSid: "SM-legacy",
      error: null,
    });

    // The legacy chain still owns the tenant; only the unsent person is texted.
    expect(
      await t.action(internal.smsAlerts.scanTenant, {
        tenantId: TENANT,
        scheduleNext: true,
        chainId: "chain-legacy",
      }),
    ).toMatchObject({ status: "ok", sent: 1, skipped: 1 });
    expect(calls.map((call) => call.to)).toEqual(["+15551110002"]);
    const status = await manager(t, TENANT).query(api.smsAlerts.getStatus, {});
    expect(status).toMatchObject({ enabled: true, lastScan: { sent: 1 } });

    // A governed disable wins over the older legacy enable.
    await manager(t, TENANT).mutation(internal.smsAlerts.setEnabled, {
      enabled: false,
    });
    expect(await scan(t, TENANT)).toMatchObject({ status: "disabled" });
  });
});
