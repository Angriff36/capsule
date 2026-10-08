/**
 * AC-086 (PR05-03): old invoices are rebuilt from the records an import kept,
 * as a preview. It shows client and event links, invoice numbers, currency,
 * lines, tax, service charge, deposits, credits, dates and what was still
 * owed. Pieces the old records do not have stay named as missing; no line or
 * tax is made up. Saving a checked preview keeps it with who checked it and
 * makes no invoice, payment or job.
 */
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { ReconstructedInvoice } from "../../src/lib/ledgerReconstruction";
import {
  M,
  acceptedProposalEvent,
  harness,
  invoicesOf,
  ownerOf,
  type Actor,
} from "./event-invoice.runtime.helpers";

const act = (actor: Actor) =>
  actor as unknown as {
    action: (fn: unknown, args?: unknown) => Promise<unknown>;
    query: (fn: unknown, args?: unknown) => Promise<unknown>;
    mutation: (fn: unknown, args?: unknown) => Promise<unknown>;
  };
const importFile = (owner: Actor, datasetType: string, rows: unknown[]) =>
  act(owner).action(api.quickImport.importFile, {
    datasetType,
    sourceSystem: "tpp_legacy",
    rows,
  }) as Promise<{ committed: number }>;

type Preview = {
  invoices: ReconstructedInvoice[];
  reviews: {
    key: string;
    checkedBy: string | null;
    checkedAt: number | null;
  }[];
};
const preview = (actor: Actor) =>
  act(actor).action(api.ledgerReconstruction.preview, {}) as Promise<Preview>;

const scheduled = (ctx: unknown) =>
  (
    ctx as {
      db: {
        system: {
          query: (table: "_scheduled_functions") => {
            collect: () => Promise<unknown[]>;
          };
        };
      };
    }
  ).db.system
    .query("_scheduled_functions")
    .collect();

const row = (
  PaymentID: string,
  PaymentAmount: string,
  PaymentType: string,
  extra: Record<string, string> = {},
) => ({
  PaymentID,
  PaymentAmount,
  PaymentType,
  PaymentDate: "2024-06-01",
  PaymentMethod: "Check",
  ...extra,
});

describe("old invoice rebuild preview (AC-086)", () => {
  it("previews every piece the old records give and names what they do not", async () => {
    const proof = harness();
    const tenantId = "tenant-ac086";
    const owner = await ownerOf(proof, tenantId, "o-ac086");
    // A Capsule event with an accepted proposal: its lines and tax are the
    // only source of line detail.
    const booked = await acceptedProposalEvent(proof, owner, "AC-086 gala");

    await importFile(owner, "contacts", [
      { ContactID: "C-1", FirstName: "Old", LastName: "Client" },
    ]);
    const events = [
      ["E-1", "C-1", "12500.00", "5000.00", "Past wedding"],
      ["E-2", "C-9", "800.00", "", "Lost client lunch"],
      ["E-3", "C-1", "600.00", "", "Gala from proposal"],
    ].map(([EventID, ClientID, TotalRevenue, DepositAmount, EventName]) => ({
      EventID,
      EventName,
      ClientID,
      EventDate: "2024-06-15",
      StartTime: "18:00",
      ExpectedCount: 50,
      TotalRevenue,
      ...(DepositAmount ? { DepositAmount } : {}),
      EventStatus: "Completed",
    }));
    await importFile(owner, "events", events);
    const old77 = { EventID: "E-1", InvoiceID: "OLD-77" };
    await importFile(owner, "payments", [
      row("P-1", "5000.00", "Deposit", {
        ...old77,
        QuickBooksTransactionId: "QB-1",
      }),
      row("P-2", "7000.00", "Balance Payment", old77),
      row("P-3", "(250.00)", "Refund", old77),
      row("P-4", "3.50", "Processing Fee", old77),
      row("P-5", "100.00", "Tip", old77),
      row("P-6", "200.00", "Credit Memo", old77),
      row("P-7", "12500.00", "Invoice", {
        ...old77,
        PaymentDate: "2024-05-01",
      }),
      row("P-8", "600.00", "Balance", old77),
      // The same deposit in an overlapping report.
      row("R-1", "5000.00", "Deposit", {
        ...old77,
        QuickBooksTransactionId: "QB-1",
      }),
      row("P-9", "300.00", "Payment", { EventID: "E-2" }),
      row("P-10", "600.00", "Invoice", { EventID: "E-3", InvoiceID: "OLD-90" }),
      row("P-11", "600.00", "Payment", { EventID: "E-3", InvoiceID: "OLD-90" }),
    ]);
    // Finance matched old event E-3 to the Capsule event with the proposal.
    const e3 = (
      (await owner.run(async (ctx) =>
        ctx.db.query("externalRecordLinks").collect(),
      )) as { _id: string; recordType: string; externalId: string }[]
    ).find((link) => link.recordType === "event" && link.externalId === "E-3")!;
    await proof.executeCommand(owner, M.ExternalRecordLink_updateCapsuleId, {
      docId: e3._id,
      capsuleId: booked.eventId,
    });
    const before = await owner.run(async (ctx) => ({
      jobs: (await scheduled(ctx)).length,
      payments: (await ctx.db.query("payments").collect()).length,
    }));

    const { invoices } = await preview(owner);
    const byKey = new Map(invoices.map((invoice) => [invoice.key, invoice]));

    const wedding = byKey.get("OLD-77")!;
    expect(wedding).toMatchObject({
      invoiceNumber: "OLD-77",
      sourceEventIds: ["E-1"],
      eventTitle: "Past wedding",
      currency: { code: "USD", fromOldRecords: false },
      lines: [],
      taxAmount: null,
      serviceCharge: null,
      total: 12500,
      totalFrom: "old invoice row P-7",
      // 5000 + 7000 - 250 back; fees, tips and the credit are not payments.
      paid: 11750,
      // 12500 - 11750 - 200 credit.
      unpaidBalance: 550,
      oldBalance: 600,
    });
    // The invoice row's own date (1 May), not the event day (15 June).
    expect(wedding.effectiveDate).toBeGreaterThan(Date.parse("2024-04-30"));
    expect(wedding.effectiveDate).toBeLessThan(Date.parse("2024-05-02"));
    expect(wedding.eventId).toBeTruthy();
    expect(wedding.clientId).toBeTruthy();
    expect(wedding.deposits.map((m) => [m.rowId, m.amount])).toEqual([
      ["P-1", 5000],
    ]);
    expect(wedding.payments.map((m) => m.amount)).toEqual([7000]);
    expect(wedding.refunds.map((m) => m.amount)).toEqual([250]);
    expect(wedding.credits.map((m) => m.amount)).toEqual([200]);
    expect(wedding.feesAndTips.map((m) => [m.label, m.amount])).toEqual([
      ["processing fee", 3.5],
      ["tip", 100],
    ]);
    expect(wedding.countedOnce.map((m) => m.rowId)).toEqual(["R-1"]);
    for (const piece of [
      "line items",
      "service charge",
      "tax",
      "currency",
      "old balance line says 600.00, the rows add up to 550.00",
    ])
      expect(wedding.missing.join(" | ")).toContain(piece);

    // An old event with no invoice number and a client that never came over.
    const lunch = byKey.get("event:E-2")!;
    expect(lunch).toMatchObject({
      invoiceNumber: null,
      eventId: null,
      clientId: null,
      total: 800,
      totalFrom: "old event price",
      paid: 300,
      unpaidBalance: 500,
    });
    for (const piece of ["invoice number", "client", "Capsule event"])
      expect(lunch.missing.join(" | ")).toContain(piece);

    // Matched to a Capsule event with a proposal: lines and tax come from it.
    const gala = byKey.get("OLD-90")!;
    expect(gala).toMatchObject({
      eventId: booked.eventId,
      clientId: booked.clientId,
      taxAmount: 0,
      serviceCharge: 0,
      total: 600,
      paid: 600,
      unpaidBalance: 0,
    });
    expect(gala.lines.map((line) => line.description)).toEqual([
      "Plated dinner",
    ]);
    expect(gala.linesFrom).toMatch(/^proposal /);
    expect(gala.missing.join(" | ")).not.toContain("line items");
    expect(gala.missing.join(" | ")).not.toContain("tax");

    // Saving a checked preview keeps who checked it; saving again replaces it.
    await act(owner).action(api.ledgerReconstruction.saveChecked, {
      key: "OLD-77",
    });
    await act(owner).action(api.ledgerReconstruction.saveChecked, {
      key: "OLD-77",
    });
    const { reviews } = await preview(owner);
    expect(reviews.filter((review) => review.key === "OLD-77")).toHaveLength(1);
    expect(reviews[0].checkedBy).toBeTruthy();
    expect(reviews[0].checkedAt).toBeTypeOf("number");

    // Nothing live changed: no invoice beyond the proposal's own, no payment,
    // no job.
    const after = await owner.run(async (ctx) => ({
      jobs: (await scheduled(ctx)).length,
      payments: (await ctx.db.query("payments").collect()).length,
    }));
    expect(after).toEqual(before);
    expect(
      (await invoicesOf(owner, tenantId)).filter((invoice) =>
        String(invoice.invoiceNumber ?? "").startsWith("OLD-"),
      ),
    ).toEqual([]);

    // Kitchen staff cannot see old money.
    const cook = proof.asRole({
      subject: "k-ac086",
      role: "kitchen_lead",
      tenantId,
    });
    expect(await preview(cook)).toBeNull();
    await expect(
      act(cook).action(api.ledgerReconstruction.saveChecked, {
        key: "OLD-90",
      }),
    ).rejects.toThrow(/finance staff and managers/);
  });
});
