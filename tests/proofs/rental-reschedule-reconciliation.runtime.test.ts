/**
 * Runtime proof (AC-390 rental slice): one Event.reschedule moves a still-
 * reserved equipment hold onto the new event window exactly once while an
 * already-checked-out hold stays on its original window as custody history,
 * and persists exactly one §8.2 eventReconciliation receipt for the rental
 * domain. Replaying the same schedule against unchanged rental input writes
 * no row diff and no second receipt.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  R1,
  S,
  harness,
  readEventWindow,
  readReservation,
  reservationSnapshot,
  rescheduleToR1,
  rolesFor,
  seedEventWithHolds,
  type HoldIds,
  type ReservationSnapshot,
} from "./rental-reschedule-reconciliation.runtime.helpers";
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

function rentalReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
): ReceiptOutput[] {
  return receipts.filter(
    (row) =>
      row.eventId === eventId &&
      row.triggerType === "EventScheduleChanged" &&
      row.affectedDomains.length === 1 &&
      row.affectedDomains[0] === "rental",
  );
}

function checkpointKeys(receipts: ReceiptOutput[], eventId: string): string[] {
  return receipts
    .filter((row) => row.eventId === eventId)
    .map((row) => row.checkpoint.key)
    .sort((a, b) => a.localeCompare(b));
}

describe("runtime proof: single rental reconciliation per reschedule (AC-390 slice)", () => {
  it("one reschedule moves a reserved hold once with a rental receipt", async () => {
    const proof = harness();
    const tenantId = "tenant-ac390-rental-once";
    const { events } = rolesFor(proof, tenantId);
    const seeded: HoldIds = await seedEventWithHolds(
      proof,
      tenantId,
      "AC-390 rental once",
    );

    await rescheduleToR1(proof, tenantId, seeded.eventId);

    const window = await readEventWindow(events, seeded.eventId);
    expect(window.startsAt).toBe(R1.startsAt);
    expect(window.endsAt).toBe(R1.endsAt);

    const reserved = await readReservation(events, seeded.reservedId);
    expect(reserved.startsAt).toBe(R1.startsAt);
    expect(reserved.endsAt).toBe(R1.endsAt);
    expect(reserved.status).toBe("reserved");

    const checkedOut = await readReservation(events, seeded.checkedOutId);
    expect(checkedOut.startsAt).toBe(S.startsAt);
    expect(checkedOut.endsAt).toBe(S.endsAt);
    expect(checkedOut.status).toBe("checked_out");

    const receipts = await readReconciliationReceipts(events, tenantId);
    const receiptsForEvent = rentalReceipts(receipts, seeded.eventId);
    expect(receiptsForEvent).toHaveLength(1);
    const receipt = receiptsForEvent[0]!;
    expect(receipt.triggerType).toBe("EventScheduleChanged");
    expect(receipt.affectedDomains).toEqual(["rental"]);
    expect(receipt.eventId).toBe(seeded.eventId);
    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.createdCount).toBe(0);
    expect(receipt.updatedCount).toBe(1);
    expect(receipt.retiredCount).toBe(0);
    expect(receipt.preservedCount).toBe(1);
    expect(receipt.exceptionCount).toBe(0);
    expect(receipt.unresolved).toEqual([]);
    expect(receipt.checkpoint.state).toBe("complete");
  });

  it("replaying the same schedule against unchanged rental input is a no-op", async () => {
    const proof = harness();
    const tenantId = "tenant-ac390-rental-replay";
    const { events, inventory } = rolesFor(proof, tenantId);
    const seeded: HoldIds = await seedEventWithHolds(
      proof,
      tenantId,
      "AC-390 rental replay",
    );

    await rescheduleToR1(proof, tenantId, seeded.eventId);

    const snapshotBefore: ReservationSnapshot[] = (
      await Promise.all([
        readReservation(inventory, seeded.reservedId),
        readReservation(inventory, seeded.checkedOutId),
      ])
    ).map(reservationSnapshot);
    expect(snapshotBefore).toHaveLength(2);
    const receiptsBefore = await readReconciliationReceipts(events, tenantId);
    const checkpointsBefore = checkpointKeys(receiptsBefore, seeded.eventId);

    // The SAME schedule again — a replay, not a change.
    await rescheduleToR1(proof, tenantId, seeded.eventId);

    const rowsAfter = await Promise.all([
      readReservation(inventory, seeded.reservedId),
      readReservation(inventory, seeded.checkedOutId),
    ]);
    expect(rowsAfter.map(reservationSnapshot)).toEqual(snapshotBefore);

    const receiptsAfter = await readReconciliationReceipts(events, tenantId);
    expect(checkpointKeys(receiptsAfter, seeded.eventId)).toEqual(
      checkpointsBefore,
    );
    expect(rentalReceipts(receiptsAfter, seeded.eventId)).toHaveLength(1);
  });
});
