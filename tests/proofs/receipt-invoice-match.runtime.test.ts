/**
 * Runtime proof (AC-456, PL-VENDOR-INVOICE-MATCH): a received line matches its
 * vendor bill line once, and a mismatch raises a named exception that a buyer
 * accepts or disputes. A fix keeps the earlier match in history. No payment or
 * accounting entry is made.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  liveRows,
  readRow,
  rolesFor,
  runner,
  seedWeeklyOrder,
  submitWeeklyOrder,
  type VendorOrderLineRow,
} from "./plan-vs-fact-matrix.runtime.helpers";
import {
  confirmWeeklyOrder,
  recordPartialReceipt,
  registerDryStore,
} from "./plan-vs-fact-partial-receipt.runtime.helpers";

type BilledLine = VendorOrderLineRow & {
  version: number;
  billNumber?: string;
  billedQuantity?: number;
  billedUnitPrice?: number;
  billMatchState?: string;
  billReviewState?: string;
  billReviewNote?: string;
  billMatchCount?: number;
  lineTotalAmount?: number;
};

type MatchRow = {
  vendorOrderLineId: string;
  billNumber: string;
  billedQuantity: number;
  billedUnitPrice: number;
  receivedQuantity: number;
  receiptUnitPrice: number;
  matchState: string;
  matchSequence: number;
  reason?: string;
  reviewState?: string;
  reviewNote?: string;
  reviewedAt?: unknown;
  tenantId: string;
  deletedAt?: unknown;
};

const TENANT = "receipt-invoice-match";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("receipt invoice match", () => {
  it("a received line matches its vendor invoice line once and a mismatch raises a named exception", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const runProcurement = runner(proof, roles.procurement);

    const seeded = await seedWeeklyOrder(proof, TENANT, "Bill match");
    const orderId = await submitWeeklyOrder(
      proof,
      TENANT,
      seeded.vendorOrderId,
    );
    await confirmWeeklyOrder(proof, TENANT, orderId);
    const locationId = await registerDryStore(proof, TENANT, "Bill dry store");
    await recordPartialReceipt(
      proof,
      TENANT,
      seeded.lineAId,
      locationId,
      40,
      2.5,
      "LOT-BILL-A",
    );
    await recordPartialReceipt(
      proof,
      TENANT,
      seeded.lineBId,
      locationId,
      40,
      1,
      "LOT-BILL-B",
    );

    const matches = () =>
      liveRows<MatchRow>(roles.procurement, "vendorBillMatches", TENANT);

    // Line A: the bill agrees with what arrived. Actual cost = the bill.
    await runProcurement(api.mutations.VendorOrderLine_matchBill, {
      docId: seeded.lineAId,
      billNumber: "INV-100",
      billedQuantity: 40,
      billedUnitPrice: 2.5,
    });
    const lineA = await readRow<BilledLine>(roles.procurement, seeded.lineAId);
    expect(lineA.billMatchState).toBe("matched");
    expect(lineA.billReviewState ?? null).toBeNull();
    expect(Number(lineA.lineTotalAmount)).toBe(100);
    expect(await matches()).toHaveLength(1);

    // Sending the same bill again (a retry) changes nothing.
    await runProcurement(api.mutations.VendorOrderLine_matchBill, {
      docId: seeded.lineAId,
      billNumber: "INV-100",
      billedQuantity: 40,
      billedUnitPrice: 2.5,
    });
    expect(await matches()).toHaveLength(1);
    const lineARetry = await readRow<BilledLine>(
      roles.procurement,
      seeded.lineAId,
    );
    expect(lineARetry.billMatchCount).toBe(1);

    // A second, different bill on the same line is refused: it matches once.
    await expect(
      runProcurement(api.mutations.VendorOrderLine_matchBill, {
        docId: seeded.lineAId,
        billNumber: "INV-200",
        billedQuantity: 40,
        billedUnitPrice: 2.5,
      }),
    ).rejects.toThrow(/already matched to a vendor bill/);
    expect(await matches()).toHaveLength(1);

    // A matched line has nothing to accept or dispute.
    await expect(
      runProcurement(api.mutations.VendorOrderLine_reviewBillDifference, {
        docId: seeded.lineAId,
        decision: "accepted",
        note: "Fine",
      }),
    ).rejects.toThrow();

    // Line B: billed for more than arrived, at a higher price. Named exception.
    await runProcurement(api.mutations.VendorOrderLine_matchBill, {
      docId: seeded.lineBId,
      billNumber: "INV-100",
      billedQuantity: 44,
      billedUnitPrice: 1.2,
    });
    const lineB = await readRow<BilledLine>(roles.procurement, seeded.lineBId);
    expect(lineB.billMatchState).toBe("quantity_and_price_differ");
    expect(lineB.billReviewState).toBe("open");
    const lineBTotalBefore = Number(lineB.lineTotalAmount);

    const opened = (await matches()).find(
      (row) => row.vendorOrderLineId === seeded.lineBId,
    );
    expect(opened?.matchState).toBe("quantity_and_price_differ");
    expect(Number(opened?.receivedQuantity)).toBe(40);
    expect(Number(opened?.receiptUnitPrice)).toBe(1);
    expect(opened?.reviewState).toBe("open");

    // A dispute needs a reason and keeps the receipt as the cost.
    await expect(
      runProcurement(api.mutations.VendorOrderLine_reviewBillDifference, {
        docId: seeded.lineBId,
        decision: "disputed",
        note: "  ",
      }),
    ).rejects.toThrow(/Say why/);
    await runProcurement(api.mutations.VendorOrderLine_reviewBillDifference, {
      docId: seeded.lineBId,
      decision: "disputed",
      note: "Four cases never came; price was quoted at 1.00",
    });
    const disputed = await readRow<BilledLine>(
      roles.procurement,
      seeded.lineBId,
    );
    expect(disputed.billReviewState).toBe("disputed");
    expect(Number(disputed.lineTotalAmount)).toBe(lineBTotalBefore);
    const disputedRow = (await matches()).find(
      (row) => row.vendorOrderLineId === seeded.lineBId,
    );
    expect(disputedRow?.reviewState).toBe("disputed");
    expect(disputedRow?.reviewNote).toBe(
      "Four cases never came; price was quoted at 1.00",
    );
    expect(disputedRow?.reviewedAt).toBeTruthy();

    // The vendor sends a fixed bill. The fix is a new numbered match; the
    // disputed one stays in history.
    await runProcurement(api.mutations.VendorOrderLine_correctBillMatch, {
      docId: seeded.lineBId,
      billNumber: "INV-100-R",
      billedQuantity: 40,
      billedUnitPrice: 1,
      reason: "Vendor sent a fixed bill",
    });
    const fixed = await readRow<BilledLine>(roles.procurement, seeded.lineBId);
    expect(fixed.billMatchState).toBe("matched");
    expect(fixed.billMatchCount).toBe(2);
    expect(Number(fixed.lineTotalAmount)).toBe(40);
    const lineBHistory = (await matches())
      .filter((row) => row.vendorOrderLineId === seeded.lineBId)
      .sort((left, right) => left.matchSequence - right.matchSequence);
    expect(lineBHistory.map((row) => [row.billNumber, row.matchState])).toEqual(
      [
        ["INV-100", "quantity_and_price_differ"],
        ["INV-100-R", "matched"],
      ],
    );
    expect(lineBHistory[0]?.reviewState).toBe("disputed");
    expect(lineBHistory[1]?.reason).toBe("Vendor sent a fixed bill");

    // No payment or accounting rows are written by a bill match.
    const payments = await liveRows<{ tenantId: string }>(
      roles.procurement,
      "payments",
      TENANT,
    ).catch(() => []);
    expect(payments).toHaveLength(0);
  });
});
