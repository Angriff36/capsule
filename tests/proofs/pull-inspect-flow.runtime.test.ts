/**
 * Runtime proof (AC-549 BE-13-gs-pull-scan): a pull sheet works on catalog
 * items end to end. Booking chafers puts a pull line on the event's pack
 * list; the packer counts it, the list is packed and loaded, and dispatching
 * the truck checks the booked chafers out. The return check inspects what
 * came back and a broken one becomes an open problem on that event.
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

describe("pull sheet to inspected return (AC-549)", () => {
  it("a pull sheet drives count, load and inspected return", async () => {
    const h = returnsHarness("tenant-ac549-pull");
    const wedding = await h.event("Saturday wedding", SAT, SAT + 8 * HOUR);
    const pack = await h.run(h.manager, M.PackList_createViaOpen, {
      eventId: wedding.docId,
      name: "Pull sheet",
    });
    const chafers = await h.equipment("Round chafer", 10);
    const hold = await h.reserve(
      h.manager,
      chafers.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      4,
    );

    const lines = (await h.all("packListItems")).filter(
      (row) => row.packListId === pack.docId && row.deletedAt == null,
    );
    const pull = lines.find((row) => row.description === "Round chafer")!;
    expect(pull).toMatchObject({ requiredQuantity: 4, returnRequired: true });
    expect(JSON.parse(pull.sourcesJson)[0]).toMatchObject({
      sourceType: "rental",
      sourceId: hold.equipmentReservationId,
    });

    const step = async (cmd: unknown, id: string, args: object = {}) =>
      h.run(h.manager, cmd, {
        docId: id,
        version: (await h.read(id)).version,
        ...args,
      });
    await step(M.PackList_startPacking, pack.docId);
    await step(M.PackListItem_markPacked, pull._id, { packedQuantity: 4 });
    await step(M.PackList_markPacked, pack.docId);
    await step(M.PackList_markLoaded, pack.docId);
    expect(await h.read(hold.equipmentReservationId)).toMatchObject({
      status: "reserved",
    });
    await step(M.PackList_dispatch, pack.docId);

    // The truck left: the booked chafers are out.
    const out = await h.read(hold.equipmentReservationId);
    expect(out).toMatchObject({
      status: "checked_out",
      checkoutCondition: "good",
      checkoutNote: "Went out with Pull sheet",
    });

    // Inspected on return: one broken, the rest fine.
    await h.markReturned(hold.equipmentReservationId, {
      condition: "good",
      damagedQuantity: 1,
      note: "Hinge snapped",
    });
    expect(await h.read(hold.equipmentReservationId)).toMatchObject({
      status: "returned",
      damagedQuantity: 1,
    });
    const issues = await h.issuesFor(wedding.docId);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "damaged",
      quantity: 1,
      holdsUnits: true,
      equipmentId: chafers.docId,
      equipmentReservationId: hold.equipmentReservationId,
      description: "1 Round chafer came back broken",
      notes: "Hinge snapped",
    });
  });
});
