/**
 * Runtime proof (AC-102, PL-CLIENT-PAYMENT): a client pays a deposit or the
 * balance from the portal link, in the invoice's currency, and gets an honest
 * pending / succeeded / failed answer with the balance after Stripe confirms.
 * Pressing Pay twice, refreshing, a lost answer and a replayed return never
 * make a second charge or a second allocation. Two checkouts both paid for
 * the same balance: only what was owed is applied; the rest is saved as an
 * overpayment to refund.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-client-pay-a";
const OTHER_TENANT = "tenant-client-pay-b";
const ACCOUNT = "acct_client_pay_a";

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_proof");
  vi.stubEnv("CAPSULE_PUBLIC_APP_URL", "https://proof.example");
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    vi.stubEnv(
      "CONVEX_FIELD_ENCRYPTION_KEY",
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
    );
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

type FakeSession = {
  id: string;
  url: string;
  amount: number;
  currency: string;
  successUrl: string;
  status: "open" | "complete" | "expired";
  payment_status: "unpaid" | "paid";
  intentStatus?: string;
};

/** A small Stripe Checkout stand-in: sessions by id, idempotency keys honored. */
function fakeStripe() {
  const sessions = new Map<string, FakeSession>();
  const byKey = new Map<string, string>();
  const posts: Array<{ account?: string; key?: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        url: string,
        init: {
          method?: string;
          headers?: Record<string, string>;
          body?: URLSearchParams;
        } = {},
      ) => {
        const headers = init.headers ?? {};
        if (init.method === "POST") {
          const key = headers["Idempotency-Key"];
          posts.push({ account: headers["Stripe-Account"], key });
          const existing = key ? byKey.get(key) : undefined;
          if (existing) {
            const session = sessions.get(existing)!;
            return Response.json({ id: session.id, url: session.url });
          }
          const body = init.body!;
          const id = `cs_test_${sessions.size + 1}`;
          const session: FakeSession = {
            id,
            url: `https://checkout.stripe.com/c/pay/${id}`,
            amount: Number(body.get("line_items[0][price_data][unit_amount]")),
            currency: String(body.get("line_items[0][price_data][currency]")),
            successUrl: String(body.get("success_url")),
            status: "open",
            payment_status: "unpaid",
          };
          sessions.set(id, session);
          if (key) byKey.set(key, id);
          return Response.json({ id: session.id, url: session.url });
        }
        const id = decodeURIComponent(
          url.split("/v1/checkout/sessions/")[1]!.split("?")[0]!,
        );
        const session = sessions.get(id);
        if (!session) return new Response("{}", { status: 404 });
        return Response.json({
          id: session.id,
          status: session.status,
          payment_status: session.payment_status,
          amount_total: session.amount,
          currency: session.currency,
          payment_intent: {
            status: session.intentStatus ?? "succeeded",
            payment_method: { type: "card" },
          },
        });
      },
    ),
  );
  const pay = (id: string) => {
    const session = sessions.get(id)!;
    session.status = "complete";
    session.payment_status = "paid";
  };
  return { sessions, posts, pay };
}

async function setup(options: { currencyCode?: string; deposit?: number }) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({
    subject: "owner-client-pay",
    org_id: TENANT,
    role: "owner",
  });
  const client = (await owner.mutation(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: "Garden Club",
  })) as { docId: string };
  const event = (await owner.mutation(
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Garden Club dinner",
      eventType: "catering",
      startsAt: Date.UTC(2026, 10, 2, 16, 0),
      endsAt: Date.UTC(2026, 10, 2, 22, 0),
      expectedHeadcount: 40,
      primaryContactName: "Pat Planner",
      budgetAmount: 1000,
      quotedPrice: 1000,
    },
  )) as { docId: string };
  const invoice = (await owner.mutation(api.mutations.Invoice_createViaIssue, {
    clientId: client.docId,
    eventId: event.docId,
    invoiceNumber: "INV-PORTAL-1",
    subtotal: 1000,
    taxAmount: 0,
    discountAmount: 0,
    total: 1000,
    ...(options.currencyCode ? { currencyCode: options.currencyCode } : {}),
  })) as { docId: string };
  const invoiceId = invoice.docId as Id<"invoices">;
  let version = 1;
  if (options.deposit) {
    await owner.mutation(api.mutations.Invoice_setDeposit, {
      docId: invoiceId,
      depositAmount: options.deposit,
      version,
    });
    version += 1;
  }
  await owner.mutation(api.mutations.Invoice_send, {
    docId: invoiceId,
    version,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("integrationConnections", {
      tenantId: TENANT,
      provider: "stripe",
      status: "connected",
      externalAccountId: ACCOUNT,
      chargesEnabled: true,
      payoutsEnabled: true,
      version: 1,
    });
  });
  const token = String(
    await owner.mutation(api.lib.clientPortalLinks.issueClientPortalLink, {
      eventId: event.docId as Id<"events">,
    }),
  );
  return { t, owner, token, invoiceId, eventId: event.docId };
}

type Env = Awaited<ReturnType<typeof setup>>;

async function state({ t, invoiceId }: Env) {
  return await t.run(async (ctx) => ({
    invoice: await ctx.db.get(invoiceId),
    payments: (await ctx.db.query("payments").collect()).map((row) => ({
      status: row.status,
      amount: row.amount,
    })),
  }));
}

function sessionFrom(url: string): string {
  return url.split("/c/pay/")[1]!;
}

describe("client pays from the portal link", () => {
  it("pays a deposit in the invoice currency; replays record it once", async () => {
    const env = await setup({ currencyCode: "cad", deposit: 250 });
    const stripe = fakeStripe();

    const portal = (await env.t.query(api.clientPortal.getEvent, {
      token: env.token,
    })) as {
      payments: { online: boolean };
      documents: {
        invoices: Array<{
          currencyCode: string;
          payable: { deposit: number | null; balance: number };
        }>;
      };
    };
    expect(portal.payments.online).toBe(true);
    expect(portal.documents.invoices[0]).toMatchObject({
      currencyCode: "CAD",
      payable: { deposit: 250, balance: 1000 },
    });

    const started = await env.t.action(api.clientPortalPayments.startPayment, {
      token: env.token,
      invoiceId: env.invoiceId,
      part: "deposit",
    });
    expect(started).toMatchObject({ status: "checkout", amount: 250 });
    const sessionId = started.status === "checkout" ? started.sessionId : "";
    const session = stripe.sessions.get(sessionId)!;
    expect(session).toMatchObject({ amount: 25_000, currency: "cad" });
    expect(session.successUrl).toContain(
      `/portal/events/${env.token}?payment=return`,
    );
    expect(session.successUrl).toContain("session_id={CHECKOUT_SESSION_ID}");
    expect(stripe.posts.every((post) => post.account === ACCOUNT)).toBe(true);

    // Back before paying: honest "not finished yet".
    expect(
      await env.t.action(api.clientPortalPayments.checkPayment, {
        token: env.token,
        invoiceId: env.invoiceId,
        sessionId,
      }),
    ).toMatchObject({ outcome: "pending", amountPaid: 0, amountDue: 1000 });

    stripe.pay(sessionId);
    const first = await env.t.action(api.clientPortalPayments.checkPayment, {
      token: env.token,
      invoiceId: env.invoiceId,
      sessionId,
    });
    expect(first).toMatchObject({
      outcome: "succeeded",
      amountPaid: 250,
      amountDue: 750,
      overpaid: 0,
      currencyCode: "CAD",
    });
    // Refresh of the return page and a staff sync: nothing changes.
    await env.t.action(api.clientPortalPayments.checkPayment, {
      token: env.token,
      invoiceId: env.invoiceId,
      sessionId,
    });
    expect(
      await env.owner.action(api.invoicePayments.syncStripePayments, {
        invoiceId: env.invoiceId,
      }),
    ).toMatchObject({ checked: 0, recorded: 0 });

    const after = await state(env);
    expect(after.payments).toEqual([{ status: "completed", amount: 250 }]);
    expect(after.invoice).toMatchObject({
      status: "partial",
      amountPaid: 250,
      amountDue: 750,
      depositPaidAt: expect.any(Number),
    });

    // The deposit is done, so only the balance is offered now.
    expect(
      await env.t.action(api.clientPortalPayments.startPayment, {
        token: env.token,
        invoiceId: env.invoiceId,
        part: "deposit",
      }),
    ).toEqual({ status: "nothing_due" });
  });

  it("double press, refresh and a lost answer never make a second charge", async () => {
    const env = await setup({});
    const stripe = fakeStripe();
    const start = () =>
      env.t.action(api.clientPortalPayments.startPayment, {
        token: env.token,
        invoiceId: env.invoiceId,
        part: "balance",
      });

    // Two presses at the same moment: one checkout.
    const [a, b] = await Promise.all([start(), start()]);
    expect(a.status === "checkout" && b.status === "checkout").toBe(true);
    const sessionId = a.status === "checkout" ? a.sessionId : "";
    expect(b.status === "checkout" ? b.sessionId : "").toBe(sessionId);
    expect(stripe.sessions.size).toBe(1);

    // Refresh, press again: the open checkout is handed back.
    const again = await start();
    expect(again.status === "checkout" ? again.sessionId : "").toBe(sessionId);
    expect(stripe.sessions.size).toBe(1);

    // The client pays, the answer is lost, they press Pay again: the payment
    // is recorded and nothing new is charged.
    stripe.pay(sessionId);
    expect(await start()).toEqual({ status: "nothing_due" });
    expect(stripe.sessions.size).toBe(1);

    // The return page arrives late: same result, still one payment.
    expect(
      await env.t.action(api.clientPortalPayments.checkPayment, {
        token: env.token,
        invoiceId: env.invoiceId,
        sessionId,
      }),
    ).toMatchObject({ outcome: "succeeded", amountPaid: 1000, amountDue: 0 });
    const after = await state(env);
    expect(after.payments).toEqual([{ status: "completed", amount: 1000 }]);
    expect(after.invoice).toMatchObject({ status: "paid", amountDue: 0 });
  });

  it("two paid checkouts for one balance: the extra is kept as an overpayment, not applied", async () => {
    const env = await setup({});
    const stripe = fakeStripe();
    // A staff payment link and a client checkout, both for the full balance.
    const staffLink = await env.owner.action(
      api.invoicePayments.createPaymentLink,
      { invoiceId: env.invoiceId },
    );
    const staffSession = sessionFrom(staffLink.url);
    stripe.pay(staffSession); // paid, but not yet recorded in Capsule
    const clientSession = "cs_test_client";
    stripe.sessions.set(clientSession, {
      ...stripe.sessions.get(staffSession)!,
      id: clientSession,
      url: `https://checkout.stripe.com/c/pay/${clientSession}`,
    });
    await env.t.run((ctx) =>
      ctx.db.insert("manifestEvents", {
        type: "InvoicePaymentLinkCreated",
        entity: "Invoice",
        entityId: String(env.invoiceId),
        payload: {
          tenantId: TENANT,
          sessionId: clientSession,
          url: `https://checkout.stripe.com/c/pay/${clientSession}`,
          amount: 1000,
        },
        createdAt: Date.now(),
      }),
    );

    const synced = await env.owner.action(
      api.invoicePayments.syncStripePayments,
      { invoiceId: env.invoiceId },
    );
    expect(synced).toMatchObject({
      checked: 2,
      recorded: 2,
      recordedAmount: 1000,
      overpaidAmount: 1000,
      failures: [],
    });
    // Replay of the client's return: recorded once, overpayment still named.
    expect(
      await env.t.action(api.clientPortalPayments.checkPayment, {
        token: env.token,
        invoiceId: env.invoiceId,
        sessionId: clientSession,
      }),
    ).toMatchObject({ outcome: "succeeded", amountPaid: 1000, amountDue: 0 });

    const after = await state(env);
    expect(after.payments).toEqual([{ status: "completed", amount: 1000 }]);
    expect(after.invoice).toMatchObject({
      status: "paid",
      amountPaid: 1000,
      amountDue: 0,
    });
    const overpayments = await env.t.run(async (ctx) =>
      (await ctx.db.query("manifestEvents").collect())
        .filter((row) => row.type === "InvoiceStripePaymentRecorded")
        .map((row) => (row.payload as { overpaid: number }).overpaid),
    );
    expect(overpayments.sort()).toEqual([0, 1000]);
  });

  it("an expired checkout says failed; a bank payment still clearing blocks a second one", async () => {
    const env = await setup({});
    const stripe = fakeStripe();
    const start = () =>
      env.t.action(api.clientPortalPayments.startPayment, {
        token: env.token,
        invoiceId: env.invoiceId,
        part: "balance",
      });
    const first = await start();
    const firstId = first.status === "checkout" ? first.sessionId : "";
    stripe.sessions.get(firstId)!.status = "expired";
    expect(
      await env.t.action(api.clientPortalPayments.checkPayment, {
        token: env.token,
        invoiceId: env.invoiceId,
        sessionId: firstId,
      }),
    ).toMatchObject({ outcome: "failed", amountDue: 1000 });

    // A new try makes a new checkout (the expired one cannot be paid).
    const second = await start();
    const secondId = second.status === "checkout" ? second.sessionId : "";
    expect(secondId).not.toBe("");
    expect(secondId).not.toBe(firstId);
    const clearing = stripe.sessions.get(secondId)!;
    clearing.status = "complete"; // bank payment sent, not cleared yet
    expect(
      await env.t.action(api.clientPortalPayments.checkPayment, {
        token: env.token,
        invoiceId: env.invoiceId,
        sessionId: secondId,
      }),
    ).toMatchObject({ outcome: "pending" });
    expect(await start()).toEqual({ status: "processing" });

    // The bank turns it down later: failed, and the balance is unchanged.
    clearing.intentStatus = "requires_payment_method";
    expect(
      await env.t.action(api.clientPortalPayments.checkPayment, {
        token: env.token,
        invoiceId: env.invoiceId,
        sessionId: secondId,
      }),
    ).toMatchObject({ outcome: "failed", amountPaid: 0, amountDue: 1000 });
    expect((await state(env)).payments).toEqual([]);
  });

  it("a link for another event or company, or a turned-off link, cannot pay", async () => {
    const env = await setup({});
    fakeStripe();
    const other = env.t.withIdentity({
      subject: "owner-other",
      org_id: OTHER_TENANT,
      role: "owner",
    });
    const otherClient = (await other.mutation(
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Other" },
    )) as { docId: string };
    const otherEvent = (await other.mutation(
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: otherClient.docId,
        title: "Other lunch",
        eventType: "catering",
        startsAt: Date.UTC(2026, 10, 3, 16, 0),
        endsAt: Date.UTC(2026, 10, 3, 18, 0),
        expectedHeadcount: 10,
        primaryContactName: "Sam",
        budgetAmount: 100,
        quotedPrice: 100,
      },
    )) as { docId: string };
    const otherToken = String(
      await other.mutation(api.lib.clientPortalLinks.issueClientPortalLink, {
        eventId: otherEvent.docId as Id<"events">,
      }),
    );
    await expect(
      env.t.action(api.clientPortalPayments.startPayment, {
        token: otherToken,
        invoiceId: env.invoiceId,
        part: "balance",
      }),
    ).rejects.toThrow(/isn't available from this link/);

    await env.owner.mutation(
      api.lib.clientPortalLinks.turnOffClientPortalLinks,
      { eventId: env.eventId as Id<"events"> },
    );
    await expect(
      env.t.action(api.clientPortalPayments.startPayment, {
        token: env.token,
        invoiceId: env.invoiceId,
        part: "balance",
      }),
    ).rejects.toThrow(/isn't available from this link/);
    expect((await state(env)).payments).toEqual([]);
  });
});
