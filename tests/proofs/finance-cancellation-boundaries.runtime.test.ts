import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeEach(() =>
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  ),
);
afterEach(() => vi.unstubAllEnvs());
function harness() {
  const proof = createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
  const admin = proof.asRole({
    subject: "boundary-owner",
    role: "admin",
    tenantId: "boundary-tenant",
  });
  return { proof, admin };
}

it("rejects a direct zero-balance send without changing the invoice, while allowing a positive-balance send", async () => {
  const { proof, admin } = harness();
  const client = (await proof.executeCommand(
    admin,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: "Garden Club" },
  )) as { docId: string };
  for (const total of [0, 125]) {
    const invoice = (await proof.executeCommand(
      admin,
      api.mutations.Invoice_createViaIssue,
      {
        clientId: client.docId,
        invoiceNumber: `INV-${total}`,
        subtotal: total,
        total,
        taxAmount: 0,
        discountAmount: 0,
      },
    )) as { docId: string };
    if (total === 0) {
      await expect(
        proof.executeCommand(admin, api.mutations.Invoice_send, {
          docId: invoice.docId,
          version: 1,
        }),
      ).rejects.toThrow("Cannot send an invoice with zero balance");
      expect(
        await admin.run((ctx) => ctx.db.get(invoice.docId as never)),
      ).toMatchObject({ status: "draft", version: 1, amountDue: 0 });
    } else {
      await proof.executeCommand(admin, api.mutations.Invoice_send, {
        docId: invoice.docId,
        version: 1,
      });
      expect(
        await admin.run((ctx) => ctx.db.get(invoice.docId as never)),
      ).toMatchObject({ status: "sent", version: 2, amountDue: 125 });
    }
  }
});

it("finds paid invoice numbers beyond the first page and applies tenant, deletion, and age filters through searchAll", async () => {
  const { proof, admin } = harness();
  const now = Date.UTC(2026, 8, 8);
  const client = (await proof.executeCommand(
    admin,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: "Search client" },
  )) as { docId: string };
  const invoice = (await proof.executeCommand(
    admin,
    api.mutations.Invoice_createViaIssue,
    {
      clientId: client.docId,
      invoiceNumber: "SEED",
      subtotal: 3600,
      total: 3600,
      taxAmount: 0,
      discountAmount: 0,
    },
  )) as { docId: string };
  const ids = await admin.run(async (ctx) => {
    const original = await ctx.db.get(invoice.docId as never);
    if (!original) throw Error("Missing invoice fixture");
    // Clone a valid generated document for a large ledger fixture. Omitted
    // deletedAt deliberately reproduces older imports that still must be searchable.
    const { _id, _creationTime, deletedAt, ...base } =
      original as import("../../convex/_generated/dataModel").Doc<"invoices">;
    await ctx.db.patch(invoice.docId as never, { status: "paid" });
    for (let i = 0; i < 125; i++)
      await ctx.db.insert("invoices", {
        ...base,
        invoiceNumber: `FILLER-${i}`,
        status: "paid",
        amountDue: 0,
      });
    const paid = await ctx.db.insert("invoices", {
      ...base,
      invoiceNumber: "INV-2026-QA1",
      status: "paid",
      amountDue: 0,
      amountPaid: 3600,
    });
    await ctx.db.insert("invoices", {
      ...base,
      invoiceNumber: "INV-2026-QA1",
      tenantId: "outsider",
      status: "paid",
    });
    await ctx.db.insert("invoices", {
      ...base,
      invoiceNumber: "INV-2026-QA1",
      deletedAt: now,
      status: "paid",
    });
    const old = await ctx.db.insert("invoices", {
      ...base,
      invoiceNumber: "INV-OLD",
      status: "overdue",
      amountDue: 900,
      dueDate: now - 40 * 86400000,
    });
    await ctx.db.insert("invoices", {
      ...base,
      invoiceNumber: "INV-YOUNG",
      status: "overdue",
      amountDue: 800,
      dueDate: now - 10 * 86400000,
    });
    const firstPage = (await ctx.db.query("invoices").collect())
      .filter((row) => row.tenantId === "boundary-tenant")
      .slice(0, 120);
    expect(firstPage.some((row) => row._id === paid)).toBe(false);
    return { paid, old };
  });
  expect(
    await admin.query(api.search.searchAll, { query: "#INV-2026-QA1", now }),
  ).toEqual([
    {
      kind: "invoice",
      id: ids.paid,
      label: "#INV-2026-QA1 — $3,600",
      hint: "Invoice · paid",
      path: `/finance/invoices/${ids.paid}`,
      score: 0.9,
    },
  ]);
  expect(
    await admin.query(api.search.searchAll, {
      query: "unpaid invoices over 30 days",
      now,
    }),
  ).toEqual([
    {
      kind: "invoice",
      id: ids.old,
      label: "#INV-OLD — $900",
      hint: "Overdue 40d",
      path: `/finance/invoices/${ids.old}`,
      score: 0.5,
    },
  ]);
});

it("cancels the event's invoice and packing work with the original reason and leaves another event's work intact", async () => {
  const { proof, admin } = harness();
  const client = (await proof.executeCommand(
    admin,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: "Garden Club" },
  )) as { docId: string };
  const records: Array<{ event: string; invoice: string; pack: string }> = [];
  for (const title of ["Cancelled dinner", "Other dinner"]) {
    const event = (await proof.executeCommand(
      admin,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title,
        eventType: "dinner",
        startsAt: Date.UTC(2099, 6, 4, 17),
        endsAt: Date.UTC(2099, 6, 4, 22),
        expectedHeadcount: 40,
        primaryContactName: "Ada",
        budgetAmount: 1000,
        quotedPrice: 2000,
      },
    )) as { docId: string };
    const invoice = (await proof.executeCommand(
      admin,
      api.mutations.Invoice_createViaIssue,
      {
        clientId: client.docId,
        eventId: event.docId,
        invoiceNumber: `INV-${title}`,
        subtotal: 100,
        total: 100,
        taxAmount: 0,
        discountAmount: 0,
      },
    )) as { docId: string };
    const pack = (await proof.executeCommand(
      admin,
      api.mutations.PackList_createViaOpen,
      { eventId: event.docId, name: `${title} packing` },
    )) as { docId: string };
    records.push({
      event: event.docId,
      invoice: invoice.docId,
      pack: pack.docId,
    });
  }
  await proof.executeCommand(admin, api.mutations.Event_cancel, {
    docId: records[0].event,
    version: 1,
    reason: "Venue flooded",
  });
  expect(
    await admin.run((ctx) => ctx.db.get(records[0].event as never)),
  ).toMatchObject({ stage: "cancelled", cancellationReason: "Venue flooded" });
  expect(
    await admin.run((ctx) => ctx.db.get(records[0].invoice as never)),
  ).toMatchObject({ status: "voided", voidReason: "Venue flooded" });
  expect(
    await admin.run((ctx) => ctx.db.get(records[0].pack as never)),
  ).toMatchObject({ status: "cancelled", cancellationReason: "Venue flooded" });
  expect(
    await admin.run((ctx) => ctx.db.get(records[1].event as never)),
  ).toMatchObject({ stage: "planning", version: 1 });
  expect(
    await admin.run((ctx) => ctx.db.get(records[1].invoice as never)),
  ).toMatchObject({ status: "draft", version: 1 });
  expect(
    await admin.run((ctx) => ctx.db.get(records[1].pack as never)),
  ).toMatchObject({ status: "draft", version: 1 });
});
