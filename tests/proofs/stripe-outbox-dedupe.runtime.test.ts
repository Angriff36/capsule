/**
 * Runtime proof (AC-191 Stripe outbox slice): invoice card payments go out to
 * Stripe and come back through `convex/invoicePayments.ts`. Repeated syncs
 * record and apply one paid Checkout session once, a failed Stripe lookup is
 * tried again on the next sync and then recorded once, a sync that stopped
 * after recording the payment finishes it without a second payment, and a
 * user from another tenant can never create or sync payments on the invoice.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-stripe-a";
const OTHER_TENANT = "tenant-stripe-b";
const TENANT_ACCOUNT = "acct_tenant_a";

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_proof");
  vi.stubEnv("CAPSULE_PUBLIC_APP_URL", "https://proof.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

type SessionState = "unpaid" | "paid" | "error";

/** Stubs Stripe Checkout: session create, then lookups in the given state. */
function stubStripe(state: { lookup: SessionState }) {
  const calls: Array<{ method: string; account: string | undefined }> = [];
  let created = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        url: string,
        init: { method?: string; headers?: Record<string, string> } = {},
      ) => {
        const method = init.method ?? "GET";
        calls.push({ method, account: init.headers?.["Stripe-Account"] });
        if (method === "POST" && url.endsWith("/v1/checkout/sessions")) {
          created += 1;
          return Response.json({
            id: `cs_test_${created}`,
            url: `https://checkout.stripe.com/c/pay/cs_test_${created}`,
          });
        }
        if (state.lookup === "error") {
          return Response.json(
            { error: { message: "Stripe is unavailable" } },
            { status: 500 },
          );
        }
        return Response.json(
          state.lookup === "paid"
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
    { clientType: "company", companyName: "Garden Club" },
  )) as { docId: string };
  const invoice = (await finance.mutation(
    api.mutations.Invoice_createViaIssue,
    {
      clientId: client.docId,
      invoiceNumber: "INV-STRIPE-1",
      subtotal: 400,
      total: 400,
      taxAmount: 0,
      discountAmount: 0,
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
  return { t, finance, invoiceId: invoice.docId as Id<"invoices"> };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function paymentsAndInvoice({ t, invoiceId }: Setup) {
  return await t.run(async (ctx) => ({
    payments: (await ctx.db.query("payments").collect()).map((row) => ({
      status: row.status,
      amount: row.amount,
      invoiceId: row.invoiceId,
    })),
    invoice: await ctx.db.get(invoiceId),
  }));
}

describe("Stripe outbox records each paid session once", () => {
  it("repeated syncs record and apply one paid session once", async () => {
    const env = await setup();
    const state: { lookup: SessionState } = { lookup: "unpaid" };
    const calls = stubStripe(state);
    const link = await env.finance.action(
      api.invoicePayments.createPaymentLink,
      { invoiceId: env.invoiceId },
    );

    expect(
      await env.finance.action(api.invoicePayments.syncStripePayments, {
        invoiceId: env.invoiceId,
      }),
    ).toMatchObject({ checked: 1, recorded: 0 });

    state.lookup = "paid";
    expect(
      await env.finance.action(api.invoicePayments.syncStripePayments, {
        invoiceId: env.invoiceId,
      }),
    ).toMatchObject({ checked: 1, recorded: 1, recordedAmount: 400 });
    expect(
      await env.finance.action(api.invoicePayments.syncStripePayments, {
        invoiceId: env.invoiceId,
      }),
    ).toMatchObject({ checked: 0, recorded: 0 });

    const { payments, invoice } = await paymentsAndInvoice(env);
    expect(payments).toEqual([
      { status: "completed", amount: 400, invoiceId: String(env.invoiceId) },
    ]);
    expect(invoice).toMatchObject({
      status: "paid",
      amountPaid: 400,
      amountDue: 0,
    });
    expect(link.sessionId).toBe("cs_test_1");
    expect(calls.map((call) => call.method)).toEqual(["POST", "GET", "GET"]);
    expect(calls.every((call) => call.account === TENANT_ACCOUNT)).toBe(true);
  });

  it("a failed Stripe lookup is tried again next sync, then recorded once", async () => {
    const env = await setup();
    const state: { lookup: SessionState } = { lookup: "error" };
    stubStripe(state);
    await env.finance.action(api.invoicePayments.createPaymentLink, {
      invoiceId: env.invoiceId,
    });

    const failed = await env.finance.action(
      api.invoicePayments.syncStripePayments,
      { invoiceId: env.invoiceId },
    );
    expect(failed).toMatchObject({ checked: 1, recorded: 0 });
    expect(failed.failures).toEqual([
      "Session cs_test_1: Stripe is unavailable",
    ]);
    expect((await paymentsAndInvoice(env)).payments).toEqual([]);

    state.lookup = "paid";
    expect(
      await env.finance.action(api.invoicePayments.syncStripePayments, {
        invoiceId: env.invoiceId,
      }),
    ).toMatchObject({ recorded: 1 });
    expect(
      await env.finance.action(api.invoicePayments.syncStripePayments, {
        invoiceId: env.invoiceId,
      }),
    ).toMatchObject({ checked: 0, recorded: 0 });
    expect((await paymentsAndInvoice(env)).payments).toHaveLength(1);
  });

  it("a sync that stopped after recording the payment finishes it without a second payment", async () => {
    const env = await setup();
    stubStripe({ lookup: "paid" });
    const link = await env.finance.action(
      api.invoicePayments.createPaymentLink,
      { invoiceId: env.invoiceId },
    );
    // The earlier sync got as far as recording the payment, then stopped.
    const invoice = await env.t.run((ctx) => ctx.db.get(env.invoiceId));
    await env.finance.mutation(api.mutations.Payment_createViaRecord, {
      invoiceId: String(env.invoiceId),
      clientId: String(invoice?.clientId),
      amount: 400,
      method: "card",
      notes: `Stripe Checkout ${link.sessionId}`,
      idempotencyKey: `stripe-checkout/${link.sessionId}/record`,
    });

    expect(
      await env.finance.action(api.invoicePayments.syncStripePayments, {
        invoiceId: env.invoiceId,
      }),
    ).toMatchObject({ recorded: 1, failures: [] });
    const after = await paymentsAndInvoice(env);
    expect(after.payments).toEqual([
      { status: "completed", amount: 400, invoiceId: String(env.invoiceId) },
    ]);
    expect(after.invoice).toMatchObject({ amountPaid: 400, amountDue: 0 });
  });

  it("a user from another tenant can never create or sync payments on the invoice", async () => {
    const env = await setup();
    const calls = stubStripe({ lookup: "paid" });
    await env.finance.action(api.invoicePayments.createPaymentLink, {
      invoiceId: env.invoiceId,
    });
    const outsider = env.t.withIdentity({
      subject: "finance-outsider",
      org_id: OTHER_TENANT,
      role: "admin",
    });

    await expect(
      outsider.action(api.invoicePayments.createPaymentLink, {
        invoiceId: env.invoiceId,
      }),
    ).rejects.toThrow();
    await expect(
      outsider.action(api.invoicePayments.syncStripePayments, {
        invoiceId: env.invoiceId,
      }),
    ).rejects.toThrow();
    await expect(
      outsider.action(api.invoicePayments.getPaymentLink, {
        invoiceId: env.invoiceId,
      }),
    ).rejects.toThrow();

    expect(calls.map((call) => call.method)).toEqual(["POST"]);
    expect((await paymentsAndInvoice(env)).payments).toEqual([]);
  });
});
