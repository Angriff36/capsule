/**
 * Runtime proof (PL-AUTH AC-372): a caller cannot set totals the server can
 * work out.
 *
 * - Invoice lines: the line and tax money on an issued invoice must be what
 *   the server works out from the lines and the workspace's own tax rates.
 * - Server-only steps (Manifest `private command`): a signed-in finance
 *   manager calling Invoice.applyPayment / applyCredit / recordCreditMemo by
 *   hand is refused, while the PaymentSettled reaction still applies a real
 *   payment.
 * - Proposal.followEventHeadcount: a person may run it, but only to the
 *   event's count and only with the central calc's money for its lines.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  calculateInvoiceTax,
  type TaxRateRecord,
} from "../../src/features/finance/invoiceTax";
import {
  createPlannedEvent,
  harness as proposalHarness,
  listedProposals,
  rolesFor,
  runner,
} from "./headcount-proposal-reconciliation.runtime.helpers";
import { readEventVersion } from "./single-reconciliation.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type Proof = ReturnType<typeof harness>;

async function financeSetup(proof: Proof, tenantId: string) {
  const sales = proof.asRole({
    subject: `sales-${tenantId}`,
    role: "sales_manager",
    tenantId,
  });
  const finance = proof.asRole({
    subject: `finance-${tenantId}`,
    role: "finance_manager",
    tenantId,
  });
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    { clientType: "company", companyName: `Totals client ${tenantId}` },
  )) as { docId: string };
  await proof.executeCommand(finance, M.TaxRate_createViaDefine, {
    name: "Food tax",
    percentage: 8,
    appliesToFood: true,
    appliesToService: false,
    appliesToRental: false,
  });
  const rates = (await finance.run(async (ctx) =>
    (await ctx.db.query("taxRates").collect()).filter(
      (row) => row.tenantId === tenantId,
    ),
  )) as TaxRateRecord[];
  return { finance, clientId: client.docId, rates };
}

const LINES = [
  {
    id: "a",
    description: "Dinner",
    category: "food" as const,
    quantity: 10,
    unitPrice: 12.5,
  },
  {
    id: "b",
    description: "Service staff",
    category: "service" as const,
    quantity: 2,
    unitPrice: 40,
  },
];

describe("runtime proof: callers cannot set totals the server works out (AC-372)", () => {
  it("an invoice's line and tax money must be what the lines and the workspace tax rates give", async () => {
    const proof = harness();
    const tenantId = "tenant-totals-invoice";
    const { finance, clientId, rates } = await financeSetup(proof, tenantId);
    const worked = calculateInvoiceTax(LINES, rates);
    // 10 x 12.50 food + 2 x 40 service = 205; 8% on the food only = 10.
    expect(worked.subtotal).toBe(205);
    expect(worked.taxAmount).toBe(10);

    const issue = (number: string, money: Record<string, unknown>) =>
      proof.executeCommand(finance, M.Invoice_createViaIssue, {
        clientId,
        invoiceNumber: number,
        discountAmount: 0,
        ...money,
      });

    // Tax left out: the browser says no tax, the workspace rate says 10.
    await expect(
      issue("INV-T-1", {
        subtotal: 205,
        taxAmount: 0,
        total: 205,
        lineItems: worked.lineItems.map((line) => ({
          ...line,
          taxAmount: 0,
          total: line.subtotal,
          appliedTaxRates: [],
        })),
        taxBreakdown: [],
      }),
    ).rejects.toThrow(/don't add up/);

    // Subtotal lowered below its lines.
    await expect(
      issue("INV-T-2", {
        subtotal: 100,
        taxAmount: 10,
        total: 110,
        lineItems: worked.lineItems,
        taxBreakdown: worked.taxBreakdown,
      }),
    ).rejects.toThrow(/don't add up/);

    // A line with no kind is refused in plain words.
    await expect(
      issue("INV-T-3", {
        subtotal: 205,
        taxAmount: 10,
        total: 215,
        lineItems: [{ ...worked.lineItems[0], category: "drinks" }],
        taxBreakdown: worked.taxBreakdown,
      }),
    ).rejects.toThrow(/needs a description, a kind/);

    const invoices = await finance.run(async (ctx) =>
      (await ctx.db.query("invoices").collect()).filter(
        (row) => row.tenantId === tenantId,
      ),
    );
    expect(invoices).toHaveLength(0);

    // The honest invoice, with a discount the person chose, is issued.
    const honest = (await issue("INV-T-4", {
      subtotal: 205,
      taxAmount: 10,
      discountAmount: 15,
      total: 200,
      lineItems: worked.lineItems,
      taxBreakdown: worked.taxBreakdown,
    })) as { docId: string };
    const stored = await finance.run(async (ctx) =>
      ctx.db.get(honest.docId as never),
    );
    expect(stored).toMatchObject({ subtotal: 205, taxAmount: 10, total: 200 });

    // A single-amount invoice (no lines), as the approval cascade and
    // imports make, is not line-checked.
    await issue("INV-T-5", { subtotal: 500, taxAmount: 0, total: 500 });
  });

  it("server-only invoice steps refuse a person; a settled payment still applies", async () => {
    const proof = harness();
    const tenantId = "tenant-totals-private";
    const { finance, clientId } = await financeSetup(proof, tenantId);
    const invoice = (await proof.executeCommand(
      finance,
      M.Invoice_createViaIssue,
      {
        clientId,
        invoiceNumber: "INV-P-1",
        subtotal: 500,
        taxAmount: 0,
        discountAmount: 0,
        total: 500,
      },
    )) as { docId: string };
    await proof.executeCommand(finance, M.Invoice_send, {
      docId: invoice.docId,
    });
    const read = () =>
      finance.run(async (ctx) =>
        ctx.db.get(invoice.docId as never),
      ) as Promise<{
        amountDue: number;
        amountPaid: number;
        status: string;
      }>;

    for (const [step, args] of [
      [M.Invoice_applyPayment, { paymentAmount: 500, paymentId: "made-up" }],
      [M.Invoice_applyCredit, { creditAmount: 500, creditMemoId: "made-up" }],
      [
        M.Invoice_recordCreditMemo,
        { creditAmount: 500, creditMemoId: "made-up" },
      ],
    ] as const) {
      await expect(
        proof.executeCommand(finance, step, {
          docId: invoice.docId,
          ...args,
        } as never),
      ).rejects.toThrow(/can't be started by hand/);
    }
    expect(await read()).toMatchObject({
      amountDue: 500,
      amountPaid: 0,
      status: "sent",
    });

    const payment = (await proof.executeCommand(
      finance,
      M.Payment_createViaRecord,
      { invoiceId: invoice.docId, clientId, amount: 200, method: "check" },
    )) as { docId: string };
    await proof.executeCommand(finance, M.Payment_settle, {
      docId: payment.docId,
    });
    expect(await read()).toMatchObject({
      amountDue: 300,
      amountPaid: 200,
      status: "partial",
    });
  });

  it("a person moves a proposal only to the event's count, with its lines' price", async () => {
    const tenantId = "tenant-totals-proposal";
    const proof = proposalHarness();
    const { sales, events } = rolesFor(proof, tenantId);
    const { eventId, clientId } = await createPlannedEvent(
      proof,
      tenantId,
      "Totals proposal",
    );
    // Sized by hand to 50 while the event is at 40, so it does not follow.
    await sales.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      {
        clientId,
        title: "Hand sized",
        guestCount: 50,
        subtotal: 0,
        taxAmount: 50,
        discountAmount: 0,
        total: 0,
        eventId,
        lines: [
          {
            description: "Dinner per guest",
            pricingBasis: "per_person",
            unitPrice: 30,
          },
          { description: "Setup fee", pricingBasis: "flat", unitPrice: 200 },
        ],
      },
    );
    await runner(proof, events)(M.Event_changeHeadcount, {
      docId: eventId,
      version: await readEventVersion(events, eventId),
      newHeadcount: 60,
    });
    const [draft] = await listedProposals(sales, eventId);
    expect(draft).toMatchObject({
      guestCount: 50,
      subtotal: 1700,
      total: 1750,
    });
    const follow = (money: Record<string, unknown>) =>
      runner(proof, sales)(M.Proposal_followEventHeadcount, {
        docId: draft!._id,
        version: draft!.version,
        ...money,
      });

    // Right count, made-up price.
    await expect(
      follow({ guestCount: 60, subtotal: 900, total: 950 }),
    ).rejects.toThrow(/doesn't match its priced lines/);
    // A count that is not the event's.
    await expect(
      follow({ guestCount: 55, subtotal: 1850, total: 1900 }),
    ).rejects.toThrow(/event's guest count/);
    // 60 x 30 + 200 = 2000, plus the 50 tax the person set.
    await follow({ guestCount: 60, subtotal: 2000, total: 2050 });
    const [moved] = await listedProposals(sales, eventId);
    expect(moved).toMatchObject({
      guestCount: 60,
      subtotal: 2000,
      total: 2050,
    });
  });
});
