/**
 * Runtime proof: Client.register → Invoice.issue → Invoice.send →
 * Payment.record → Payment.settle → Invoice.applyPayment (reaction).
 * Seeds every record through public generated createVia mutations.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  InvoiceIssueParamsSchema,
  PaymentRecordParamsSchema,
} from "../../schemas/manifest-schemas";

const S = {
  tenantA: "tenant-finance-a",
  tenantB: "tenant-finance-b",
} as const;

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

async function seedClient(proof: ReturnType<typeof harness>, tenantId: string) {
  const sales = proof.asRole({
    subject: `sales-${tenantId}`,
    role: "sales_manager",
    tenantId,
  });
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Finance proof client ${tenantId}`,
    },
  )) as { docId: string };
  return client.docId;
}

describe("runtime proof: Invoice → Payment lifecycle", () => {
  it("issues, sends, records, and settles a payment with opaque ids", async () => {
    const proof = harness();
    const clientId = await seedClient(proof, S.tenantA);
    const finance = proof.asRole({
      subject: "finance-manager-a",
      role: "finance_manager",
      tenantId: S.tenantA,
    });

    expect(() =>
      InvoiceIssueParamsSchema.parse({
        clientId,
        invoiceNumber: "INV-PROOF-1",
        subtotal: 500,
        taxAmount: 0,
        discountAmount: 0,
        total: 500,
      }),
    ).not.toThrow();

    const invoice = (await proof.executeCommand(
      finance,
      api.mutations.Invoice_createViaIssue,
      {
        clientId,
        invoiceNumber: "INV-PROOF-1",
        subtotal: 500,
        taxAmount: 0,
        discountAmount: 0,
        total: 500,
      },
    )) as { docId: string };

    const issued = await finance.run(async (ctx) =>
      ctx.db.get(invoice.docId as never),
    );
    expect(issued).toMatchObject({
      tenantId: S.tenantA,
      clientId,
      status: "draft",
      invoiceNumber: "INV-PROOF-1",
      amountDue: 500,
      issuedAt: expect.any(Number),
    });

    await proof.executeCommand(finance, api.mutations.Invoice_send, {
      docId: invoice.docId,
      version: 1,
    });
    const sent = await finance.run(async (ctx) =>
      ctx.db.get(invoice.docId as never),
    );
    expect(sent).toMatchObject({ status: "sent", version: 2 });

    expect(() =>
      PaymentRecordParamsSchema.parse({
        invoiceId: invoice.docId,
        clientId,
        amount: 500,
        method: "card",
      }),
    ).not.toThrow();

    const payment = (await proof.executeCommand(
      finance,
      api.mutations.Payment_createViaRecord,
      {
        invoiceId: invoice.docId,
        clientId,
        amount: 500,
        method: "card",
      },
    )) as { docId: string };

    const recorded = await finance.run(async (ctx) =>
      ctx.db.get(payment.docId as never),
    );
    expect(recorded).toMatchObject({
      status: "pending",
      invoiceId: invoice.docId,
      amount: 500,
    });

    await proof.executeCommand(finance, api.mutations.Payment_settle, {
      docId: payment.docId,
      version: 1,
    });

    const settledPayment = await finance.run(async (ctx) =>
      ctx.db.get(payment.docId as never),
    );
    expect(settledPayment).toMatchObject({
      status: "completed",
      settledAt: expect.any(Number),
    });

    const paidInvoice = await finance.run(async (ctx) =>
      ctx.db.get(invoice.docId as never),
    );
    expect(paidInvoice).toMatchObject({
      status: "paid",
      amountPaid: 500,
      amountDue: 0,
    });
  });

  it("denies kitchen staff and leaves no partial invoice", async () => {
    const proof = harness();
    const clientId = await seedClient(proof, S.tenantA);
    const kitchen = proof.asRole({
      subject: "kitchen-staff-a",
      role: "kitchen_staff",
      tenantId: S.tenantA,
    });

    await expect(
      proof.executeCommand(kitchen, api.mutations.Invoice_createViaIssue, {
        clientId,
        invoiceNumber: "INV-DENIED",
        subtotal: 100,
        taxAmount: 0,
        discountAmount: 0,
        total: 100,
      }),
    ).rejects.toThrow();

    const finance = proof.asRole({
      subject: "finance-reader-a",
      role: "finance_manager",
      tenantId: S.tenantA,
    });
    const listed = (await finance.query(api.queries.listInvoice, {})) as Array<{
      invoiceNumber?: string | null;
    }>;
    expect(listed.some((row) => row.invoiceNumber === "INV-DENIED")).toBe(
      false,
    );
  });

  it("keeps invoices tenant-isolated", async () => {
    const proof = harness();
    const clientA = await seedClient(proof, S.tenantA);
    const financeA = proof.asRole({
      subject: "finance-manager-a2",
      role: "finance_manager",
      tenantId: S.tenantA,
    });
    await proof.executeCommand(financeA, api.mutations.Invoice_createViaIssue, {
      clientId: clientA,
      invoiceNumber: "INV-TENANT-A",
      subtotal: 200,
      taxAmount: 0,
      discountAmount: 0,
      total: 200,
    });

    const financeB = proof.asRole({
      subject: "finance-manager-b",
      role: "finance_manager",
      tenantId: S.tenantB,
    });
    const listedB = (await financeB.query(
      api.queries.listInvoice,
      {},
    )) as Array<{ invoiceNumber?: string | null }>;
    expect(listedB.some((row) => row.invoiceNumber === "INV-TENANT-A")).toBe(
      false,
    );
  });
});
