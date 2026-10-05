/**
 * Runtime proof (PL-CONSENT: AC-110; PL-OUTBOUND: AC-352 opt-out leg).
 *
 * Capsule reads the client's email choice, refused addresses and the quiet
 * hours when a reminder runs, not when it was scheduled:
 * - a client who asks for no reminders after the schedule was set gets none
 *   (scheduled or Send reminder now); invoice emails still go; "no emails"
 *   stops those too;
 * - an address the email service refused is not tried again by later
 *   scheduled reminders until the address changes;
 * - a scheduled reminder that falls at night in the kitchen's time zone waits
 *   for 8 am and then goes.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { quietHoursEnd } from "../../convex/lib/clientEmailConsent";
import { reminderScheduledAt } from "../../src/lib/invoiceReminderSchedule";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-consent-a";
const DAY = 86_400_000;

beforeEach(() => {
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  );
  vi.stubEnv("RESEND_API_KEY", "re_test_proof");
  vi.stubEnv("INVOICE_REMINDER_FROM_EMAIL", "billing@proof.example");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_proof");
  vi.stubEnv("CAPSULE_PUBLIC_APP_URL", "https://proof.example");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubProviders(state: { emailStatus: number }) {
  const emails: string[][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string, init: { method?: string; body?: string } = {}) => {
        if (url.startsWith("https://api.resend.com/")) {
          emails.push((JSON.parse(String(init.body)) as { to: string[] }).to);
          if (state.emailStatus !== 200) {
            return Response.json(
              { message: "no" },
              { status: state.emailStatus },
            );
          }
          return Response.json({ id: `email_${emails.length}` });
        }
        if ((init.method ?? "GET") === "POST") {
          return Response.json({
            id: "cs_test_1",
            url: "https://checkout.stripe.com/c/pay/cs_test_1",
          });
        }
        return Response.json({ payment_status: "unpaid" });
      },
    ),
  );
  return emails;
}

async function setup(options: { timeZone?: string } = {}) {
  const t = convexTest(schema, modules);
  const finance = t.withIdentity({
    subject: "finance-consent",
    org_id: TENANT,
    role: "admin",
  });
  const client = (await finance.mutation(
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: "Garden Club",
      email: "billing@garden.example",
    },
  )) as { docId: string };
  const dueDate = Date.now() + 10 * DAY;
  const invoice = (await finance.mutation(
    api.mutations.Invoice_createViaIssue,
    {
      clientId: client.docId,
      invoiceNumber: "INV-CONSENT-1",
      subtotal: 400,
      total: 400,
      taxAmount: 0,
      discountAmount: 0,
      dueDate,
    },
  )) as { docId: string };
  const invoiceId = invoice.docId as Id<"invoices">;
  await finance.mutation(api.mutations.Invoice_send, {
    docId: invoiceId,
    version: 1,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("integrationConnections", {
      tenantId: TENANT,
      provider: "stripe",
      status: "connected",
      externalAccountId: "acct_consent",
      chargesEnabled: true,
      payoutsEnabled: true,
      version: 1,
    });
    if (options.timeZone) {
      await ctx.db.insert("operatingLocations", {
        tenantId: TENANT,
        name: "Main kitchen",
        status: "active",
        timeZone: options.timeZone,
        version: 1,
      });
    }
  });
  const schedule = await finance.action(
    api.invoiceReminders.configureSchedule,
    { invoiceId, offsetsDays: [7, 3, 1] },
  );
  const job = (offsetDays: number) => ({
    invoiceId,
    tenantId: TENANT,
    configId: schedule.configId,
    offsetDays,
    scheduledFor: reminderScheduledAt(dueDate, offsetDays),
    attempt: 0,
  });
  return {
    t,
    finance,
    invoiceId,
    clientId: client.docId as Id<"clients">,
    job,
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function skipped(env: Setup) {
  return await env.t.run(async (ctx) =>
    (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) =>
          q.eq("entityId", String(env.invoiceId)),
        )
        .collect()
    )
      .filter((row) => row.type === "InvoiceReminderSuppressed")
      .map((row) => (row.payload as { reason?: string }).reason),
  );
}

async function setChoice(env: Setup, preference: string) {
  await env.finance.mutation(api.mutations.Client_setEmailPreference, {
    docId: env.clientId,
    preference: preference as "every_email" | "no_reminders" | "none",
    note: "Asked on the phone",
  });
}

describe("client email choices are checked when the email goes", () => {
  it("no reminders stops scheduled and Send now reminders but not the invoice email; no emails stops that too", async () => {
    const env = await setup();
    const emails = stubProviders({ emailStatus: 200 });

    // The schedule exists before the client asks to stop.
    await setChoice(env, "no_reminders");
    await env.t.action(internal.invoiceReminders.deliverScheduled, env.job(7));
    const now = await env.finance.action(api.invoiceReminders.sendNow, {
      invoiceId: env.invoiceId,
    });
    expect(now).toMatchObject({
      status: "suppressed",
      reason: "client_no_reminders",
    });
    expect(emails).toHaveLength(0);
    expect(await skipped(env)).toContain("client_no_reminders");

    await env.finance.action(api.invoiceEmail.send, {
      invoiceId: env.invoiceId,
    });
    expect(emails).toHaveLength(1);

    await setChoice(env, "none");
    await env.t.action(internal.invoiceReminders.deliverScheduled, env.job(3));
    expect(await skipped(env)).toContain("client_no_email");
    await expect(
      env.finance.action(api.invoiceEmail.send, {
        invoiceId: env.invoiceId,
      }),
    ).rejects.toThrow(/asked for no emails/u);
    expect(emails).toHaveLength(1);

    // Back to every email: the next scheduled reminder goes.
    await setChoice(env, "every_email");
    await env.t.action(internal.invoiceReminders.deliverScheduled, env.job(1));
    expect(emails).toHaveLength(2);

    const history = await env.finance.action(api.invoiceReminders.getHistory, {
      invoiceId: env.invoiceId,
    });
    expect(history.map((item) => item.words)).toEqual(
      expect.arrayContaining([
        "Skipped: the client asked for no reminder emails.",
        "Skipped: the client asked for no emails from us.",
      ]),
    );
  });

  it("a refused address is not tried again until the address changes", async () => {
    const env = await setup();
    const state = { emailStatus: 422 };
    const emails = stubProviders(state);

    await env.t.action(internal.invoiceReminders.deliverScheduled, env.job(7));
    expect(emails).toHaveLength(1);

    state.emailStatus = 200;
    await env.t.action(internal.invoiceReminders.deliverScheduled, env.job(3));
    expect(emails).toHaveLength(1);
    expect(await skipped(env)).toContain("address_refused");

    await env.finance.mutation(api.mutations.Client_changeContact, {
      docId: env.clientId,
      email: "accounts@garden.example",
    });
    await env.t.action(internal.invoiceReminders.deliverScheduled, env.job(1));
    expect(emails).toEqual([
      ["billing@garden.example"],
      ["accounts@garden.example"],
    ]);
  });

  it("a scheduled reminder at night waits for 8 am in the kitchen's time zone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T02:30:00Z"));
    const env = await setup({ timeZone: "UTC" });
    const emails = stubProviders({ emailStatus: 200 });

    await env.t.action(internal.invoiceReminders.deliverScheduled, env.job(7));
    expect(emails).toHaveLength(0);
    const waiting = await env.t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (row) =>
          row.name.includes("deliverScheduled") &&
          row.scheduledTime === Date.parse("2026-10-05T08:00:00Z"),
      ),
    );
    expect(waiting).toHaveLength(1);

    vi.setSystemTime(new Date("2026-10-05T08:00:30Z"));
    await env.t.action(internal.invoiceReminders.deliverScheduled, env.job(7));
    expect(emails).toHaveLength(1);
  });

  it("quiet hours follow the zone and stay off without one", () => {
    const at = Date.parse("2026-10-05T02:00:00Z"); // 10 pm in New York
    expect(quietHoursEnd(at, "America/New_York")).toBe(
      Date.parse("2026-10-05T12:00:00Z"),
    );
    expect(quietHoursEnd(Date.parse("2026-10-05T15:00:00Z"), "UTC")).toBe(null);
    expect(quietHoursEnd(at, null)).toBe(null);
    expect(quietHoursEnd(at, "Not/AZone")).toBe(null);
  });
});
