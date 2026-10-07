/**
 * Runtime proof (PL-DELIVERY-RECOVERY: AC-108).
 *
 * The email service takes a payment reminder, but its answer never reaches
 * Capsule (the connection drops). The stub below keeps keys the way the
 * real service does: the same key with the same email returns the first
 * email id and sends nothing; the same key with a changed email answers
 * 409 invalid_idempotent_request.
 *
 * - The automatic retry sends the same bytes under the same key, so the
 *   client gets one email and the record keeps the first email id.
 * - When the email changed between tries (the balance moved), the service's
 *   409 is recorded as "taken on an earlier try", not as a refused address,
 *   and later reminders to that address still go.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { reminderScheduledAt } from "../../src/lib/invoiceReminderSchedule";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-crash-a";
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

/** An email service that honors keys; `dropNextAnswer` loses one reply. */
function stubKeyedEmailService() {
  const state = { dropNextAnswer: false };
  const sent: string[] = [];
  // The service compares the whole email, so the stub keeps it whole.
  const byKey = new Map<string, { hash: string; id: string }>();
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
          const key = String(init.headers?.["Idempotency-Key"]);
          const hash = String(init.body);
          const earlier = byKey.get(key);
          if (earlier && earlier.hash !== hash) {
            return Response.json(
              {
                name: "invalid_idempotent_request",
                message: "Same key used with a different payload.",
              },
              { status: 409 },
            );
          }
          if (!earlier) {
            const id = `email_${sent.length + 1}`;
            sent.push(id);
            byKey.set(key, { hash, id });
          }
          if (state.dropNextAnswer) {
            state.dropNextAnswer = false;
            throw new TypeError("socket hang up");
          }
          return Response.json({ id: byKey.get(key)?.id });
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
  return { state, sent };
}

async function setup() {
  const t = convexTest(schema, modules);
  const finance = t.withIdentity({
    subject: "finance-crash",
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
      invoiceNumber: "INV-CRASH-1",
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
      externalAccountId: "acct_crash",
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
    )
      .filter((row) => row.type.startsWith("InvoiceReminder"))
      .map((row) => ({
        type: row.type,
        payload: row.payload as Record<string, unknown>,
      })),
  );
}

describe("a reminder whose send answer was lost is not sent twice", () => {
  it("failure between provider acceptance and ledger write recovers without a second provider send", async () => {
    const env = await setup();
    const service = stubKeyedEmailService();
    const schedule = await env.finance.action(
      api.invoiceReminders.configureSchedule,
      { invoiceId: env.invoiceId, offsetsDays: [7] },
    );

    service.state.dropNextAnswer = true;
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7),
    );
    const afterCrash = await reminderRows(env);
    expect(
      afterCrash.find((row) => row.type === "InvoiceReminderDeliveryFailed")
        ?.payload,
    ).toMatchObject({ failureKind: "service_down", retryScheduled: true });

    // The automatic retry runs later (another second, maybe another day).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60 * 60_000 + 1_000);
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7, 1),
    );

    expect(service.sent).toEqual(["email_1"]);
    const delivered = (await reminderRows(env)).filter(
      (row) => row.type === "InvoiceReminderDelivered",
    );
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.payload).toMatchObject({
      emailId: "email_1",
      providerState: "accepted",
      attempt: 1,
    });
  });

  it("a changed email under the same key is recorded as taken earlier, not as a refused address", async () => {
    const env = await setup();
    const service = stubKeyedEmailService();
    const schedule = await env.finance.action(
      api.invoiceReminders.configureSchedule,
      { invoiceId: env.invoiceId, offsetsDays: [7, 3] },
    );

    service.state.dropNextAnswer = true;
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7),
    );
    // The client paid part of the bill before the retry ran.
    await env.t.run(async (ctx) => {
      await ctx.db.patch(env.invoiceId, { amountPaid: 100, amountDue: 300 });
    });
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 7, 1),
    );

    expect(service.sent).toEqual(["email_1"]);
    const rows = await reminderRows(env);
    expect(
      rows.filter(
        (row) =>
          row.type === "InvoiceReminderDeliveryFailed" &&
          row.payload.failureKind === "refused",
      ),
    ).toHaveLength(0);
    const delivered = rows.filter(
      (row) => row.type === "InvoiceReminderDelivered",
    );
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.payload.providerState).toBe("accepted_earlier");
    expect(delivered[0]?.payload.emailId).toBeUndefined();

    const history = await env.finance.action(api.invoiceReminders.getHistory, {
      invoiceId: env.invoiceId,
    });
    expect(history[0]?.words).toBe(
      "Taken by the email service on an earlier try. Not sent again.",
    );

    // The address was never refused: the next reminder date still sends.
    await env.t.action(
      internal.invoiceReminders.deliverScheduled,
      job(env, schedule.configId, 3),
    );
    expect(service.sent).toEqual(["email_1", "email_2"]);
  });
});
