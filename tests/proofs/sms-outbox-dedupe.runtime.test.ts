/**
 * Runtime proof (AC-191 SMS outbox slice): high-urgency SMS alerts go out
 * through the durable manifestEvents ledger in `convex/smsAlerts.ts`, and
 * repeated scans send each alert to each opted-in person exactly once. A
 * failing send is retried on later scans up to three attempts and then left
 * alone, and the alerts of one tenant never reach the people of another.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
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

async function enable(t: TestConvex, tenantId: string): Promise<void> {
  await t.mutation(internal.smsAlerts.recordConfigEvent, {
    tenantId,
    type: "SmsAlertsEnabled",
    actorId: "proof-manager",
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

async function alertRows(t: TestConvex) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", "SmsAlert"))
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
});
