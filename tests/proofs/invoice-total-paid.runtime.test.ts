/**
 * S9 proof: Invoice.totalPaid over hasMany payments
 *
 * Verifies:
 * - totalPaid = sum(payments where status == "completed")
 * - settledPaymentCount = count_of(payments where status == "completed")
 * - voided/failed payments contribute 0 to totalPaid
 * - amountPaid stays stored (not replaced by computed)
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  hydrateComputedRelationsForInvoice,
  computeInvoice,
} from "../../convex/computed";

const S = {
  tenantA: "tenant-s9-a",
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
      companyName: `S9 proof client ${tenantId}`,
    },
  )) as { docId: string };
  return client.docId;
}

describe("runtime proof: Invoice totalPaid over payments", () => {
  it("sums completed payments only, excludes failed/refunded", async () => {
    const proof = harness();
    const clientId = await seedClient(proof, S.tenantA);
    const finance = proof.asRole({
      subject: "finance-manager-s9",
      role: "finance_manager",
      tenantId: S.tenantA,
    });

    // Issue invoice for $1000
    const invoice = (await proof.executeCommand(
      finance,
      api.mutations.Invoice_createViaIssue,
      {
        clientId,
        invoiceNumber: "INV-S9-001",
        subtotal: 1000,
        taxAmount: 0,
        discountAmount: 0,
        total: 1000,
      },
    )) as { docId: string };

    // Send invoice so payment can be applied
    await proof.executeCommand(finance, api.mutations.Invoice_send, {
      docId: invoice.docId,
      version: 1,
    });

    // Record payment 1: $500 (will be completed)
    const payment1 = (await proof.executeCommand(
      finance,
      api.mutations.Payment_createViaRecord,
      {
        invoiceId: invoice.docId,
        clientId,
        amount: 500,
        method: "card",
      },
    )) as { docId: string };

    // Record payment 2: $300 (will be failed)
    const payment2 = (await proof.executeCommand(
      finance,
      api.mutations.Payment_createViaRecord,
      {
        invoiceId: invoice.docId,
        clientId,
        amount: 300,
        method: "card",
      },
    )) as { docId: string };

    // Settle payment 1
    await proof.executeCommand(finance, api.mutations.Payment_settle, {
      docId: payment1.docId,
      version: 1,
    });

    // Fail payment 2
    await proof.executeCommand(finance, api.mutations.Payment_fail, {
      docId: payment2.docId,
      version: 1,
      reason: "Insufficient funds",
    });

    // Fetch invoice with computed aggregations
    const fetched = await finance.run(async (ctx) => {
      const doc = await ctx.db.get(invoice.docId as never);
      if (!doc) return null;

      await hydrateComputedRelationsForInvoice(ctx, doc);
      const computed = computeInvoice(doc);

      return {
        ...(doc as any),
        ...computed,
      };
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.totalPaid).toBe(500); // Only completed payment
    expect(fetched!.settledPaymentCount).toBe(1); // One settled payment
    expect(fetched!.amountPaid).toBe(500); // Stored field updated by reaction
  });

  it("excludes refunded payments from totalPaid", async () => {
    const proof = harness();
    const clientId = await seedClient(proof, S.tenantA);
    const finance = proof.asRole({
      subject: "finance-manager-s9b",
      role: "finance_manager",
      tenantId: S.tenantA,
    });

    // Issue invoice for $800
    const invoice = (await proof.executeCommand(
      finance,
      api.mutations.Invoice_createViaIssue,
      {
        clientId,
        invoiceNumber: "INV-S9-002",
        subtotal: 800,
        taxAmount: 0,
        discountAmount: 0,
        total: 800,
      },
    )) as { docId: string };

    // Send invoice so payment can be applied
    await proof.executeCommand(finance, api.mutations.Invoice_send, {
      docId: invoice.docId,
      version: 1,
    });

    // Record and settle payment 1: $500
    const payment1 = (await proof.executeCommand(
      finance,
      api.mutations.Payment_createViaRecord,
      {
        invoiceId: invoice.docId,
        clientId,
        amount: 500,
        method: "card",
      },
    )) as { docId: string };

    await proof.executeCommand(finance, api.mutations.Payment_settle, {
      docId: payment1.docId,
      version: 1,
    });

    // Record and settle payment 2: $300
    const payment2 = (await proof.executeCommand(
      finance,
      api.mutations.Payment_createViaRecord,
      {
        invoiceId: invoice.docId,
        clientId,
        amount: 300,
        method: "card",
      },
    )) as { docId: string };

    await proof.executeCommand(finance, api.mutations.Payment_settle, {
      docId: payment2.docId,
      version: 1,
    });

    // Refund payment 2
    await proof.executeCommand(finance, api.mutations.Payment_refund, {
      docId: payment2.docId,
      version: 2,
      reason: "Customer request",
    });

    // Fetch invoice with computed aggregations
    const fetched = await finance.run(async (ctx) => {
      const doc = await ctx.db.get(invoice.docId as never);
      if (!doc) return null;

      await hydrateComputedRelationsForInvoice(ctx, doc);
      const computed = computeInvoice(doc);

      return {
        ...(doc as any),
        ...computed,
      };
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.totalPaid).toBe(500); // Only payment 1 (payment 2 is refunded)
    expect(fetched!.settledPaymentCount).toBe(1); // One completed payment
  });

  it("amountPaid stays stored separately from computed totalPaid", async () => {
    const proof = harness();
    const clientId = await seedClient(proof, S.tenantA);
    const finance = proof.asRole({
      subject: "finance-manager-s9c",
      role: "finance_manager",
      tenantId: S.tenantA,
    });

    // Issue invoice for $600
    const invoice = (await proof.executeCommand(
      finance,
      api.mutations.Invoice_createViaIssue,
      {
        clientId,
        invoiceNumber: "INV-S9-003",
        subtotal: 600,
        taxAmount: 0,
        discountAmount: 0,
        total: 600,
      },
    )) as { docId: string };

    // Send invoice so payment can be applied
    await proof.executeCommand(finance, api.mutations.Invoice_send, {
      docId: invoice.docId,
      version: 1,
    });

    // Record and settle payment: $200
    const payment = (await proof.executeCommand(
      finance,
      api.mutations.Payment_createViaRecord,
      {
        invoiceId: invoice.docId,
        clientId,
        amount: 200,
        method: "card",
      },
    )) as { docId: string };

    await proof.executeCommand(finance, api.mutations.Payment_settle, {
      docId: payment.docId,
      version: 1,
    });

    // Fetch invoice
    const fetched = await finance.run(async (ctx) => {
      const doc = await ctx.db.get(invoice.docId as never);
      if (!doc) return null;

      await hydrateComputedRelationsForInvoice(ctx, doc);
      const computed = computeInvoice(doc);

      return {
        ...(doc as any),
        ...computed,
      };
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.totalPaid).toBe(200); // Computed from payments
    expect(fetched!.settledPaymentCount).toBe(1);
    expect(fetched!.amountPaid).toBe(200); // Stored field (updated by reaction)
    expect(fetched!.amountDue).toBe(400); // Stored field (total - amountPaid)

    // Both fields exist independently
    expect(typeof fetched!.amountPaid).toBe("number");
    expect(typeof fetched!.totalPaid).toBe("number");
  });
});
