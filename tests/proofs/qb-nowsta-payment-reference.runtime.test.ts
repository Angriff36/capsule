/**
 * AC-280 (CF-6.2-07): a QuickBooks payment report imports into the same
 * reconciliation queue as TPP payments, as references with source, external
 * transaction id, amount, date, type and client reference. Nothing is
 * charged and nothing is written to QuickBooks. Nowsta holds staff shifts and
 * staff pay, not client payments, so it has no client payment rows to bring
 * in. Harness follows financial-row-classification.runtime.test.ts.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import {
  isQuickBooksPaymentReport,
  quickBooksPaymentRowsFromGrid,
} from "../../src/lib/quickbooksPayments";
import { modules } from "./convex-test-modules";

type Actor = ReturnType<ReturnType<typeof createManifestTestContext>["asRole"]>;
const act = (actor: Actor) =>
  actor as unknown as {
    action: (fn: unknown, args?: unknown) => Promise<unknown>;
  };

async function importPayments(
  owner: Actor,
  sourceSystem: string,
  rows: Record<string, unknown>[],
) {
  const { importRunId } = (await owner.mutation(
    api.importCoordinator.startImport,
    { sourceSystem, datasetType: "payments" },
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
  })) as { committed: number; skipped: number; parseErrors: number };
}

// A QuickBooks Online "Transaction List by Date" export, as the file box reads it.
const transactionList = [
  ["Mangia Catering"],
  ["Transaction List by Date"],
  ["June 1-30, 2026"],
  [],
  [
    "Date",
    "Transaction type",
    "Num",
    "Posting",
    "Name",
    "Memo/Description",
    "Account",
    "Payment method",
    "Amount",
  ],
  [
    "06/02/2026",
    "Invoice",
    "6014",
    "Yes",
    "Ashley Bride",
    "Wedding",
    "Accounts Receivable",
    "",
    "4,800.00",
  ],
  [
    "06/05/2026",
    "Payment",
    "2231",
    "Yes",
    "Ashley Bride",
    "Deposit for 6014",
    "Undeposited Funds",
    "Check",
    "1,200.00",
  ],
  [
    "46183",
    "Sales Receipt",
    "1007",
    "Yes",
    "Acme Office",
    "Drop off lunch",
    "Undeposited Funds",
    "Visa",
    "$350.00",
  ],
  [
    "06/20/2026",
    "Refund",
    "",
    "Yes",
    "Acme Office",
    "Two meals short",
    "Checking",
    "Visa",
    "(40.00)",
  ],
  ["", "", "", "", "", "", "", "", ""],
  ["TOTAL", "", "", "", "", "", "", "", "$6,310.00"],
];

describe("QuickBooks payment references (AC-280)", () => {
  it("reads a QuickBooks report and puts its payments in the same match list as TPP payments", async () => {
    expect(isQuickBooksPaymentReport(transactionList)).toBe(true);
    expect(isQuickBooksPaymentReport([["First Name", "Zip"]])).toBe(false);
    const rows = quickBooksPaymentRowsFromGrid(transactionList);
    // Dated lines only: the TOTAL line and the blank line are left out.
    expect(rows).toHaveLength(4);
    expect(rows[2]!.PaymentDate).toBe("2026-06-10");
    expect(rows[2]!.PaymentMethod).toBe("Credit Card");

    const tenantId = "tenant-ac280";
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "ac280-owner",
      role: "owner",
      tenantId,
    });

    const tpp = await importPayments(owner, "tpp_legacy", [
      {
        PaymentID: "TPP-P-1",
        PaymentDate: "2026-06-01",
        PaymentAmount: "500.00",
        PaymentType: "Payment",
        PaymentMethod: "Check",
        EventID: "6014",
      },
    ]);
    expect(tpp.parseErrors).toBe(0);

    const first = await importPayments(owner, "quickbooks_online", rows);
    expect(first.parseErrors).toBe(0);
    expect(first.committed).toBe(4);

    // The same report read again: nothing is counted twice.
    const again = await importPayments(owner, "quickbooks_online", rows);
    expect(again.committed).toBe(0);
    expect(again.skipped).toBe(4);

    const links = (await owner.run(async (ctx) =>
      (await ctx.db.query("externalRecordLinks").collect()).filter(
        (l) =>
          (l as { tenantId: string }).tenantId === tenantId &&
          (l as { recordType: string }).recordType === "payment",
      ),
    )) as unknown as {
      sourceSystem: string;
      externalId: string;
      conflictStatus: string;
      rawSourceData: string;
      resolutionNote: string;
    }[];
    expect(links).toHaveLength(5);
    const qbo = links.filter((l) => l.sourceSystem === "quickbooks_online");
    expect(qbo).toHaveLength(4);

    const check = qbo.find((l) => l.externalId.includes(":Payment:2231:"))!;
    const kept = JSON.parse(check.rawSourceData) as Record<string, unknown>;
    expect(kept.amount).toBe(1200);
    expect(kept.paymentType).toBe("Payment");
    expect(kept.method).toBe("check");
    expect(kept.providerTransactionId).toBe(check.externalId);
    expect(new Date(kept.recordedAt as number).getDate()).toBe(5);
    expect(String(kept.notes)).toContain("Customer: Ashley Bride");
    expect(String(kept.notes)).toContain("QuickBooks no. 2231");
    expect(check.resolutionNote).toContain("Imported QuickBooks payment");

    // Money that moved waits for a match next to the TPP payment; the
    // invoice is kept as reference only.
    const waiting = links
      .filter((l) => l.conflictStatus === "pending_conflict")
      .map((l) => `${l.sourceSystem}:${JSON.parse(l.rawSourceData).amount}`)
      .sort();
    expect(waiting).toEqual([
      "quickbooks_online:-40",
      "quickbooks_online:1200",
      "quickbooks_online:350",
      "tpp_legacy:500",
    ]);
    const invoice = qbo.find((l) => l.externalId.includes(":Invoice:6014:"))!;
    expect(invoice.conflictStatus).toBe("resolved");
    expect(invoice.resolutionNote).toContain("reference only");
  });
});
