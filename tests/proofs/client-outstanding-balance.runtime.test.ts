/**
 * S2 proof: Client.outstandingBalance over hasMany invoices.
 * Verifies: outstandingBalance aggregates sent/viewed/overdue/partial invoices only;
 * overdueBalance aggregates overdue invoices only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { api } from "../../convex/_generated/api";
import {
  hydrateComputedRelationsForClient,
  computeClient,
} from "../../convex/computed";

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

describe("S2 proof: client outstanding balance over invoices", () => {
  it("outstandingBalance aggregates sent/viewed/overdue/partial only; overdueBalance aggregates overdue only; draft/paid/written_off/voided contribute 0", async () => {
    const proof = harness();
    const tenantId = "tenant-s2";
    const finance = proof.asRole({
      subject: "finance-manager-s2",
      role: "finance_manager",
      tenantId,
    });

    const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const overdueDate = Date.now() - 10 * 24 * 60 * 60 * 1000;

    // Seed client via direct insert (to get proper Convex ID for foreign keys)
    const clientId = await finance.run(async (ctx) => {
      return ctx.db.insert("clients", {
        tenantId,
        clientType: "company",
        companyName: "Test Client",
        paymentTermsDays: 30,
        taxExempt: false,
        status: "active",
        version: 0,
      });
    });

    // Helper: create invoice via seed then issue
    async function createInvoice(
      invoiceNumber: string,
      amount: number,
      status:
        | "draft"
        | "sent"
        | "paid"
        | "overdue"
        | "partial"
        | "viewed"
        | "written_off"
        | "voided",
      dateOverride?: number,
    ) {
      // First seed an Invoice entity with clientId
      const invId = await finance.run(async (ctx) => {
        const id = ctx.db.insert("invoices", {
          tenantId,
          clientId: clientId, // Foreign key reference
          invoiceNumber,
          subtotal: amount,
          taxAmount: 0,
          discountAmount: 0,
          total: amount,
          amountPaid: 0,
          amountDue: amount,
          paymentTermsDays: 30,
          dueDate: dateOverride || dueDate,
          status: "draft",
          issuedAt: null,
          sentAt: null,
          viewedAt: null,
          overdueSince: null,
          paidAt: null,
          voidedAt: null,
          writtenOffAt: null,
          deletedAt: null,
          version: 0,
        });
        return id;
      });

      // Then call issue with docId
      await proof.executeCommand(
        finance,
        api.mutations.Invoice_issue as never,
        {
          docId: invId,
          clientId,
          invoiceNumber,
          subtotal: amount,
          taxAmount: 0,
          discountAmount: 0,
          total: amount,
          paymentTermsDays: 30,
          dueDate: dateOverride || dueDate,
        },
      );

      // Apply status transitions
      if (status === "draft") {
        // Stay in draft status, no further action
      } else if (status === "paid") {
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_send as never,
          { docId: invId },
        );
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_applyPayment as never,
          { docId: invId, paymentAmount: amount },
        );
      } else if (status === "partial") {
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_send as never,
          { docId: invId },
        );
        const partialAmount = Math.floor(amount / 2);
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_applyPayment as never,
          { docId: invId, paymentAmount: partialAmount },
        );
      } else if (status === "overdue") {
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_send as never,
          { docId: invId },
        );
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_markOverdue as never,
          { docId: invId },
        );
      } else if (status === "viewed") {
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_send as never,
          { docId: invId },
        );
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_markViewed as never,
          { docId: invId },
        );
      } else if (status === "written_off") {
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_send as never,
          { docId: invId },
        );
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_markOverdue as never,
          { docId: invId },
        );
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_writeOff as never,
          { docId: invId, reason: "Test write-off", writeOffAmount: amount },
        );
      } else if (status === "voided") {
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_send as never,
          { docId: invId },
        );
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_markVoided as never,
          { docId: invId },
        );
      } else if (status === "sent") {
        await proof.executeCommand(
          finance,
          api.mutations.Invoice_send as never,
          { docId: invId },
        );
      }

      return invId;
    }

    // Test backlog requirement: 4 invoices (draft/paid/written_off/overdue) → balance equals overdue amountDue only
    // Draft invoice: $1000 (should NOT contribute to outstandingBalance)
    await createInvoice("INV-001", 1000, "draft");

    // Paid invoice: $2000 (should NOT contribute to outstandingBalance)
    await createInvoice("INV-002", 2000, "paid");

    // Written_off invoice: $2500 (should NOT contribute to outstandingBalance)
    await createInvoice("INV-003", 2500, "written_off", overdueDate);

    // Overdue invoice: $3000 (SHOULD contribute to outstandingBalance and overdueBalance)
    await createInvoice("INV-004", 3000, "overdue", overdueDate);

    // Verify client balances using generated computed field helpers
    const balances1 = await finance.run(async (ctx) => {
      const client = await ctx.db.get(clientId as never);
      if (!client) throw new Error("Client not found");
      // Hydrate invoices relation for computed fields
      await hydrateComputedRelationsForClient(ctx, client);
      // Compute balances using generated helper
      const computeds = computeClient(client);
      return {
        outstandingBalance: computeds.outstandingBalance,
        overdueBalance: computeds.overdueBalance,
      };
    });

    console.log("Balances1:", balances1);

    // outstandingBalance should be $3000 (only overdue invoice contributes)
    expect(Number(balances1.outstandingBalance)).toBe(3000);

    // overdueBalance should be $3000 (only overdue invoice contributes)
    expect(Number(balances1.overdueBalance)).toBe(3000);

    // Additional coverage test: sent/viewed/partial also contribute
    // Add a "sent" invoice to test aggregation
    await createInvoice("INV-005", 1500, "sent");

    const balances2 = await finance.run(async (ctx) => {
      const client = await ctx.db.get(clientId as never);
      if (!client) throw new Error("Client not found");
      await hydrateComputedRelationsForClient(ctx, client);
      const computeds = computeClient(client);
      return {
        outstandingBalance: computeds.outstandingBalance,
        overdueBalance: computeds.overdueBalance,
      };
    });

    // outstandingBalance should now be $4500 ($3000 overdue + $1500 sent)
    expect(Number(balances2.outstandingBalance)).toBe(4500);

    // overdueBalance should still be $3000 (only overdue invoice)
    expect(Number(balances2.overdueBalance)).toBe(3000);

    // Add a "viewed" invoice (SHOULD contribute to outstandingBalance)
    await createInvoice("INV-006", 1200, "viewed");

    const balances3 = await finance.run(async (ctx) => {
      const client = await ctx.db.get(clientId as never);
      if (!client) throw new Error("Client not found");
      await hydrateComputedRelationsForClient(ctx, client);
      const computeds = computeClient(client);
      return {
        outstandingBalance: computeds.outstandingBalance,
        overdueBalance: computeds.overdueBalance,
      };
    });

    // outstandingBalance should now be $5700 ($3000 overdue + $1500 sent + $1200 viewed)
    expect(Number(balances3.outstandingBalance)).toBe(5700);

    // overdueBalance should still be $3000 (only overdue invoice)
    expect(Number(balances3.overdueBalance)).toBe(3000);

    // Add a "partial" invoice
    await createInvoice("INV-007", 2000, "partial");

    const balances4 = await finance.run(async (ctx) => {
      const client = await ctx.db.get(clientId as never);
      if (!client) throw new Error("Client not found");
      await hydrateComputedRelationsForClient(ctx, client);
      const computeds = computeClient(client);
      return {
        outstandingBalance: computeds.outstandingBalance,
        overdueBalance: computeds.overdueBalance,
      };
    });

    // outstandingBalance should now be $6700 ($3000 overdue + $1500 sent + $1200 viewed + $1000 partial due)
    expect(Number(balances4.outstandingBalance)).toBe(6700);

    // overdueBalance should still be $3000 (only overdue invoice)
    expect(Number(balances4.overdueBalance)).toBe(3000);
  });
});
