/**
 * PL-ACCOUNTING matching proof.
 *
 * AC-283 (CF-6.4-01): an imported payment keeps source, external id, amount,
 *   date, method, event/invoice reference, and waits unresolved in the queue.
 * AC-624 (BE-15.2-06): imported rows never change live receivables; reference
 *   rows (quotes, invoices) are closed at import as "reference only".
 * AC-284 / AC-623 / AC-090 (CF-6.4-02, BE-15.2-05, PR05-07): the same id
 *   matches in one step; a row that only has the same amount stays a
 *   suggestion until a person picks it; one Capsule payment is matched once.
 * Import harness follows financial-row-classification.runtime.test.ts.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

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
  extra: Row = {},
) => ({
  PaymentID,
  PaymentAmount,
  PaymentType,
  PaymentDate: "2026-06-20",
  PaymentMethod: "Check",
  InvoiceID: "INV-900",
  EventID: "EV-77",
  ...extra,
});

async function settledPayment(
  proof: Proof,
  owner: Actor,
  invoice: { invoiceId: string; clientId: string },
  amount: number,
  extra: Row = {},
): Promise<string> {
  const payment = (await proof.executeCommand(
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
  await proof.executeCommand(owner, api.mutations.Payment_settle, {
    docId: payment.docId,
  });
  return payment.docId;
}

describe("imported payment matching (PL-ACCOUNTING)", () => {
  it("same id matches in one step, look-alikes wait for a person, and nothing is matched twice", async () => {
    const tenantId = "tenant-acct-match";
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "acct-match-owner",
      role: "owner",
      tenantId,
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Matching client" },
    )) as { docId: string };
    const issued = (await proof.executeCommand(
      owner,
      api.mutations.Invoice_createViaIssue,
      {
        clientId: client.docId,
        invoiceNumber: "M-1",
        subtotal: 1500,
        taxAmount: 0,
        discountAmount: 0,
        total: 1500,
      },
    )) as { docId: string };
    await proof.executeCommand(owner, api.mutations.Invoice_send, {
      docId: issued.docId,
    });
    const invoice = { invoiceId: issued.docId, clientId: client.docId };

    // Capsule already has the money: one payment carries the accounting id.
    const withId = await settledPayment(proof, owner, invoice, 100, {
      externalSource: "quickbooks_online",
      externalPaymentId: "QB-1",
    });
    const lookAlike = await settledPayment(proof, owner, invoice, 900, {
      occurredAt: Date.UTC(2026, 5, 21),
    });
    const receivables = async () =>
      (await owner.run(async (ctx) => ({
        invoice: await ctx.db.get(issued.docId as never),
        payments: (await ctx.db.query("payments").collect()).filter(
          (p) => (p as Row).tenantId === tenantId,
        ).length,
      }))) as { invoice: Row; payments: number };
    const before = await receivables();
    expect(before.invoice).toMatchObject({ amountPaid: 1000, amountDue: 500 });

    const result = await importPayments(owner, [
      row("P-1", "100.00", "Payment", { QuickBooksTransactionId: "QB-1" }),
      row("P-2", "900.00", "Payment"),
      row("P-5", "3.50", "Processing Fee"),
      row("P-7", "1500.00", "Quote"),
      row("P-8", "1500.00", "Invoice"),
    ]);
    expect(result.parseErrors).toBe(0);

    const links = async () =>
      new Map(
        (
          (await owner.run(async (ctx) =>
            (await ctx.db.query("externalRecordLinks").collect()).filter(
              (l) =>
                (l as Row).tenantId === tenantId &&
                (l as Row).recordType === "payment",
            ),
          )) as unknown as Row[]
        ).map((l) => [String(l.externalId), l]),
      );

    // AC-283: the row keeps what the old system said and waits unresolved.
    let byId = await links();
    const p2 = byId.get("P-2")!;
    expect(p2).toMatchObject({
      sourceSystem: "tpp_legacy",
      conflictStatus: "pending_conflict",
      capsuleId: "",
    });
    expect(JSON.parse(String(p2.rawSourceData))).toMatchObject({
      externalId: "P-2",
      amount: 900,
      method: expect.any(String),
      recordedAt: expect.any(Number),
      eventId: "EV-77",
      invoiceId: "INV-900",
    });

    // AC-624: nothing imported touches live receivables; references close.
    expect(await receivables()).toEqual(before);
    for (const id of ["P-7", "P-8"]) {
      expect(byId.get(id)).toMatchObject({ conflictStatus: "resolved" });
      expect(String(byId.get(id)!.resolutionNote)).toContain("reference only");
    }

    // AC-284 / AC-090: only the same-id row is matched in one step.
    const bulk = (await owner.mutation(
      api.importPaymentMatch.matchSameIdPayments,
      {},
    )) as { matched: number };
    expect(bulk.matched).toBe(1);
    byId = await links();
    expect(byId.get("P-1")).toMatchObject({
      capsuleId: withId,
      conflictStatus: "resolved",
    });
    // AC-623: the 900.00 look-alike is left for a person.
    expect(byId.get("P-2")).toMatchObject({
      capsuleId: "",
      conflictStatus: "pending_conflict",
    });
    const matched = (await owner.run(async (ctx) =>
      ctx.db.get(withId as never),
    )) as Row;
    expect(matched).toMatchObject({
      reconciliationStatus: "matched",
      matchedExternalId: "P-1",
      externalPaymentId: "QB-1",
    });

    // A second row cannot claim a payment that is already matched.
    await expect(
      owner.mutation(api.importPaymentMatch.matchImportedPayment, {
        linkId: p2._id,
        paymentId: withId,
      }),
    ).rejects.toThrow(/already matched/);

    // The person picks the look-alike.
    await owner.mutation(api.importPaymentMatch.matchImportedPayment, {
      linkId: p2._id,
      paymentId: lookAlike,
    });
    byId = await links();
    expect(byId.get("P-2")).toMatchObject({
      capsuleId: lookAlike,
      conflictStatus: "resolved",
    });

    // And the fee row cannot be put on that same payment again.
    await expect(
      owner.mutation(api.importPaymentMatch.matchImportedPayment, {
        linkId: byId.get("P-5")!._id,
        paymentId: lookAlike,
      }),
    ).rejects.toThrow(/already matched/);
    expect((await links()).get("P-5")).toMatchObject({
      capsuleId: "",
      conflictStatus: "pending_conflict",
    });

    // Still nothing changed in what the client owes.
    expect(await receivables()).toEqual(before);
  });
});
