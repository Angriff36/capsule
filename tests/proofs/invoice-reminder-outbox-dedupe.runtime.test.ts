/**
 * Runtime proof (AC-191 invoice reminder email slice): payment reminder
 * emails go out through `convex/invoiceReminders.ts`. Each reminder date
 * sends one email however often its job runs, a failed send is tried again
 * under the same email key and then sent once, a paid reminder link stops
 * later reminders, and the payment link in the email is made on (and read
 * back from) the caterer Stripe account, never the Capsule account.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { reminderScheduledAt } from "../../src/lib/invoiceReminderSchedule";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-reminder-a";
const OTHER_TENANT = "tenant-reminder-b";
const TENANT_ACCOUNT = "acct_tenant_a";
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

interface Call {
  kind: "stripe-create" | "stripe-lookup" | "email";
  account: string | undefined;
  key: string | undefined;
}

interface ProviderState {
  paid: boolean;
  emailFails: boolean;
}

/**
 * Stubs Stripe Checkout and the email provider. A Checkout session can only
 * be read back from the account it was made on (Stripe answers 404 on any
 * other account), the same as the real Stripe Connect behavior.
 */
function stubProviders(state: ProviderState) {
  const calls: Call[] = [];
  const sessionAccount = new Map<string, string | undefined>();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        url: string,
        init: { method?: string; headers?: Record<string, string> } = {},
      ) => {
        const account = init.headers?.["Stripe-Account"];
        const key = init.headers?.["Idempotency-Key"];
        if (url.startsWith("https://api.resend.com/")) {
          calls.push({ kind: "email", account, key });
          if (state.emailFails) {
            return Response.json(
              { message: "Email service is unavailable" },
              { status: 503 },
            );
          }
          return Response.json({ id: `email_${calls.length}` });
        }
        if ((init.method ?? "GET") === "POST") {
          calls.push({ kind: "stripe-create", account, key });
          const id = `cs_test_${sessionAccount.size + 1}`;
          sessionAccount.set(id, account);
          return Response.json({
            id,
            url: `https://checkout.stripe.com/c/pay/${id}`,
          });
        }
        calls.push({ kind: "stripe-lookup", account, key });
        const id = decodeURIComponent(
          new URL(url).pathname.split("/").pop() ?? "",
        );
        if (!sessionAccount.has(id) || sessionAccount.get(id) !== account) {
          return Response.json(
            { error: { message: "No such checkout session" } },
            { status: 404 },
          );
        }
        return Response.json(
          state.paid
            ? {
                payment_status: "paid",
                amount_total: 40_000,
                payment_intent: { payment_method: { type: "card" } },
              }
            : { payment_status: "unpaid" },
        );
      },
    ),
  );
  return calls;
}

async function setup() {
  const t = convexTest(schema, modules);
  const finance = t.withIdentity({
    subject: "finance-a",
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
      invoiceNumber: "INV-REMIND-1",
      subtotal: 400,
      total: 400,
      taxAmount: 0,
      discountAmount: 0,
      dueDate,
    },
  )) as { docId: string };
  await finance.mutation(api.mutations.Invoice_send, {
    docId: invoice.docId as Id<"invoices">,
    version: 1,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("integrationConnections", {
      tenantId: TENANT,
      provider: "stripe",
      status: "connected",
      externalAccountId: TENANT_ACCOUNT,
      chargesEnabled: true,
      payoutsEnabled: true,
      version: 1,
    });
  });
  return { t, finance, invoiceId: invoice.docId as Id<"invoices">, dueDate };
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

async function ledgerTypes(env: Setup): Promise<string[]> {
  return await env.t.run(async (ctx) =>
    (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) =>
          q.eq("entityId", String(env.invoiceId)),
        )
        .collect()
    )
      .map((row) => row.type)
      .filter((type) => type.startsWith("InvoiceReminder")),
  );
}

describe("invoice reminder outbox sends each reminder once", () => {
  it("repeated runs of one reminder date send one email with a caterer-account payment link", async () => {
    const env = await setup();
    const calls = stubProviders({ paid: false, emailFails: false });
    const schedule = await env.finance.action(
      api.invoiceReminders.configureSchedule,
      { invoiceId: env.invoiceId, offsetsDays: [7] },
    );

    for (let run = 0; run < 3; run += 1) {
      await env.t.action(
        internal.invoiceReminders.deliverScheduled,
        job(env, schedule.configId, 7),
      );
    }

    expect(calls.map((call) => call.kind)).toEqual(["stripe-create", "email"]);
    expect(calls[0]?.account).toBe(TENANT_ACCOUNT);
    expect(
      (await ledgerTypes(env)).filter(
        (type) => type === "InvoiceReminderDelivered",
      ),
    ).toHaveLength(1);
  });

  it("a client who pays through the reminder link is recorded once and gets no more reminders", async () => {
    const env = await setup();
    const state: ProviderState = { paid: false, emailFails: false };
    const calls = stubProviders(state);
    const schedule = await env.finance.action(
      api.invoiceReminders.configureSchedule,
      { invoiceId: env.invoiceId, offsetsDays: [7, 3] },
    );
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7),
    );

    state.paid = true;
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 3),
    );
    expect(calls.filter((call) => call.kind === "email")).toHaveLength(1);
    expect(await ledgerTypes(env)).toContain("InvoiceReminderSuppressed");

    expect(
      await env.finance.action(api.invoicePayments.syncStripePayments, {
        invoiceId: env.invoiceId,
      }),
    ).toMatchObject({ recorded: 1, recordedAmount: 400, failures: [] });
    expect(
      await env.finance.action(api.invoicePayments.syncStripePayments, {
        invoiceId: env.invoiceId,
      }),
    ).toMatchObject({ checked: 0, recorded: 0 });
    const payments = await env.t.run((ctx) =>
      ctx.db.query("payments").collect(),
    );
    expect(payments.map((row) => row.amount)).toEqual([400]);
    expect(
      calls
        .filter((call) => call.kind !== "email")
        .every((call) => call.account === TENANT_ACCOUNT),
    ).toBe(true);
  });

  it("a failed email send is tried again under the same key and then sent once", async () => {
    const env = await setup();
    const state: ProviderState = { paid: false, emailFails: true };
    const calls = stubProviders(state);
    const schedule = await env.finance.action(
      api.invoiceReminders.configureSchedule,
      { invoiceId: env.invoiceId, offsetsDays: [7] },
    );

    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7, 0),
    );
    expect(await ledgerTypes(env)).toContain("InvoiceReminderDeliveryFailed");
    expect(await ledgerTypes(env)).not.toContain("InvoiceReminderDelivered");

    state.emailFails = false;
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7, 1),
    );
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7, 2),
    );

    const emails = calls.filter((call) => call.kind === "email");
    expect(emails).toHaveLength(2);
    expect(new Set(emails.map((call) => call.key)).size).toBe(1);
    expect(calls.filter((call) => call.kind === "stripe-create")).toHaveLength(
      1,
    );
    expect(
      (await ledgerTypes(env)).filter(
        (type) => type === "InvoiceReminderDelivered",
      ),
    ).toHaveLength(1);
  });

  it("no payment link is made on the Capsule account and no other workspace can send", async () => {
    const env = await setup();
    const calls = stubProviders({ paid: false, emailFails: false });
    const schedule = await env.finance.action(
      api.invoiceReminders.configureSchedule,
      { invoiceId: env.invoiceId, offsetsDays: [7] },
    );
    // The workspace disconnects Stripe after the reminder was set up.
    await env.t.run(async (ctx) => {
      for (const row of await ctx.db
        .query("integrationConnections")
        .collect()) {
        await ctx.db.delete(row._id);
      }
    });

    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7),
    );
    expect(await ledgerTypes(env)).toContain("InvoiceReminderDeliveryFailed");
    await expect(
      env.finance.action(api.invoiceReminders.configureSchedule, {
        invoiceId: env.invoiceId,
        offsetsDays: [7],
      }),
    ).rejects.toThrow(/Stripe account/);
    await expect(
      env.finance.action(api.invoiceReminders.sendNow, {
        invoiceId: env.invoiceId,
      }),
    ).rejects.toThrow(/Stripe account/);

    const outsider = env.t.withIdentity({
      subject: "finance-outsider",
      org_id: OTHER_TENANT,
      role: "admin",
    });
    await expect(
      outsider.action(api.invoiceReminders.sendNow, {
        invoiceId: env.invoiceId,
      }),
    ).rejects.toThrow();
    await expect(
      outsider.action(api.invoiceReminders.configureSchedule, {
        invoiceId: env.invoiceId,
        offsetsDays: [7],
      }),
    ).rejects.toThrow();

    expect(calls).toEqual([]);
  });
});
