/**
 * PL-ACCOUNTING runtime proof (AC-088 PR05-05, AC-619..AC-622 BE-15.2).
 *
 * - 1,000.00 paid by 100.00 + 900.00 closes at zero; a 3.50 processing fee
 *   and a tip ride on the payment but never become invoice principal.
 * - Paying more than is owed keeps the extra on the payment (held for the
 *   client) instead of refusing the payment or losing the money.
 * - Refund, chargeback and returned bank payment are separate totals; each
 *   takes from the held part first and then puts the rest back on the invoice.
 * - One provider payment id is used by one payment per provider account;
 *   a replayed provider confirmation records once.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;
type Row = Record<string, unknown>;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function financeOf(proof: Proof, tenantId: string): Actor {
  return proof.asRole({
    subject: `finance-${tenantId}`,
    role: "finance_manager",
    tenantId,
  });
}

async function sentInvoice(
  proof: Proof,
  finance: Actor,
  tenantId: string,
  total: number,
  number: string,
): Promise<{ invoiceId: string; clientId: string }> {
  const sales = proof.asRole({
    subject: `sales-${tenantId}`,
    role: "sales_manager",
    tenantId,
  });
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: `Accounting client ${number}` },
  )) as { docId: string };
  const invoice = (await proof.executeCommand(
    finance,
    api.mutations.Invoice_createViaIssue,
    {
      clientId: client.docId,
      invoiceNumber: number,
      subtotal: total,
      taxAmount: 0,
      discountAmount: 0,
      total,
    },
  )) as { docId: string };
  await proof.executeCommand(finance, api.mutations.Invoice_send, {
    docId: invoice.docId,
  });
  return { invoiceId: invoice.docId, clientId: client.docId };
}

async function pay(
  proof: Proof,
  finance: Actor,
  invoice: { invoiceId: string; clientId: string },
  amount: number,
  extra: Row = {},
): Promise<string> {
  const payment = (await proof.executeCommand(
    finance,
    api.mutations.Payment_createViaRecord,
    {
      invoiceId: invoice.invoiceId,
      clientId: invoice.clientId,
      amount,
      method: "card",
      ...extra,
    },
  )) as { docId: string };
  await proof.executeCommand(finance, api.mutations.Payment_settle, {
    docId: payment.docId,
  });
  return payment.docId;
}

const read = (actor: Actor, id: string) =>
  actor.run(async (ctx) => (await ctx.db.get(id as never)) as Row);

describe("payment accounting truth (PL-ACCOUNTING)", () => {
  it("100 + 900 closes 1,000 at zero; fee and tip are never principal (AC-088, AC-621)", async () => {
    const proof = harness();
    const tenantId = "tenant-acct-close";
    const finance = financeOf(proof, tenantId);
    const invoice = await sentInvoice(proof, finance, tenantId, 1000, "A-1");

    const first = await pay(proof, finance, invoice, 100, {
      feeAmount: 3.5,
      gratuityAmount: 20,
    });
    expect(await read(finance, invoice.invoiceId)).toMatchObject({
      status: "partial",
      amountPaid: 100,
      amountDue: 900,
    });
    await pay(proof, finance, invoice, 900);

    expect(await read(finance, invoice.invoiceId)).toMatchObject({
      status: "paid",
      amountPaid: 1000,
      amountDue: 0,
    });
    expect(await read(finance, first)).toMatchObject({
      amount: 100,
      appliedAmount: 100,
      unappliedAmount: 0,
      feeAmount: 3.5,
      gratuityAmount: 20,
      status: "completed",
    });
  });

  it("an overpayment is held, then refunds, chargebacks and returns stay separate and traceable (AC-088, AC-621)", async () => {
    const proof = harness();
    const tenantId = "tenant-acct-reverse";
    const finance = financeOf(proof, tenantId);
    const invoice = await sentInvoice(proof, finance, tenantId, 500, "A-2");

    const paymentId = await pay(proof, finance, invoice, 600);
    expect(await read(finance, paymentId)).toMatchObject({
      appliedAmount: 500,
      unappliedAmount: 100,
    });
    expect(await read(finance, invoice.invoiceId)).toMatchObject({
      status: "paid",
      amountPaid: 500,
      amountDue: 0,
    });

    // Refund of the extra: comes out of the held part; the invoice stays paid.
    await proof.executeCommand(finance, api.mutations.Payment_reverse, {
      docId: paymentId,
      kind: "refund",
      amount: 100,
      reason: "Paid twice by mistake",
    });
    expect(await read(finance, invoice.invoiceId)).toMatchObject({
      status: "paid",
      amountDue: 0,
    });

    // A card chargeback of 200 puts 200 back on the invoice.
    await proof.executeCommand(finance, api.mutations.Payment_reverse, {
      docId: paymentId,
      kind: "chargeback",
      amount: 200,
      reason: "Card dispute",
      providerReversalId: "dp_1",
    });
    expect(await read(finance, invoice.invoiceId)).toMatchObject({
      status: "partial",
      amountPaid: 300,
      amountDue: 200,
    });

    // Nothing more than is left can be taken back.
    await expect(
      proof.executeCommand(finance, api.mutations.Payment_reverse, {
        docId: paymentId,
        kind: "ach_return",
        amount: 301,
        reason: "Bank returned it",
      }),
    ).rejects.toThrow(/more than is left/);

    // The bank returns the rest: the payment is "returned", the invoice owes all.
    await proof.executeCommand(finance, api.mutations.Payment_reverse, {
      docId: paymentId,
      kind: "ach_return",
      amount: 300,
      reason: "Bank returned it",
    });
    expect(await read(finance, paymentId)).toMatchObject({
      amount: 600,
      appliedAmount: 0,
      unappliedAmount: 0,
      refundedAmount: 100,
      chargedBackAmount: 200,
      returnedAmount: 300,
      status: "returned",
    });
    expect(await read(finance, invoice.invoiceId)).toMatchObject({
      amountPaid: 0,
      amountDue: 500,
    });

    // Every step keeps its cause and kind on the ledger.
    const reversals = (await finance.run(async (ctx) =>
      (await ctx.db.query("manifestEvents").collect()).filter(
        (row) => row.type === "PaymentReversed" && row.entityId === paymentId,
      ),
    )) as { payload: Row }[];
    expect(
      reversals.map((row) => [
        row.payload.kind,
        row.payload.amount,
        row.payload.fromHeld,
        row.payload.fromApplied,
        row.payload.reason,
      ]),
    ).toEqual([
      ["refund", 100, 100, 0, "Paid twice by mistake"],
      ["chargeback", 200, 0, 200, "Card dispute"],
      ["ach_return", 300, 0, 300, "Bank returned it"],
    ]);
  });

  it("a full refund puts the paid money back on the invoice", async () => {
    const proof = harness();
    const tenantId = "tenant-acct-refund";
    const finance = financeOf(proof, tenantId);
    const invoice = await sentInvoice(proof, finance, tenantId, 400, "A-3");
    const paymentId = await pay(proof, finance, invoice, 400);

    await proof.executeCommand(finance, api.mutations.Payment_refund, {
      docId: paymentId,
      reason: "Event cancelled",
    });
    expect(await read(finance, paymentId)).toMatchObject({
      status: "refunded",
      refundedAmount: 400,
      appliedAmount: 0,
    });
    expect(await read(finance, invoice.invoiceId)).toMatchObject({
      amountPaid: 0,
      amountDue: 400,
    });
  });

  it("keeps when the money moved apart from when it was entered (AC-092)", async () => {
    const proof = harness();
    const tenantId = "tenant-acct-dates";
    const finance = financeOf(proof, tenantId);
    const invoice = await sentInvoice(proof, finance, tenantId, 250, "A-4");
    const occurredAt = Date.UTC(2025, 11, 30);
    const effectiveAt = Date.UTC(2026, 0, 2);
    const paymentId = await pay(proof, finance, invoice, 250, {
      occurredAt,
      effectiveAt,
    });
    const payment = await read(finance, paymentId);
    expect(payment).toMatchObject({ occurredAt, effectiveAt });
    expect(payment.recordedAt).toEqual(expect.any(Number));
    expect(payment.recordedAt).not.toBe(occurredAt);
  });

  it("voiding an empty placeholder invoice keeps it and its history (AC-092)", async () => {
    const proof = harness();
    const tenantId = "tenant-acct-void";
    const finance = financeOf(proof, tenantId);
    const sales = proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    });
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Placeholder client" },
    )) as { docId: string };
    const placeholder = (await proof.executeCommand(
      finance,
      api.mutations.Invoice_createViaIssue,
      {
        clientId: client.docId,
        invoiceNumber: "A-0",
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
      },
    )) as { docId: string };
    await proof.executeCommand(finance, api.mutations.Invoice_markVoided, {
      docId: placeholder.docId,
      reason: "Empty placeholder, never billed",
    });

    const voided = await read(finance, placeholder.docId);
    expect(voided).toMatchObject({
      status: "voided",
      voidReason: "Empty placeholder, never billed",
      voidedAt: expect.any(Number),
      issuedAt: expect.any(Number),
      invoiceNumber: "A-0",
    });
    expect(voided.deletedAt ?? null).toBeNull();
    const history = (await finance.run(async (ctx) =>
      (await ctx.db.query("manifestEvents").collect())
        .filter((row) => row.entityId === placeholder.docId)
        .map((row) => row.type),
    )) as string[];
    expect(history).toEqual(
      expect.arrayContaining(["InvoiceIssued", "InvoiceVoided"]),
    );
  });

  it("one provider payment id is used once per provider account (AC-619, AC-622)", async () => {
    const proof = harness();
    const tenantId = "tenant-acct-unique";
    const finance = financeOf(proof, tenantId);
    const invoice = await sentInvoice(proof, finance, tenantId, 900, "A-5");

    await pay(proof, finance, invoice, 100, {
      externalSource: "stripe",
      externalPaymentId: "pi_111",
      providerAccount: "acct_A",
    });
    await expect(
      pay(proof, finance, invoice, 100, {
        externalSource: "stripe",
        externalPaymentId: "pi_111",
        providerAccount: "acct_A",
      }),
    ).rejects.toThrow(/already on another Capsule payment/);

    // Another provider account, or another provider, is another transaction.
    await pay(proof, finance, invoice, 100, {
      externalSource: "stripe",
      externalPaymentId: "pi_111",
      providerAccount: "acct_B",
    });
    await pay(proof, finance, invoice, 100, {
      externalSource: "quickbooks_online",
      externalPaymentId: "pi_111",
    });

    // A reconciliation match claims its outside payment once.
    const a = await pay(proof, finance, invoice, 50);
    const b = await pay(proof, finance, invoice, 50);
    await proof.executeCommand(finance, api.mutations.Payment_markMatched, {
      docId: a,
      source: "tpp_legacy",
      externalPaymentId: "TPP-9",
    });
    await expect(
      proof.executeCommand(finance, api.mutations.Payment_markMatched, {
        docId: b,
        source: "tpp_legacy",
        externalPaymentId: "TPP-9",
      }),
    ).rejects.toThrow(/already matched to another Capsule payment/);
    // And one payment is not matched to a second outside payment.
    await expect(
      proof.executeCommand(finance, api.mutations.Payment_markMatched, {
        docId: a,
        source: "tpp_legacy",
        externalPaymentId: "TPP-10",
      }),
    ).rejects.toThrow(/already matched to another outside payment/);
  });

  it("a replayed provider confirmation records the payment once (AC-620)", async () => {
    const proof = harness();
    const tenantId = "tenant-acct-replay";
    const finance = financeOf(proof, tenantId);
    const invoice = await sentInvoice(proof, finance, tenantId, 300, "A-6");
    const args = {
      invoiceId: invoice.invoiceId,
      tenantId,
      sessionId: "cs_replay_1",
      amount: 300,
      method: "card" as const,
    };
    const first = (await finance.mutation(
      internal.lib.invoiceStripeReconcile.recordPaidSession,
      args,
    )) as Row;
    const replay = (await finance.mutation(
      internal.lib.invoiceStripeReconcile.recordPaidSession,
      args,
    )) as Row;
    expect(first).toMatchObject({ recorded: true, applied: 300 });
    expect(replay).toMatchObject({ recorded: false, applied: 300 });

    const payments = (await finance.run(async (ctx) =>
      (await ctx.db.query("payments").collect()).filter(
        (row) => row.tenantId === tenantId,
      ),
    )) as Row[];
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      externalSource: "stripe",
      externalPaymentId: "cs_replay_1",
      status: "completed",
    });
    expect(await read(finance, invoice.invoiceId)).toMatchObject({
      status: "paid",
      amountDue: 0,
    });
  });
});
