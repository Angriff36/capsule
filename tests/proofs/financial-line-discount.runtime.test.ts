/**
 * Runtime proof (#426): line-shaped money reports share the invoice discount
 * across the invoice's lines by line amount, so the lines add back to the
 * invoice discount. A 4-line invoice with a $100 discount reports $100 in
 * discounts, not $400. Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const tenantId = "tenant-financial-line-discount";
const day = Date.UTC(2026, 8, 20);

type Report = {
  rows: Array<{ values: Record<string, unknown> }>;
  totals?: Array<{ label?: string; value?: unknown }>;
};

describe("runtime proof: line reports do not repeat the invoice discount (#426)", () => {
  it("shares a $100 discount over four lines by line amount", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "line-discount-owner",
      role: "owner",
      tenantId,
    });
    await owner.run(async (ctx) => {
      const base = {
        tenantId,
        version: 1,
        createdAt: day,
        updatedAt: day,
        deletedAt: null,
      };
      const insert = (table: string, doc: Record<string, unknown>) =>
        ctx.db.insert(table as never, { ...base, ...doc } as never);
      const clientId = await insert("clients", {
        clientType: "company",
        companyName: "Discount Client",
        taxExempt: false,
        paymentTermsDays: 30,
        status: "active",
      });
      const eventId = await insert("events", {
        title: "Discount Dinner",
        eventType: "dinner",
        stage: "approved",
        startsAt: day,
      });
      const line = (description: string, category: string, amount: number) => ({
        description,
        category,
        quantity: 1,
        unitPrice: amount,
        unitCost: 0,
      });
      await insert("invoices", {
        clientId,
        eventId,
        invoiceNumber: "INV-DISC",
        status: "sent",
        issuedAt: day,
        subtotal: 1000,
        taxAmount: 0,
        discountAmount: 100,
        total: 900,
        amountPaid: 0,
        amountDue: 900,
        paymentTermsDays: 30,
        lineItems: [
          line("Chicken", "food", 400),
          line("Salad", "food", 300),
          line("House wine", "beverage", 200),
          line("Linens", "rental", 100),
        ],
      });
    });

    const report = (await owner.query(api.tppReports.financial.run, {
      reportId: "menu-item-itemized-sales",
      parameters: {},
    })) as Report;
    const discounts = report.rows.map((row) => Number(row.values.discount));
    expect(discounts).toEqual([40, 30, 20, 10]);
    expect(discounts.reduce((sum, value) => sum + value, 0)).toBe(100);

    const beverage = (await owner.query(api.tppReports.financial.run, {
      reportId: "beverage-costs",
      parameters: {},
    })) as Report;
    expect(beverage.rows.map((row) => row.values.discount)).toEqual([20]);
  });
});
