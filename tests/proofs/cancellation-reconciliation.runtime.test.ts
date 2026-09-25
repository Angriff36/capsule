/**
 * Runtime proof (AC-390 cancellation slice): one Event.cancel stands down the
 * still-reserved equipment hold and the still-assigned crew member exactly
 * once while the checked-out hold and the checked-in assignment stay as
 * history, and persists exactly one §8.2 eventReconciliation receipt for the
 * cancellation domain. A second Event.cancel is refused and writes no diff
 * and no second receipt.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  cancelEvent,
  harness,
  readWorkRow,
  rolesFor,
  seedEventWithWork,
  workSnapshot,
  type CancelIds,
  type WorkRow,
} from "./cancellation-reconciliation.runtime.helpers";
import {
  readReconciliationReceipts,
  type ReceiptOutput,
} from "./single-reconciliation.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function cancellationReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
): ReceiptOutput[] {
  return receipts.filter(
    (row) =>
      row.eventId === eventId &&
      row.triggerType === "EventCancelled" &&
      row.affectedDomains.length === 1 &&
      row.affectedDomains[0] === "cancellation",
  );
}

function checkpointKeys(receipts: ReceiptOutput[], eventId: string): string[] {
  return receipts
    .filter((row) => row.eventId === eventId)
    .map((row) => row.checkpoint.key)
    .sort((a, b) => a.localeCompare(b));
}

async function snapshotWork(
  proof: ReturnType<typeof harness>,
  tenantId: string,
  seeded: CancelIds,
): Promise<WorkRow[]> {
  const { events } = rolesFor(proof, tenantId);
  const rows = await Promise.all([
    readWorkRow(events, seeded.reservedId),
    readWorkRow(events, seeded.checkedOutId),
    readWorkRow(events, seeded.assignedId),
    readWorkRow(events, seeded.checkedInId),
  ]);
  return rows.map(workSnapshot);
}

describe("runtime proof: single cancellation reconciliation per cancel (AC-390 slice)", () => {
  it("one cancel stands down reserved work once with a cancellation receipt", async () => {
    const proof = harness();
    const tenantId = "tenant-ac390-cancel-once";
    const { events } = rolesFor(proof, tenantId);
    const seeded = await seedEventWithWork(
      proof,
      tenantId,
      "AC-390 cancel once",
    );

    await cancelEvent(proof, tenantId, seeded.eventId, "Client postponed");

    const event = (await events.run(async (ctx) =>
      ctx.db.get(seeded.eventId as never),
    )) as { stage: string } | null;
    expect(event?.stage).toBe("cancelled");

    const reserved = await readWorkRow(events, seeded.reservedId);
    expect(reserved.status).toBe("cancelled");
    expect(reserved.cancellationReason).toBe("Client postponed");
    const assigned = await readWorkRow(events, seeded.assignedId);
    expect(assigned.status).toBe("unassigned");

    const checkedOut = await readWorkRow(events, seeded.checkedOutId);
    expect(checkedOut.status).toBe("checked_out");
    const checkedIn = await readWorkRow(events, seeded.checkedInId);
    expect(checkedIn.status).toBe("checked_in");

    const receipts = await readReconciliationReceipts(events, tenantId);
    const receiptsForEvent = cancellationReceipts(receipts, seeded.eventId);
    expect(receiptsForEvent).toHaveLength(1);
    const receipt = receiptsForEvent[0]!;
    expect(receipt.triggerType).toBe("EventCancelled");
    expect(receipt.affectedDomains).toEqual(["cancellation"]);
    expect(receipt.eventId).toBe(seeded.eventId);
    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.updatedCount).toBe(2);
    expect(receipt.preservedCount).toBe(2);
    expect(receipt.createdCount).toBe(0);
    expect(receipt.retiredCount).toBe(0);
    expect(receipt.exceptionCount).toBe(0);
    expect(receipt.unresolved).toEqual([]);
    expect(receipt.checkpoint.state).toBe("complete");
  });

  it("a second cancel is refused and leaves the cancellation receipt and history unchanged", async () => {
    const proof = harness();
    const tenantId = "tenant-ac390-cancel-replay";
    const { events } = rolesFor(proof, tenantId);
    const seeded = await seedEventWithWork(
      proof,
      tenantId,
      "AC-390 cancel replay",
    );

    await cancelEvent(proof, tenantId, seeded.eventId, "Client postponed");

    const snapshotBefore = await snapshotWork(proof, tenantId, seeded);
    expect(snapshotBefore).toHaveLength(4);
    const receiptsBefore = await readReconciliationReceipts(events, tenantId);
    const checkpointsBefore = checkpointKeys(receiptsBefore, seeded.eventId);

    // The event is already cancelled — a second cancel must be refused.
    await expect(
      cancelEvent(
        proof,
        tenantId,
        seeded.eventId,
        "Second cancel must not write",
      ),
    ).rejects.toThrow(/Guard|Invalid state transition/);

    expect(await snapshotWork(proof, tenantId, seeded)).toEqual(snapshotBefore);
    const reserved = await readWorkRow(events, seeded.reservedId);
    expect(reserved.status).toBe("cancelled");
    expect(reserved.cancellationReason).toBe("Client postponed");

    const receiptsAfter = await readReconciliationReceipts(events, tenantId);
    expect(checkpointKeys(receiptsAfter, seeded.eventId)).toEqual(
      checkpointsBefore,
    );
    expect(cancellationReceipts(receiptsAfter, seeded.eventId)).toHaveLength(1);

    const row = (await events.run(async (ctx) =>
      ctx.db.get(seeded.eventId as never),
    )) as { stage: string } | null;
    expect(row?.stage).toBe("cancelled");
  });
});
