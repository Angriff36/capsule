/**
 * Runtime proof (AC-388 closeout slice): closing an event seeds one draft
 * closeout with zero actuals and the budget taken from the event. When the
 * budget is corrected after closeOut (Event.correctCommercial), that untouched
 * draft now follows the corrected budget (same closeout) with one section 8.2
 * closeout receipt. A draft finance already captured, and a finalized
 * closeout, keep their numbers and are flagged on the receipt instead.
 * Replaying the same correction writes nothing, and a sales manager (who may
 * correct the budget but not edit closeouts) still moves the draft.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  captureCloseout,
  correctCommercial,
  finalizeCloseout,
  harness,
  listedCloseoutFacts,
  readEventRow,
  rolesFor,
  runner,
  walkToStage,
  type CloseoutFactRow,
  type Proof,
} from "./plan-vs-fact-finalized-closeout.runtime.helpers";
import {
  readReconciliationReceipts,
  type ReceiptOutput,
} from "./single-reconciliation.runtime.helpers";

const REASON = "Client restated the quote after closeout";

async function theOneCloseout(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<CloseoutFactRow> {
  const rows = await listedCloseoutFacts(
    rolesFor(proof, tenantId).finance,
    eventId,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function closeoutReceipts(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<ReceiptOutput[]> {
  const receipts = await readReconciliationReceipts(
    rolesFor(proof, tenantId).events,
    tenantId,
  );
  return receipts.filter(
    (receipt) =>
      receipt.eventId === eventId &&
      receipt.affectedDomains.includes("closeout"),
  );
}

/** Correct the commercial seed as the sales manager at the live version. */
async function correctAsSales(
  proof: Proof,
  tenantId: string,
  eventId: string,
  budgetAmount: number,
  quotedPrice: number,
): Promise<void> {
  const roles = rolesFor(proof, tenantId);
  const event = await readEventRow(roles.events, eventId);
  await runner(proof, roles.sales)(api.mutations.Event_correctCommercial, {
    docId: eventId,
    version: event.version,
    reason: REASON,
    budgetAmount,
    quotedPrice,
  });
}

function expectBudget(
  row: CloseoutFactRow,
  revenue: number,
  cost: number,
): void {
  expect(Number(row.budgetedRevenue)).toBe(revenue);
  expect(Number(row.revenueVariance)).toBe(revenue);
  expect(Number(row.budgetedCost)).toBe(cost);
  expect(Number(row.costVariance)).toBe(cost);
  expect(Number(row.actualRevenue)).toBe(0);
  expect(Number(row.totalActualCost)).toBe(0);
  expect(Number(row.grossProfit)).toBe(0);
  expect(row.status).toBe("draft");
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: AC-388 draft closeout follows the corrected budget", () => {
  it("an untouched draft closeout follows the corrected budget with one receipt", async () => {
    const tenantId = "tenant-ac388-closeout-follow";
    const proof = harness();
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "closed_out",
      "AC-388 closeout follow",
    );
    const seeded = await theOneCloseout(proof, tenantId, eventId);
    expectBudget(seeded, 4500, 3000);

    await correctCommercial(proof, tenantId, eventId, 4000, 6000, REASON);

    const row = await theOneCloseout(proof, tenantId, eventId);
    expect(row._id).toBe(seeded._id);
    expectBudget(row, 6000, 4000);
    expect(Number(row.expectedHeadcount)).toBe(40);

    const receipts = await closeoutReceipts(proof, tenantId, eventId);
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0]!;
    expect(receipt.triggerType).toBe("EventCommercialCorrected");
    expect(receipt.affectedDomains).toEqual(["closeout"]);
    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.updatedCount).toBe(1);
    expect(receipt.preservedCount).toBe(0);
    expect(receipt.unresolved).toEqual([]);
    expect(receipt.checkpoint.state).toBe("complete");
  });

  it("replaying the same correction rewrites nothing and writes no second receipt", async () => {
    const tenantId = "tenant-ac388-closeout-replay";
    const proof = harness();
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "closed_out",
      "AC-388 closeout replay",
    );
    await correctCommercial(proof, tenantId, eventId, 4000, 6000, REASON);
    const first = await theOneCloseout(proof, tenantId, eventId);

    await correctCommercial(proof, tenantId, eventId, 4000, 6000, REASON);

    const second = await theOneCloseout(proof, tenantId, eventId);
    expect(second.version).toBe(first.version);
    expectBudget(second, 6000, 4000);
    expect(await closeoutReceipts(proof, tenantId, eventId)).toHaveLength(1);
  });

  it("a sales manager correcting back and forth leaves the draft on the latest budget", async () => {
    const tenantId = "tenant-ac388-closeout-sales";
    const proof = harness();
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "closed_out",
      "AC-388 closeout sales",
    );

    await correctAsSales(proof, tenantId, eventId, 4000, 6000);
    await correctAsSales(proof, tenantId, eventId, 3000, 4500);
    await correctAsSales(proof, tenantId, eventId, 4000, 6000);

    expectBudget(await theOneCloseout(proof, tenantId, eventId), 6000, 4000);
  });

  it("a captured draft and a finalized closeout keep their numbers and are flagged", async () => {
    const proof = harness();

    const capturedTenant = "tenant-ac388-closeout-captured";
    const captured = await walkToStage(
      proof,
      capturedTenant,
      "closed_out",
      "AC-388 closeout captured",
    );
    const draft = await theOneCloseout(proof, capturedTenant, captured.eventId);
    await captureCloseout(proof, capturedTenant, draft._id, captured.eventId);
    await correctCommercial(
      proof,
      capturedTenant,
      captured.eventId,
      4000,
      6000,
      REASON,
    );
    const keptDraft = await theOneCloseout(
      proof,
      capturedTenant,
      captured.eventId,
    );
    expect(keptDraft.status).toBe("draft");
    expect(Number(keptDraft.budgetedRevenue)).toBe(4500);
    expect(Number(keptDraft.actualRevenue)).toBe(4500);
    const draftReceipts = await closeoutReceipts(
      proof,
      capturedTenant,
      captured.eventId,
    );
    expect(draftReceipts).toHaveLength(1);
    expect(draftReceipts[0]!.updatedCount).toBe(0);
    expect(draftReceipts[0]!.unresolved).toEqual([
      { code: "closeout_review", recordIds: [String(draft._id)] },
    ]);

    const finalTenant = "tenant-ac388-closeout-final";
    const finalized = await walkToStage(
      proof,
      finalTenant,
      "closed_out",
      "AC-388 closeout final",
    );
    const toFinalize = await theOneCloseout(
      proof,
      finalTenant,
      finalized.eventId,
    );
    await captureCloseout(
      proof,
      finalTenant,
      toFinalize._id,
      finalized.eventId,
    );
    const capturedRow = await theOneCloseout(
      proof,
      finalTenant,
      finalized.eventId,
    );
    await finalizeCloseout(
      proof,
      finalTenant,
      capturedRow._id,
      capturedRow.version,
    );
    await correctCommercial(
      proof,
      finalTenant,
      finalized.eventId,
      4000,
      6000,
      REASON,
    );
    const kept = await theOneCloseout(proof, finalTenant, finalized.eventId);
    expect(kept.status).toBe("finalized");
    expect(Number(kept.budgetedRevenue)).toBe(4500);
    const finalReceipts = await closeoutReceipts(
      proof,
      finalTenant,
      finalized.eventId,
    );
    expect(finalReceipts).toHaveLength(1);
    expect(finalReceipts[0]!.unresolved).toEqual([
      { code: "closeout_change_required", recordIds: [String(toFinalize._id)] },
    ]);
  });
});
