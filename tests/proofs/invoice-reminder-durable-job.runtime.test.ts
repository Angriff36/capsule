/**
 * Runtime proof (PL-OUTBOUND: AC-107, AC-109, AC-352 reminder legs).
 *
 * - A scheduled payment reminder keeps a send record: who it went to (where
 *   the address came from and a masked address, never the plain address),
 *   the sender, the template and its version, the attachment, a fingerprint
 *   of the exact email and PDF, the try number and the email service's id.
 * - "Send now" right after a reminder already went for the same balance
 *   sends nothing and says when and to whom the earlier one went.
 * - A failed send names its cause and a plain remedy; a refused email is
 *   not tried again by itself, a service that did not answer is.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { reminderScheduledAt } from "../../src/lib/invoiceReminderSchedule";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-outbound-a";
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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Email service answers with `emailStatus`; Stripe always works. */
function stubProviders(state: { emailStatus: number }) {
  const emails: Array<{ to: string[]; key: string | undefined }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        url: string,
        init: {
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        } = {},
      ) => {
        if (url.startsWith("https://api.resend.com/")) {
          const body = JSON.parse(String(init.body)) as { to: string[] };
          emails.push({ to: body.to, key: init.headers?.["Idempotency-Key"] });
          if (state.emailStatus !== 200) {
            return Response.json(
              { message: "Email service said no" },
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

async function setup() {
  const t = convexTest(schema, modules);
  const finance = t.withIdentity({
    subject: "finance-outbound",
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
      invoiceNumber: "INV-OUT-1",
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
      externalAccountId: "acct_outbound",
      chargesEnabled: true,
      payoutsEnabled: true,
      version: 1,
    });
  });
  return { t, finance, invoiceId, dueDate };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function job(env: Setup, configId: string, offsetDays: number, attempt = 0) {
  return {
    invoiceId: env.invoiceId,
    tenantId: TENANT,
    configId,
    offsetDays,
    scheduledFor: reminderScheduledAt(env.dueDate, offsetDays),
    attempt,
  };
}

async function reminderRows(env: Setup) {
  return await env.t.run(async (ctx) =>
    (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) =>
          q.eq("entityId", String(env.invoiceId)),
        )
        .collect()
    ).filter((row) => row.type.startsWith("InvoiceReminder")),
  );
}

async function scheduledJobs(env: Setup) {
  return await env.t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter(
      (row) => row.name.includes("deliverScheduled"),
    ),
  );
}

describe("payment reminders keep an honest send record", () => {
  it("a scheduled job records recipient, sender, template version, attachment, fingerprint, try and email id", async () => {
    const env = await setup();
    const emails = stubProviders({ emailStatus: 200 });
    const schedule = await env.finance.action(
      api.invoiceReminders.configureSchedule,
      { invoiceId: env.invoiceId, offsetsDays: [7] },
    );
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7),
    );

    expect(emails.map((email) => email.to)).toEqual([
      ["billing@garden.example"],
    ]);
    const delivered = (await reminderRows(env)).find(
      (row) => row.type === "InvoiceReminderDelivered",
    );
    const payload = delivered?.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      emailId: "email_1",
      providerState: "accepted",
      attempt: 0,
      source: "scheduled",
      recipientMasked: "b•••@garden.example",
      recipientSource: "client account",
      sender: "Catering company <billing@proof.example>",
      template: "invoice_reminder",
      templateVersion: 1,
      attachments: ["invoice-INV-OUT-1.pdf"],
    });
    expect(String(payload.artifactFingerprint)).toMatch(/^[0-9a-f]{64}$/u);
    // The plain address is never written to the send record.
    expect(JSON.stringify(payload)).not.toContain("billing@garden.example");

    const history = await env.finance.action(api.invoiceReminders.getHistory, {
      invoiceId: env.invoiceId,
    });
    expect(history[0]).toMatchObject({
      outcome: "accepted",
      source: "scheduled",
      attempt: 1,
      to: "b•••@garden.example",
      words: "Taken by the email service for b•••@garden.example.",
    });
  });

  it("send now after a delivered scheduled reminder sends nothing and says when and to whom", async () => {
    const env = await setup();
    const emails = stubProviders({ emailStatus: 200 });
    const schedule = await env.finance.action(
      api.invoiceReminders.configureSchedule,
      { invoiceId: env.invoiceId, offsetsDays: [7] },
    );
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7),
    );

    const again = await env.finance.action(api.invoiceReminders.sendNow, {
      invoiceId: env.invoiceId,
    });
    expect(again.status).toBe("already_delivered");
    expect(again.to).toBe("b•••@garden.example");
    expect(typeof again.sentAt).toBe("number");
    expect(emails).toHaveLength(1);
  });

  it("a refused email names a remedy and is not tried again; a silent service is", async () => {
    const env = await setup();
    const state = { emailStatus: 422 };
    stubProviders(state);
    const schedule = await env.finance.action(
      api.invoiceReminders.configureSchedule,
      { invoiceId: env.invoiceId, offsetsDays: [7, 3] },
    );
    const before = (await scheduledJobs(env)).length;

    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7),
    );
    expect((await scheduledJobs(env)).length).toBe(before);

    state.emailStatus = 503;
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 3),
    );
    expect((await scheduledJobs(env)).length).toBe(before + 1);

    const failed = (await reminderRows(env))
      .filter((row) => row.type === "InvoiceReminderDeliveryFailed")
      .map((row) => row.payload as Record<string, unknown>);
    expect(failed.map((row) => row.failureKind)).toEqual([
      "refused",
      "service_down",
    ]);
    expect(failed.map((row) => row.retryScheduled)).toEqual([false, true]);

    const history = await env.finance.action(api.invoiceReminders.getHistory, {
      invoiceId: env.invoiceId,
    });
    expect(history.map((item) => item.remedy)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Check the client's email address/u),
        expect.stringMatching(/did not answer/u),
      ]),
    );
  });

  it("send now with email not set up says so in plain words", async () => {
    const env = await setup();
    stubProviders({ emailStatus: 200 });
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(
      env.finance.action(api.invoiceReminders.sendNow, {
        invoiceId: env.invoiceId,
      }),
    ).rejects.toThrow(/Email sending is not set up/u);
  });
});
