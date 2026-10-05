/**
 * Runtime proof (AC-543 BE-13-custody): checkout, return, damage and repair
 * are history. Each step adds a ledger fact; later steps never rewrite the
 * facts of an earlier one, and a step cannot be done twice.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  ensureEncryptionKey,
  HOUR,
  M,
  returnsHarness,
  SAT,
} from "./equipment-returns.runtime.helpers";

beforeAll(ensureEncryptionKey);

describe("custody trail (AC-543)", () => {
  it("checkout, return and damage facts append without rewriting earlier custody records", async () => {
    const h = returnsHarness("tenant-ac543-custody");
    const wedding = await h.event("Saturday wedding", SAT, SAT + 8 * HOUR);
    const chafers = await h.equipment("Round chafer", 6);
    const hold = await h.reserve(
      h.manager,
      chafers.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      6,
    );
    const id = hold.equipmentReservationId;
    await h.run(h.manager, M.EquipmentReservation_checkOut, {
      docId: id,
      version: (await h.read(id)).version,
      condition: "excellent",
      note: "Polished",
    });
    const afterCheckout = await h.read(id);

    await h.markReturned(id, {
      condition: "fair",
      damagedQuantity: 1,
      missingQuantity: 1,
      note: "One dented, one left at the venue",
    });
    const afterReturn = await h.read(id);
    // The checkout facts are untouched by the return.
    for (const key of [
      "reservedAt",
      "checkedOutAt",
      "checkoutCondition",
      "checkoutNote",
      "startsAt",
      "endsAt",
      "quantity",
    ])
      expect(afterReturn[key]).toEqual(afterCheckout[key]);
    expect(afterReturn).toMatchObject({
      status: "returned",
      returnCondition: "fair",
      damagedQuantity: 1,
      missingQuantity: 1,
    });

    // Neither step can be done again over the top of the record.
    await expect(
      h.run(h.manager, M.EquipmentReservation_checkOut, {
        docId: id,
        version: afterReturn.version,
        condition: "good",
      }),
    ).rejects.toThrow();
    await expect(
      h.markReturned(id, { condition: "excellent" }),
    ).rejects.toThrow();

    // Sorting out the damage adds to the history; the return stays as it was.
    const damaged = (await h.issuesFor(wedding.docId)).find(
      (row) => row.kind === "damaged",
    )!;
    await h.run(h.manager, M.EquipmentIssue_settle, {
      docId: damaged._id,
      version: damaged.version,
      resolution: "Dent hammered out",
      cost: 20,
    });
    const afterRepair = await h.read(id);
    for (const key of [
      "checkedOutAt",
      "checkoutCondition",
      "returnedAt",
      "returnCondition",
      "damagedQuantity",
      "missingQuantity",
      "returnNote",
    ])
      expect(afterRepair[key]).toEqual(afterReturn[key]);

    // The ledger holds one fact per step, in order.
    const facts = (await h.all("manifestEvents")).filter(
      (row) =>
        row.payload?.equipmentReservationId === id ||
        row.payload?.equipmentIssueId === damaged._id ||
        (row.payload?.equipmentId === chafers.docId &&
          row.type === "EquipmentConditionUpdated"),
    );
    expect(facts.map((row) => row.type)).toEqual([
      "EquipmentReserved",
      "EquipmentCheckedOut",
      "EquipmentReturned",
      "EquipmentConditionUpdated",
      "EquipmentIssueRaised",
      "EquipmentIssueResolved",
    ]);
    const returned = facts.find((row) => row.type === "EquipmentReturned")!;
    expect(returned.payload).toMatchObject({
      condition: "fair",
      missingQuantity: 1,
      damagedQuantity: 1,
      cleaningQuantity: 0,
    });
  });
});
