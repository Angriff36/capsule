/**
 * Runtime proof (AC-353, PL-SMS-SOCIAL; issue #439): Capsule learns whether a
 * staff alert text reached the phone from Twilio's signed delivery report
 * (POST /twilio/status) and, for a lost report, by asking Twilio. The first
 * final answer stays: a delivered text never goes back, a repeated report
 * adds nothing, and a text still on its way shows as accepted until Twilio
 * settles it. A report for another company's text or an unsigned report
 * changes nothing.
 */
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-sms-delivery";
const HOUR = 60 * 60_000;
const SITE = "https://proof.convex.site";

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-proof");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "proof-token");
  vi.stubEnv("TWILIO_FROM_NUMBER", "+15550000000");
  vi.stubEnv("CONVEX_SITE_URL", SITE);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** The form of every text sent to Twilio in the current test. */
const sends: URLSearchParams[] = [];

/** Twilio stand-in: sends get SM ids; status reads answer from `statuses`. */
function stubTwilio(
  statuses: Map<string, { status: string; error_code?: number | null }>,
) {
  let sent = 0;
  const reads: string[] = [];
  sends.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method: string; body?: unknown }) => {
      if (init.method === "GET") {
        const sid = decodeURIComponent(
          url.split("/Messages/")[1]!.replace(/\.json$/u, ""),
        );
        reads.push(sid);
        const answer = statuses.get(sid) ?? { status: "sent" };
        return Response.json({ sid, ...answer });
      }
      sent += 1;
      sends.push(new URLSearchParams(String(init.body)));
      return Response.json({ sid: "SM" + String(sent).padStart(6, "0") });
    }),
  );
  return reads;
}

/** Twilio's delivery report for one text, signed like Twilio signs it. */
function report(
  t: TestConvex,
  tenant: string,
  params: Record<string, string>,
  token = "proof-token",
) {
  const path = `/twilio/status?tenant=${encodeURIComponent(tenant)}`;
  const data =
    SITE +
    path +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  return t.fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": createHmac("sha1", token)
        .update(data)
        .digest("base64"),
    },
    body: new URLSearchParams(params).toString(),
  });
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

  it("keeps Twilio's signed delivery report for the company's own text", async () => {
    const t = setup();
    stubTwilio(new Map());
    await setUp(t, ["5552220001", "5552220002"]);
    await t.action(internal.smsAlerts.scanTenant, {
      tenantId: TENANT,
      scheduleNext: false,
    });
    // Every alert text asks Twilio to report to this company's address.
    expect(sends.map((form) => form.get("StatusCallback"))).toEqual([
      `${SITE}/twilio/status?tenant=${TENANT}`,
      `${SITE}/twilio/status?tenant=${TENANT}`,
    ]);

    // Unsigned, wrongly signed, another company's address, still on its
    // way, or a text Capsule never sent: nothing is kept.
    expect(
      (
        await report(
          t,
          TENANT,
          { MessageSid: "SM000001", MessageStatus: "delivered" },
          "wrong-token",
        )
      ).status,
    ).toBe(403);
    await report(t, "tenant-other", {
      MessageSid: "SM000001",
      MessageStatus: "undelivered",
      ErrorCode: "30005",
    });
    await report(t, TENANT, { MessageSid: "SM000001", MessageStatus: "sent" });
    await report(t, TENANT, {
      MessageSid: "SM999999",
      MessageStatus: "delivered",
    });
    let texts = await manager(t).query(api.smsAlertTexts.recentTexts, {});
    expect(texts.every((text) => text.delivered === null)).toBe(true);

    const delivered = await report(t, TENANT, {
      MessageSid: "SM000001",
      MessageStatus: "delivered",
    });
    expect(delivered.status).toBe(204);
    await report(t, TENANT, {
      MessageSid: "SM000002",
      MessageStatus: "undelivered",
      ErrorCode: "30004",
    });
    // A late, different report for a settled text changes nothing.
    await report(t, TENANT, {
      MessageSid: "SM000001",
      MessageStatus: "failed",
      ErrorCode: "30005",
    });

    texts = await manager(t).query(api.smsAlertTexts.recentTexts, {});
    const bySid = new Map(texts.map((text) => [text.providerId, text]));
    expect(bySid.get("SM000001")).toMatchObject({
      delivered: true,
      problem: null,
    });
    expect(bySid.get("SM000002")).toMatchObject({ delivered: false });
    expect(bySid.get("SM000002")!.problem).toContain(
      "the phone blocks texts from this number",
    );
    // Reported texts are not asked about again.
    expect(
      await t.action(internal.smsAlertDelivery.checkDeliveries, {
        tenantId: TENANT,
      }),
    ).toEqual({ checked: 0, recorded: 0, errors: 0 });
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
