/**
 * Runtime proof (AC-546 BE-13-gs-availability): availability is read live
 * from the same records for every event - overlapping holds, units in repair,
 * and units that never came back all lower what a later event can book.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  ensureEncryptionKey,
  HOUR,
  M,
  returnsHarness,
  SAT,
  SUN,
} from "./equipment-returns.runtime.helpers";

beforeAll(ensureEncryptionKey);

describe("real-time availability (AC-546)", () => {
  it("maintenance and an unrecovered loss reduce availability for a later event", async () => {
    const h = returnsHarness("tenant-ac546-availability");
    const wedding = await h.event("Saturday wedding", SAT, SAT + 8 * HOUR);
    const gala = await h.event("Saturday gala", SAT + 2 * HOUR, SAT + 9 * HOUR);
    const brunch = await h.event("Sunday brunch", SUN, SUN + 4 * HOUR);
    const tables = await h.equipment("Cocktail table", 20);

    // Overlap: the gala sees what the wedding holds.
    const hold = await h.reserve(
      h.manager,
      tables.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      12,
    );
    expect(
      await h.availability(
        gala.docId,
        SAT + 2 * HOUR,
        SAT + 9 * HOUR,
        tables.docId,
      ),
    ).toMatchObject({ free: 8 });

    // Repair: two tables with broken legs are out of use for every date.
    const repair = await h.run(h.staff, M.EquipmentIssue_createViaRaise, {
      kind: "repair",
      description: "Two wobbly legs",
      equipmentId: tables.docId,
      quantity: 2,
      holdsUnits: true,
    });
    expect(
      await h.availability(brunch.docId, SUN, SUN + 4 * HOUR, tables.docId),
    ).toMatchObject({ outOfUse: 2, free: 18 });
    expect(
      await h.availability(
        gala.docId,
        SAT + 2 * HOUR,
        SAT + 9 * HOUR,
        tables.docId,
      ),
    ).toMatchObject({ free: 6 });

    // Loss: the wedding brings back 9 of 12. Three are gone for good.
    await h.checkOut(hold.equipmentReservationId);
    await h.markReturned(hold.equipmentReservationId, {
      condition: "good",
      missingQuantity: 3,
    });
    expect(await h.read(tables.docId)).toMatchObject({ quantity: 17 });
    expect(
      await h.availability(brunch.docId, SUN, SUN + 4 * HOUR, tables.docId),
    ).toMatchObject({ quantity: 17, outOfUse: 2, free: 15 });
    await expect(
      h.reserve(h.staff, tables.docId, brunch.docId, SUN, SUN + 4 * HOUR, 16),
    ).rejects.toThrow(/has 15 free for that time/);
    const missing = (await h.issuesFor(wedding.docId)).find(
      (row) => row.kind === "missing",
    );
    expect(missing).toMatchObject({ quantity: 3, holdsUnits: false });

    // Repair done: the two come back into use at once.
    await h.run(h.staff, M.EquipmentIssue_settle, {
      docId: repair.docId,
      version: (await h.read(repair.docId)).version,
      resolution: "Legs replaced",
    });
    await h.reserve(
      h.staff,
      tables.docId,
      brunch.docId,
      SUN,
      SUN + 4 * HOUR,
      17,
    );
  });
});
