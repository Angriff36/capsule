/**
 * AC-093 (PR05-10) runtime proof.
 *
 * Old-system payment rows go through the real import and matching, Capsule
 * payments through the real payment commands. The money check then ties the
 * two by month, currency and result: every row that does not agree is listed
 * with its old row id and Capsule payment id; the same money seen twice and
 * record-only rows are shown but not counted; the month comes from the date
 * the money moved, not the import date; a saved copy reads back unchanged.
 * Second half: a paid event with no food or labor cost never shows a fully
 * known profit.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  buildFinanceReconciliation,
  readSavedReconciliation,
  type ReconciliationInvoice,
  type ReconciliationPayment,
  type ReconciliationSourceRow,
} from "../../src/lib/financeReconciliation";
import { buildProfitMarginReport } from "../../src/features/finance/profitMarginReport";
import { SavedReportDefinitionCreateDefinitionParamsSchema } from "../../schemas/manifest-schemas";

type Proof = ReturnType<typeof createManifestTestContext>;
type Actor = ReturnType<Proof["asRole"]>;
type Row = Record<string, unknown>;
const act = (actor: Actor) =>
  actor as unknown as {
    action: (fn: unknown, args?: unknown) => Promise<unknown>;
  };

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function importPayments(owner: Actor, rows: Row[]) {
  const { importRunId } = (await owner.mutation(
    api.importCoordinator.startImport,
    { sourceSystem: "tpp_legacy", datasetType: "payments" },
  )) as { importRunId: string };
  const counts = JSON.stringify({ payments: rows.length });
  await owner.mutation(api.mutations.ImportRun_recordParse, {
    docId: importRunId,
    recordCounts: counts,
  });
  await owner.mutation(api.mutations.ImportRun_validate, {
    docId: importRunId,
  });
  await owner.mutation(api.mutations.ImportRun_beginReview, {
    docId: importRunId,
  });
  await owner.mutation(api.mutations.ImportRun_approveReview, {
    docId: importRunId,
    finalRecordCounts: counts,
  });
  return (await act(owner).action(api.importCommit.commitImportRun, {
    importRunId,
    rawRows: rows,
  })) as { committed: number; parseErrors: number };
}

const row = (
  PaymentID: string,
  PaymentAmount: string,
  PaymentType: string,
  PaymentDate: string,
  extra: Row = {},
) => ({
  PaymentID,
  PaymentAmount,
  PaymentType,
  PaymentDate,
  PaymentMethod: "Check",
  InvoiceID: "INV-900",
  EventID: "EV-77",
  ...extra,
});

async function payment(
  proof: Proof,
  owner: Actor,
  invoice: { invoiceId: string; clientId: string },
  amount: number,
  extra: Row = {},
  settle = true,
): Promise<string> {
  const created = (await proof.executeCommand(
    owner,
    api.mutations.Payment_createViaRecord,
    {
      invoiceId: invoice.invoiceId,
      clientId: invoice.clientId,
      amount,
      method: "check",
      ...extra,
    },
  )) as { docId: string };
  if (settle)
    await proof.executeCommand(owner, api.mutations.Payment_settle, {
      docId: created.docId,
    });
  return created.docId;
}

describe("money check ties old-system rows to Capsule payments (AC-093)", () => {
  it("totals by month, currency and result, with every difference drillable", async () => {
    const tenantId = "tenant-recon-tieout";
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "recon-tieout-owner",
      role: "owner",
      tenantId,
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Tie-out client" },
    )) as { docId: string };
    const issued = (await proof.executeCommand(
      owner,
      api.mutations.Invoice_createViaIssue,
      {
        clientId: client.docId,
        invoiceNumber: "R-1",
        subtotal: 5000,
        taxAmount: 0,
        discountAmount: 0,
        total: 5000,
      },
    )) as { docId: string };
    await proof.executeCommand(owner, api.mutations.Invoice_send, {
      docId: issued.docId,
    });
    const invoice = { invoiceId: issued.docId, clientId: client.docId };

    const june = (day: number) => Date.UTC(2026, 5, day, 12);
    const withId = await payment(proof, owner, invoice, 100, {
      externalSource: "quickbooks_online",
      externalPaymentId: "QB-1",
      occurredAt: june(20),
    });
    const lookAlike = await payment(proof, owner, invoice, 900, {
      occurredAt: june(21),
    });
    const capsuleOnly = await payment(proof, owner, invoice, 250, {
      occurredAt: june(25),
    });
    // Not come in yet: never counted as money on the Capsule side.
    await payment(proof, owner, invoice, 40, { occurredAt: june(26) }, false);

    const imported = await importPayments(owner, [
      row("P-1", "100.00", "Payment", "2026-06-20", {
        QuickBooksTransactionId: "QB-1",
      }),
      row("P-2", "850.00", "Payment", "2026-06-20"),
      row("P-3", "300.00", "Payment", "2026-07-03"),
      // The same accounting transaction again, in an overlapping report.
      row("P-4", "100.00", "Deposit", "2026-06-20", {
        QuickBooksTransactionId: "QB-1",
      }),
      row("P-7", "1500.00", "Quote", "2026-06-20"),
    ]);
    expect(imported.parseErrors).toBe(0);
    await owner.mutation(api.importPaymentMatch.matchSameIdPayments, {});
    const linksNow = (await owner.query(
      api.queries.listExternalRecordLink,
      {},
    )) as unknown as ReconciliationSourceRow[];
    const p2 = linksNow.find((link) => link.externalId === "P-2")!;
    // A person pairs the look-alike, though the amounts are 50.00 apart.
    await owner.mutation(api.importPaymentMatch.matchImportedPayment, {
      linkId: p2._id,
      paymentId: lookAlike,
    });

    // Read through the same list queries the page uses.
    const sourceRows = (await owner.query(
      api.queries.listExternalRecordLink,
      {},
    )) as unknown as ReconciliationSourceRow[];
    const payments = (await owner.query(
      api.queries.listPayment,
      {},
    )) as unknown as ReconciliationPayment[];
    const invoices = (await owner.query(
      api.queries.listInvoice,
      {},
    )) as unknown as ReconciliationInvoice[];
    const report = buildFinanceReconciliation({
      sourceRows,
      payments,
      invoices,
      generatedAt: Date.UTC(2026, 8, 29),
    });

    expect(report.periods).toEqual([
      {
        period: "2026-06",
        currency: "USD",
        sourceTotal: 950,
        ledgerTotal: 1250,
        difference: -300,
        excludedCount: 2,
        excludedTotal: 1600,
      },
      {
        period: "2026-07",
        currency: "USD",
        sourceTotal: 300,
        ledgerTotal: 0,
        difference: 300,
        excludedCount: 0,
        excludedTotal: 0,
      },
    ]);
    const group = (period: string, result: string) =>
      report.groups.find((g) => g.period === period && g.result === result);
    expect(group("2026-06", "matched")).toMatchObject({
      count: 1,
      sourceTotal: 100,
      ledgerTotal: 100,
      difference: 0,
    });
    expect(group("2026-06", "differs")).toMatchObject({
      count: 1,
      sourceTotal: 850,
      ledgerTotal: 900,
      difference: -50,
    });
    expect(group("2026-06", "ledger_only")).toMatchObject({
      count: 1,
      ledgerTotal: 250,
    });
    expect(group("2026-06", "excluded")).toMatchObject({
      count: 2,
      sourceTotal: 0,
      ledgerTotal: 0,
    });
    expect(group("2026-07", "source_only")).toMatchObject({
      count: 1,
      sourceTotal: 300,
    });
    expect(report.matchedCount).toBe(1);

    // Every discrepancy carries the ids to look it up.
    const byResult = (result: string) =>
      report.discrepancies.filter((line) => line.result === result);
    expect(byResult("differs")).toEqual([
      expect.objectContaining({
        externalId: "P-2",
        sourceRowId: String(p2._id),
        paymentId: lookAlike,
        difference: -50,
      }),
    ]);
    expect(byResult("ledger_only")).toEqual([
      expect.objectContaining({ paymentId: capsuleOnly, externalId: null }),
    ]);
    expect(
      byResult("excluded")
        .map((line) => line.externalId)
        .sort(),
    ).toEqual(["P-4", "P-7"]);
    expect(
      byResult("excluded").find((line) => line.externalId === "P-4")!.reason,
    ).toContain("Same money as payment P-1");
    expect(report.discrepancies.some((l) => l.paymentId === withId)).toBe(
      false,
    );

    // The month is the money date; the import date is kept beside it.
    const p3 = byResult("source_only")[0];
    expect(p3).toMatchObject({ externalId: "P-3", period: "2026-07" });
    expect(new Date(p3.actualAt!).toISOString().slice(0, 10)).toBe(
      "2026-07-03",
    );
    expect(p3.importedAt).not.toBeNull();
    expect(p3.importedAt).not.toBe(p3.actualAt);

    // A window keeps only the money dated inside it.
    const july = buildFinanceReconciliation({
      sourceRows,
      payments,
      invoices,
      from: Date.UTC(2026, 6, 1),
      to: Date.UTC(2026, 6, 31, 23, 59, 59),
      generatedAt: 0,
    });
    expect(july.periods.map((p) => p.period)).toEqual(["2026-07"]);

    // Saved by a signed-in staff member (the page's own payload, checked by
    // the same schema the page's save hook uses), it reads back unchanged.
    const person = (await proof.executeCommand(
      owner,
      api.mutations.Person_createViaHire,
      {
        givenName: "Morgan",
        familyName: "Books",
        email: "morgan-books@proof.example",
        role: "staff",
        employmentType: "full_time",
      },
    )) as { docId: string };
    await proof.executeCommand(owner, api.mutations.Person_linkAccount, {
      docId: person.docId,
      authSubjectId: "recon-tieout-bookkeeper",
    });
    const bookkeeper = proof.asRole({
      subject: "recon-tieout-bookkeeper",
      role: "finance_manager",
      tenantId,
    });
    const payload = SavedReportDefinitionCreateDefinitionParamsSchema.parse({
      name: "Money check June to July",
      subjectArea: "finance",
      chartType: "table",
      sharingScope: "team",
      definition: report,
    });
    await proof.executeCommand(
      bookkeeper,
      api.mutations.SavedReportDefinition_createViaCreateDefinition,
      payload,
    );
    const saved = (await bookkeeper.query(
      api.queries.listSavedReportDefinition,
      {},
    )) as unknown as Row[];
    expect(saved).toHaveLength(1);
    expect(readSavedReconciliation(saved[0].definition)).toEqual(report);
  });
});

describe("profit with missing cost is never fully known (AC-093)", () => {
  it("counts a paid event with no food or labor cost and keeps complete ones clean", () => {
    const at = new Date(2026, 5, 15);
    const report = buildProfitMarginReport({
      closeouts: [
        {
          _id: "c-missing",
          eventId: "e-missing",
          status: "finalized",
          actualRevenue: 5000,
          actualIngredientCost: 0,
          actualLaborCost: 800,
        },
        {
          _id: "c-full",
          eventId: "e-full",
          status: "finalized",
          actualRevenue: 4000,
          actualIngredientCost: 1200,
          actualLaborCost: 900,
        },
      ],
      events: [
        { _id: "e-missing", clientId: "k", startsAt: at.getTime() },
        { _id: "e-full", clientId: "k", startsAt: at.getTime() },
      ],
      clients: [{ _id: "k", clientType: "company", companyName: "K" }],
      granularity: "month",
      rangeStart: new Date(2026, 0, 1),
      rangeEnd: new Date(2026, 11, 31),
    });
    const byId = new Map(report.events.map((row) => [row.eventId, row]));
    expect(byId.get("e-missing")!.costMissingCount).toBe(1);
    expect(byId.get("e-full")!.costMissingCount).toBe(0);
    expect(report.summary.costMissingCount).toBe(1);
    expect(report.periods[0].costMissingCount).toBe(1);
    expect(report.clients[0].costMissingCount).toBe(1);
  });
});
