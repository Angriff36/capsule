/**
 * Runtime proof (AC-137 PR10-07): cancelling an event frees only what can be
 * freed. A booking still in the warehouse is released; gear that went out on
 * a truck, the pack list that left, and rentals asked for or delivered by a
 * vendor stay as they are and are listed as things still to sort out - on
 * the cancellation receipt and on the event's equipment read.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  ensureEncryptionKey,
  HOUR,
  M,
  returnsHarness,
  SAT,
} from "./equipment-returns.runtime.helpers";
import { readReconciliationReceipts } from "./reconciliation-failure-isolation.runtime.helpers";

beforeAll(ensureEncryptionKey);

describe("cancellation keeps obligations (AC-137)", () => {
  it("cancelling an event releases its reserved equipment and unstarted shifts while dispatched pack lists, vendor orders and outstanding returns persist", async () => {
    const h = returnsHarness("tenant-ac137-obligations");
    const inventory = h.as("inventory-manager", "inventory_manager");
    const vendor = await h.run(inventory, M.Vendor_createViaOnboard, {
      name: "Party Rentals Co",
    });
    const wedding = await h.event("Saturday wedding", SAT, SAT + 8 * HOUR);
    const step = async (cmd: unknown, id: string, args: object = {}) =>
      h.run(h.manager, cmd, {
        docId: id,
        version: (await h.read(id)).version,
        ...args,
      });

    // Gear out on a truck that already left.
    const pack = await h.run(h.manager, M.PackList_createViaOpen, {
      eventId: wedding.docId,
      name: "Truck 1",
    });
    const chafers = await h.equipment("Round chafer", 6);
    const outHold = await h.reserve(
      h.manager,
      chafers.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      6,
    );
    const pull = (await h.all("packListItems")).find(
      (row) =>
        row.packListId === pack.docId && row.description === "Round chafer",
    )!;
    await step(M.PackList_startPacking, pack.docId);
    await step(M.PackListItem_markPacked, pull._id, { packedQuantity: 6 });
    await step(M.PackList_markPacked, pack.docId);
    await step(M.PackList_markLoaded, pack.docId);
    await step(M.PackList_dispatch, pack.docId);

    // A booking that never left, and two vendor rentals.
    const linens = await h.equipment("White linen", 40);
    const warehouseHold = await h.reserve(
      h.manager,
      linens.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      40,
    );
    const askVendor = (description: string) =>
      h.run(h.manager, M.RentalOrderLine_createViaAskVendor, {
        eventId: wedding.docId,
        vendorId: vendor.docId,
        description,
        quantity: 2,
        vendorCost: 150,
      });
    const tent = await askVendor("Frame tent");
    const heaters = await askVendor("Patio heater");
    await step(M.RentalOrderLine_markDelivered, heaters.docId, {
      deliveredQuantity: 2,
    });

    await h.run(h.events, M.Event_cancel, {
      docId: wedding.docId,
      version: (await h.read(wedding.docId)).version,
      reason: "Client postponed",
    });

    expect(await h.read(warehouseHold.equipmentReservationId)).toMatchObject({
      status: "cancelled",
    });
    expect(await h.read(outHold.equipmentReservationId)).toMatchObject({
      status: "checked_out",
    });
    expect(await h.read(pack.docId)).toMatchObject({ status: "dispatched" });
    expect(await h.read(tent.docId)).toMatchObject({ status: "requested" });
    expect(await h.read(heaters.docId)).toMatchObject({ status: "delivered" });

    const receipt = (
      await readReconciliationReceipts(h.events, "tenant-ac137-obligations")
    ).find(
      (row) =>
        row.eventId === wedding.docId &&
        row.affectedDomains.includes("cancellation"),
    )!;
    expect(receipt.exceptionCount).toBe(4);
    expect(receipt.unresolved).toEqual(
      expect.arrayContaining([
        { code: "pack_list_sent", recordIds: [pack.docId] },
        {
          code: "equipment_still_out",
          recordIds: [outHold.equipmentReservationId],
        },
        {
          code: "vendor_rental_open",
          recordIds: expect.arrayContaining([tent.docId, heaters.docId]),
        },
      ]),
    );

    const read = await h.exceptions(h.events, wedding.docId);
    expect(read.obligations.map((row: { label: string }) => row.label)).toEqual(
      expect.arrayContaining([
        "Truck 1 already went out. Bring it back and check it in.",
        "6 Round chafer still out. Do the return check when it is back.",
        "2 Frame tent is requested with the rental company. Call them to cancel, then mark it cancelled.",
        "2 Patio heater from the rental company is here. Send it back and enter the count.",
      ]),
    );

    // Bringing the chafers back clears that duty.
    await h.markReturned(outHold.equipmentReservationId, { condition: "good" });
    const after = await h.exceptions(h.events, wedding.docId);
    expect(
      after.obligations.some(
        (row: { code: string }) => row.code === "equipment_still_out",
      ),
    ).toBe(false);
  });
});
