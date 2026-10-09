/**
 * Runtime proof (AC-353, PL-SMS-SOCIAL): Capsule learns whether a staff alert
 * text reached the phone by asking Twilio, without the signed callback route
 * (issue #439). The first final answer stays: a delivered text never goes
 * back, a repeated check adds nothing, and a text still on its way shows as
 * accepted until Twilio settles it.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-sms-delivery";
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

/** Twilio stand-in: sends get SM ids; status reads answer from `statuses`. */
function stubTwilio(
  statuses: Map<string, { status: string; error_code?: number | null }>,
) {
  let sent = 0;
  const reads: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method: string }) => {
      if (init.method === "GET") {
        const sid = decodeURIComponent(
          url.split("/Messages/")[1]!.replace(/\.json$/u, ""),
        );
        reads.push(sid);
        const answer = statuses.get(sid) ?? { status: "sent" };
        return Response.json({ sid, ...answer });
      }
      sent += 1;
      return Response.json({ sid: "SM" + String(sent).padStart(6, "0") });
    }),
  );
  return reads;
}

async function setUp(t: TestConvex, phones: string[]): Promise<void> {
  await t.mutation(internal.smsAlerts.recordConfigEvent, {
    tenantId: TENANT,
    type: "SmsAlertsEnabled",
    actorId: "proof-manager",
  });
  await t.run(async (ctx) => {
    for (const phone of phones) {
      await ctx.db.insert("people", {
        tenantId: TENANT,
        givenName: "Pat",
        familyName: phone.slice(-4),
        email: phone + "@example.test",
        phone,
        role: "kitchen_staff",
        employmentType: "full_time",
        status: "active",
        smsAlertsOptIn: true,
        version: 1,
      });
    }
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

function manager(t: TestConvex) {
  return t.withIdentity({
    subject: "sms-delivery-manager",
    org_id: TENANT,
    role: "admin",
  });
}

describe("staff alert texts: delivered or not", () => {
  it("records delivered / not delivered once, never goes back, waits while on its way", async () => {
    const t = setup();
    const statuses = new Map<
      string,
      { status: string; error_code?: number | null }
    >();
    const reads = stubTwilio(statuses);
    await setUp(t, ["5552220001", "5552220002", "5552220003"]);

    expect(
      await t.action(internal.smsAlerts.scanTenant, {
        tenantId: TENANT,
        scheduleNext: false,
      }),
    ).toMatchObject({ sent: 3 });
    let texts = await manager(t).query(api.smsAlertTexts.recentTexts, {});
    expect(texts.every((text) => text.sent && text.delivered === null)).toBe(
      true,
    );

    statuses.set("SM000001", { status: "delivered" });
    statuses.set("SM000002", { status: "undelivered", error_code: 30003 });
    // SM000003 is still on its way ("sent").
    expect(
      await t.action(internal.smsAlertDelivery.checkDeliveries, {
        tenantId: TENANT,
      }),
    ).toEqual({ checked: 3, recorded: 2, errors: 0 });

    texts = await manager(t).query(api.smsAlertTexts.recentTexts, {});
    const bySid = new Map(texts.map((text) => [text.providerId, text]));
    expect(bySid.get("SM000001")).toMatchObject({
      delivered: true,
      problem: null,
    });
    expect(bySid.get("SM000002")).toMatchObject({ delivered: false });
    expect(bySid.get("SM000002")!.problem).toContain(
      "the phone was off or out of service",
    );
    expect(bySid.get("SM000003")).toMatchObject({
      delivered: null,
      problem: null,
    });

    // A later, different answer for a settled text changes nothing, and
    // settled texts are not asked about again.
    statuses.set("SM000001", { status: "failed", error_code: 30005 });
    statuses.set("SM000003", { status: "delivered" });
    reads.length = 0;
    expect(
      await t.action(internal.smsAlertDelivery.checkDeliveries, {
        tenantId: TENANT,
      }),
    ).toEqual({ checked: 1, recorded: 1, errors: 0 });
    expect(reads).toEqual(["SM000003"]);
    expect(
      await t.mutation(internal.smsAlertDelivery.recordDelivery, {
        tenantId: TENANT,
        messageSid: "SM000001",
        outcome: "not_delivered",
        errorCode: 30005,
      }),
    ).toEqual({ recorded: false });

    texts = await manager(t).query(api.smsAlertTexts.recentTexts, {});
    expect(texts.find((text) => text.providerId === "SM000001")).toMatchObject({
      delivered: true,
      problem: null,
    });
    expect(texts.find((text) => text.providerId === "SM000003")).toMatchObject({
      delivered: true,
    });
  });

  it("does nothing when texting is not set up", async () => {
    const t = setup();
    vi.unstubAllEnvs();
    expect(
      await t.action(internal.smsAlertDelivery.checkDeliveries, {
        tenantId: TENANT,
      }),
    ).toEqual({ checked: 0, recorded: 0, errors: 0 });
  });
});
