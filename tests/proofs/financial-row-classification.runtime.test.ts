/**
 * AC-084 (PR05-01): every imported money row gets one class; only money that
 * moves on its own waits to be matched, and two overlapping reports never
 * both count the same money. Report totals, balances, quotes, invoices,
 * credits and applied payments are kept as reference only. Harness follows
 * import-resume-fault-injection.runtime.test.ts.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

type Actor = ReturnType<ReturnType<typeof createManifestTestContext>["asRole"]>;
const act = (actor: Actor) =>
  actor as unknown as {
    action: (fn: unknown, args?: unknown) => Promise<unknown>;
  };

async function importPayments(owner: Actor, rows: Record<string, unknown>[]) {
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
  })) as { committed: number; skipped: number; parseErrors: number };
}

const row = (
  PaymentID: string,
  PaymentAmount: string,
  PaymentType: string,
  extra: Record<string, unknown> = {},
) => ({
  PaymentID,
  PaymentAmount,
  PaymentType,
  PaymentDate: "2026-06-20",
  PaymentMethod: "Check",
  InvoiceID: "INV-900",
  ...extra,
});

describe("financial row classification (AC-084)", () => {
  it("classifies every row and counts each unit of money once across two overlapping reports", async () => {
    const tenantId = "tenant-ac084";
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "ac084-owner",
      role: "owner",
      tenantId,
    });

    // Report A: the full payments export, with every kind of row.
    const reportA = [
      row("P-1", "100.00", "Payment", { QuickBooksTransactionId: "QB-1" }),
      row("P-2", "900.00", "Balance Payment", {
        QuickBooksTransactionId: "QB-2",
      }),
      row("P-3", "(50.00)", "Refund"),
      row("P-4", "20.00", "Tip"),
      row("P-5", "3.50", "Processing Fee"),
      row("P-6", "25.00", "Credit Memo"),
      row("P-7", "1000.00", "Quote"),
      row("P-8", "1000.00", "Invoice"),
      row("P-9", "1000.00", "Payment Applied"),
      row("P-10", "0.00", "Balance"),
      row("P-11", "0.00", "Payment"),
      row("", "1023.50", "Total"),
    ];
    const first = await importPayments(owner, reportA);
    expect(first.parseErrors).toBe(0);
    expect(first.committed).toBe(reportA.length);

    // Report B: a deposits report that overlaps A — same rows by id, the
    // same bank transaction under another id, and its own subtotal line.
    const reportB = [
      row("P-1", "100.00", "Payment", { QuickBooksTransactionId: "QB-1" }),
      row("DEP-77", "900.00", "Deposit", { QuickBooksTransactionId: "QB-2" }),
      row("", "1000.00", "Subtotal"),
    ];
    const second = await importPayments(owner, reportB);
    expect(second.parseErrors).toBe(0);

    const links = (await owner.run(async (ctx) =>
      (await ctx.db.query("externalRecordLinks").collect()).filter(
        (l) =>
          (l as { tenantId: string }).tenantId === tenantId &&
          (l as { recordType: string }).recordType === "payment",
      ),
    )) as unknown as {
      externalId: string;
      conflictStatus: string;
      rawSourceData: string;
      resolutionNote: string;
    }[];
    const byId = new Map(links.map((l) => [l.externalId, l]));
    const classOf = (id: string) =>
      JSON.parse(byId.get(id)!.rawSourceData).rowClass;

    // Every source row has exactly one kept result (P-1 once for both reports).
    expect(links).toHaveLength(reportA.length + 2);
    expect(classOf("P-1")).toBe("payment");
    expect(classOf("P-2")).toBe("payment");
    expect(classOf("P-3")).toBe("refund_return");
    expect(JSON.parse(byId.get("P-3")!.rawSourceData).amount).toBe(-50);
    expect(classOf("P-4")).toBe("gratuity");
    expect(classOf("P-5")).toBe("fee");
    expect(classOf("P-6")).toBe("credit");
    expect(classOf("P-7")).toBe("quote");
    expect(classOf("P-8")).toBe("invoice");
    expect(classOf("P-9")).toBe("allocation");
    expect(classOf("P-10")).toBe("balance_snapshot");
    expect(classOf("P-11")).toBe("payment");
    expect(classOf("DEP-77")).toBe("payment");
    const totals = links.filter((l) => l.externalId.startsWith("report-line:"));
    expect(totals.map((l) => JSON.parse(l.rawSourceData).rowClass)).toEqual([
      "aggregate_report",
      "aggregate_report",
    ]);

    // Only money moving on its own waits for a match — once per unit.
    const waiting = links
      .filter((l) => l.conflictStatus === "pending_conflict")
      .map((l) => l.externalId)
      .sort();
    expect(waiting).toEqual(["P-1", "P-2", "P-3", "P-4", "P-5"]);
    expect(byId.get("DEP-77")!.conflictStatus).toBe("resolved");
    expect(byId.get("DEP-77")!.resolutionNote).toContain(
      "Same money as payment P-2",
    );
    expect(byId.get("P-11")!.resolutionNote).toContain("reference only");
    for (const id of ["P-6", "P-7", "P-8", "P-9", "P-10"])
      expect(byId.get(id)!.resolutionNote).toContain("reference only");

    // The money waiting adds up once: 100 + 900 - 50 + 20 + 3.50.
    const waitingMoney = links
      .filter((l) => l.conflictStatus === "pending_conflict")
      .reduce((sum, l) => sum + JSON.parse(l.rawSourceData).amount, 0);
    expect(waitingMoney).toBeCloseTo(973.5, 2);
  });
});
