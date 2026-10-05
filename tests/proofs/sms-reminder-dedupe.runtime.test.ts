/**
 * Runtime proof (AC-353, PL-SMS-SOCIAL): staff alert texts follow the email
 * delivery model. A retried scan tick sends each alert to each person once,
 * while a manager's explicit "Send again" still sends (once per click, even
 * when the call repeats). At night only the people on the event's shifts get
 * event texts; allergen texts go at any hour. A phone that texted STOP gets
 * no more texts until a later text to it is accepted again.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-sms-reminder";
const HOUR = 60 * 60_000;

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-proof");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "proof-token");
  vi.stubEnv("TWILIO_FROM_NUMBER", "+15550000000");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Twilio stand-in; phones in `stopped` answer "texted STOP" (21610). */
function stubTwilio(stopped: Set<string> = new Set()) {
  const calls: Array<{ to: string; body: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
      const to = String(init.body.get("To"));
      calls.push({ to, body: String(init.body.get("Body")) });
      if (stopped.has(to)) {
        return Response.json(
          {
            message: "Attempt to send to unsubscribed recipient",
            code: 21610,
          },
          { status: 400 },
        );
      }
      return Response.json({
        sid: "SM" + String(calls.length).padStart(6, "0"),
      });
    }),
  );
  return calls;
}

async function enable(t: TestConvex): Promise<void> {
  await t.mutation(internal.smsAlerts.recordConfigEvent, {
    tenantId: TENANT,
    type: "SmsAlertsEnabled",
    actorId: "proof-manager",
  });
}

async function addPerson(t: TestConvex, phone: string): Promise<Id<"people">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("people", {
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
    }),
  );
}

async function addEventSoon(t: TestConvex): Promise<Id<"events">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("events", {
      tenantId: TENANT,
      title: "Garden Wedding",
      eventType: "wedding",
      stage: "executing",
      startsAt: Date.now() + HOUR,
      version: 1,
    }),
  );
}

async function scan(t: TestConvex) {
  return await t.action(internal.smsAlerts.scanTenant, {
    tenantId: TENANT,
    scheduleNext: false,
  });
}

function manager(t: TestConvex) {
  return t.withIdentity({
    subject: "sms-proof-manager",
    org_id: TENANT,
    role: "admin",
  });
}

describe("staff alert texts: dedupe, night hold, STOP", () => {
  it("a retried dispatch tick sends each recipient once while an explicit sendNow still sends", async () => {
    const t = setup();
    const calls = stubTwilio();
    await enable(t);
    const personId = await addPerson(t, "5551110001");
    await addPerson(t, "5551110002");
    await addEventSoon(t);

    expect(await scan(t)).toMatchObject({ sent: 2, failed: 0 });
    // The same tick again (a retry): nothing more goes.
    expect(await scan(t)).toMatchObject({ sent: 0, skipped: 2 });
    expect(calls).toHaveLength(2);

    const texts = await manager(t).query(api.smsAlertTexts.recentTexts, {});
    expect(texts).toHaveLength(2);
    expect(texts.every((text) => text.sent && text.providerId)).toBe(true);
    const target = texts.find((text) => text.personId === String(personId))!;

    // An explicit send goes, and repeating the same click does not send twice.
    const click = {
      triggerKey: target.triggerKey,
      personId: target.personId,
      requestId: "click-1",
    };
    expect(
      await manager(t).action(api.smsAlertTexts.sendAgain, click),
    ).toMatchObject({ status: "sent" });
    expect(
      await manager(t).action(api.smsAlertTexts.sendAgain, click),
    ).toMatchObject({ status: "already_sent" });
    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual(calls.find((call) => call.to === "+15551110001"));

    // A new click is a new explicit send; the scan still sends nothing new.
    expect(
      await manager(t).action(api.smsAlertTexts.sendAgain, {
        ...click,
        requestId: "click-2",
      }),
    ).toMatchObject({ status: "sent" });
    expect(await scan(t)).toMatchObject({ sent: 0, skipped: 2 });
    expect(calls).toHaveLength(4);

    const after = await manager(t).query(api.smsAlertTexts.recentTexts, {});
    expect(after.filter((text) => text.sentAgain)).toHaveLength(2);
  });

  it("only managers see the texts and can send one again", async () => {
    const t = setup();
    stubTwilio();
    await enable(t);
    await addPerson(t, "5551110001");
    await addEventSoon(t);
    await scan(t);
    const staff = t.withIdentity({
      subject: "sms-proof-staff",
      org_id: TENANT,
      role: "kitchen_staff",
    });
    expect(await staff.query(api.smsAlertTexts.recentTexts, {})).toEqual([]);
    const [text] = await manager(t).query(api.smsAlertTexts.recentTexts, {});
    await expect(
      staff.action(api.smsAlertTexts.sendAgain, {
        triggerKey: text!.triggerKey,
        personId: text!.personId,
        requestId: "staff-click",
      }),
    ).rejects.toThrow(/manager/u);
  });

  it("at night event texts go only to the event's shift; allergen texts go to all", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 23:30 in Chicago.
    vi.setSystemTime(new Date("2026-10-05T04:30:00Z"));
    const t = setup();
    const calls = stubTwilio();
    await enable(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("operatingLocations", {
        tenantId: TENANT,
        name: "Main kitchen",
        status: "active",
        timeZone: "America/Chicago",
        version: 1,
      });
    });
    const onShift = await addPerson(t, "5551110001");
    await addPerson(t, "5551110002");
    const eventId = await addEventSoon(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("shifts", {
        tenantId: TENANT,
        personId: onShift,
        eventId,
        status: "scheduled",
        version: 1,
      });
    });

    expect(await scan(t)).toMatchObject({ sent: 1, heldForNight: 1 });
    expect(calls.map((call) => call.to)).toEqual(["+15551110001"]);

    await t.run(async (ctx) => {
      await ctx.db.insert("incidents", {
        tenantId: TENANT,
        eventId,
        severity: "critical",
        category: "allergen",
        description: "Guest reaction at table 4",
        status: "open",
        reportedAt: Date.now(),
        version: 1,
      });
    });
    expect(await scan(t)).toMatchObject({ sent: 2, heldForNight: 1 });
    expect(
      calls
        .slice(1)
        .map((call) => call.to)
        .sort(),
    ).toEqual(["+15551110001", "+15551110002"]);

    // Morning: the held event text goes if the event still starts soon.
    vi.setSystemTime(new Date("2026-10-05T04:45:00Z"));
    await t.run(async (ctx) => {
      const location = await ctx.db
        .query("operatingLocations")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", TENANT))
        .first();
      await ctx.db.patch(location!._id, { timeZone: "Asia/Tokyo" }); // 13:45
    });
    expect(await scan(t)).toMatchObject({ sent: 1, heldForNight: 0 });
    expect(calls.at(-1)!.to).toBe("+15551110002");
  });

  it("a phone that texted STOP gets no more texts until a later text is accepted", async () => {
    const t = setup();
    const stopped = new Set(["+15551110001"]);
    const calls = stubTwilio(stopped);
    await enable(t);
    await addPerson(t, "5551110001");
    await addEventSoon(t);

    expect(await scan(t)).toMatchObject({ sent: 0, failed: 1, optedOut: 1 });
    expect(await scan(t)).toMatchObject({ sent: 0, failed: 0, optedOut: 1 });
    expect(calls).toHaveLength(1);

    const [text] = await manager(t).query(api.smsAlertTexts.recentTexts, {});
    expect(text!.sent).toBe(false);
    expect(text!.problem).toMatch(/texted STOP/u);

    // They texted START; a manager sends it again and texts resume.
    stopped.clear();
    expect(
      await manager(t).action(api.smsAlertTexts.sendAgain, {
        triggerKey: text!.triggerKey,
        personId: text!.personId,
        requestId: "after-start",
      }),
    ).toMatchObject({ status: "sent" });
    await t.run(async (ctx) => {
      await ctx.db.insert("events", {
        tenantId: TENANT,
        title: "Board Lunch",
        eventType: "corporate",
        stage: "executing",
        startsAt: Date.now() + HOUR,
        version: 1,
      });
    });
    expect(await scan(t)).toMatchObject({ sent: 1, optedOut: 0 });
  });
});
