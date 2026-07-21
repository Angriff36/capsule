/**
 * Runtime proof: Client.register → PaymentMethod.register → makeDefault →
 * expire → reactivate → Payment.record(paymentMethodId) → settle.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  PaymentMethodRegisterParamsSchema,
  PaymentRecordParamsSchema,
} from "../../schemas/manifest-schemas";

const S = {
  tenantA: "tenant-pmethod-a",
  tenantB: "tenant-pmethod-b",
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
      companyName: `Payment method client ${tenantId}`,
    },
  )) as { docId: string };
  return client.docId;
}

describe("runtime proof: PaymentMethod → Payment linkage", () => {
  it("registers, defaults, expires, reactivates, and links into payment record", async () => {
    const proof = harness();
    const clientId = await seedClient(proof, S.tenantA);
    const finance = proof.asRole({
      subject: "finance-pmethod-a",
      role: "finance_manager",
      tenantId: S.tenantA,
    });

    const registerArgs = {
      clientId,
      methodType: "card" as const,
      provider: "Visa",
      lastFour: "4242",
      isDefault: false,
    };
    expect(() =>
      PaymentMethodRegisterParamsSchema.parse(registerArgs),
    ).not.toThrow();

    const method = (await proof.executeCommand(
      finance,
      api.mutations.PaymentMethod_createViaRegister,
      registerArgs,
    )) as { docId: string };

    const registered = await finance.run(async (ctx) =>
      ctx.db.get(method.docId as never),
    );
    expect(registered).toMatchObject({
      tenantId: S.tenantA,
      clientId,
      methodType: "card",
      lastFour: "4242",
      status: "active",
      isDefault: false,
      registeredAt: expect.any(Number),
      version: 1,
    });

    await proof.executeCommand(
      finance,
      api.mutations.PaymentMethod_makeDefault,
      {
        docId: method.docId,
        version: 1,
      },
    );
    const asDefault = await finance.run(async (ctx) =>
      ctx.db.get(method.docId as never),
    );
    expect(asDefault).toMatchObject({ isDefault: true, version: 2 });

    await proof.executeCommand(finance, api.mutations.PaymentMethod_expire, {
      docId: method.docId,
      version: 2,
    });
    const expired = await finance.run(async (ctx) =>
      ctx.db.get(method.docId as never),
    );
    expect(expired).toMatchObject({
      status: "expired",
      expiredAt: expect.any(Number),
      version: 3,
    });

    await proof.executeCommand(
      finance,
      api.mutations.PaymentMethod_reactivate,
      {
        docId: method.docId,
        version: 3,
      },
    );
    const activeAgain = await finance.run(async (ctx) =>
      ctx.db.get(method.docId as never),
    );
    expect(activeAgain).toMatchObject({
      status: "active",
      expiredAt: null,
      version: 4,
    });

    const invoice = (await proof.executeCommand(
      finance,
      api.mutations.Invoice_createViaIssue,
      {
        clientId,
        invoiceNumber: "INV-PMETHOD-1",
        subtotal: 250,
        taxAmount: 0,
        discountAmount: 0,
        total: 250,
      },
    )) as { docId: string };
    await proof.executeCommand(finance, api.mutations.Invoice_send, {
      docId: invoice.docId,
      version: 1,
    });

    const paymentArgs = {
      invoiceId: invoice.docId,
      clientId,
      amount: 250,
      method: "card" as const,
      paymentMethodId: method.docId,
    };
    expect(() => PaymentRecordParamsSchema.parse(paymentArgs)).not.toThrow();

    const payment = (await proof.executeCommand(
      finance,
      api.mutations.Payment_createViaRecord,
      paymentArgs,
    )) as { docId: string };

    const recorded = await finance.run(async (ctx) =>
      ctx.db.get(payment.docId as never),
    );
    expect(recorded).toMatchObject({
      status: "pending",
      invoiceId: invoice.docId,
      paymentMethodId: method.docId,
      amount: 250,
    });

    await proof.executeCommand(finance, api.mutations.Payment_settle, {
      docId: payment.docId,
      version: 1,
    });
    const paidInvoice = await finance.run(async (ctx) =>
      ctx.db.get(invoice.docId as never),
    );
    expect(paidInvoice).toMatchObject({
      status: "paid",
      amountPaid: 250,
      amountDue: 0,
    });
  });

  it("denies kitchen staff payment-method registration", async () => {
    const proof = harness();
    const clientId = await seedClient(proof, S.tenantA);
    const kitchen = proof.asRole({
      subject: "kitchen-pmethod-a",
      role: "kitchen_staff",
      tenantId: S.tenantA,
    });

    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.PaymentMethod_createViaRegister,
        {
          clientId,
          methodType: "cash",
        },
      ),
    ).rejects.toThrow();

    const finance = proof.asRole({
      subject: "finance-pmethod-reader",
      role: "finance_manager",
      tenantId: S.tenantA,
    });
    const listed = (await finance.query(
      api.queries.listPaymentMethod,
      {},
    )) as Array<{ clientId?: string | null }>;
    expect(listed.some((row) => row.clientId === clientId)).toBe(false);
  });

  it("keeps payment methods tenant-isolated", async () => {
    const proof = harness();
    const clientA = await seedClient(proof, S.tenantA);
    const financeA = proof.asRole({
      subject: "finance-pmethod-a2",
      role: "finance_manager",
      tenantId: S.tenantA,
    });
    await proof.executeCommand(
      financeA,
      api.mutations.PaymentMethod_createViaRegister,
      {
        clientId: clientA,
        methodType: "ach",
        lastFour: "9999",
      },
    );

    const financeB = proof.asRole({
      subject: "finance-pmethod-b",
      role: "finance_manager",
      tenantId: S.tenantB,
    });
    const listedB = (await financeB.query(
      api.queries.listPaymentMethod,
      {},
    )) as Array<{ lastFour?: string | null }>;
    expect(listedB.some((row) => row.lastFour === "9999")).toBe(false);
  });
});
