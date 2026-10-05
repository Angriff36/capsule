/**
 * Runtime proof (AC-136 PR10-06): returns reconcile what went out with what
 * came back - broken and dirty units stay out of use until sorted out, the
 * return record keeps its counts, and out-of-service equipment is not booked
 * until someone marks it back in service.
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

describe("equipment return and availability (AC-136)", () => {
  it("an out_of_service condition blocks new reservations until restored and a damaged return keeps its history while reducing availability", async () => {
    const h = returnsHarness("tenant-ac136-returns");
    const wedding = await h.event("Saturday wedding", SAT, SAT + 8 * HOUR);
    const brunch = await h.event("Sunday brunch", SUN, SUN + 4 * HOUR);

    const chafers = await h.equipment("Chafer", 10, {
      homeLocation: "Main kitchen",
    });
    const hold = await h.reserve(
      h.manager,
      chafers.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      10,
    );
    await h.checkOut(hold.equipmentReservationId);
    await h.markReturned(hold.equipmentReservationId, {
      condition: "fair",
      note: "Two dented, three need a wash",
      damagedQuantity: 2,
      cleaningQuantity: 3,
    });

    // The return keeps what happened.
    const returned = await h.read(hold.equipmentReservationId);
    expect(returned).toMatchObject({
      status: "returned",
      returnCondition: "fair",
      damagedQuantity: 2,
      cleaningQuantity: 3,
      missingQuantity: 0,
      returnNote: "Two dented, three need a wash",
    });
    const issues = await h.issuesFor(wedding.docId);
    expect(
      issues.map((row) => [row.kind, row.quantity, row.holdsUnits, row.status]),
    ).toEqual(
      expect.arrayContaining([
        ["damaged", 2, true, "open"],
        ["cleaning", 3, true, "open"],
      ]),
    );
    expect(issues).toHaveLength(2);

    // Five are out of use for Sunday; the count itself did not change.
    expect(await h.read(chafers.docId)).toMatchObject({ quantity: 10 });
    expect(
      await h.availability(brunch.docId, SUN, SUN + 4 * HOUR, chafers.docId),
    ).toMatchObject({ quantity: 10, outOfUse: 5, free: 5 });
    await expect(
      h.reserve(h.staff, chafers.docId, brunch.docId, SUN, SUN + 4 * HOUR, 6),
    ).rejects.toThrow(/has 5 free for that time.*5 out of use/);

    // Washed: those three are back in use; the return record is unchanged.
    const cleaning = issues.find((row) => row.kind === "cleaning")!;
    await h.run(h.staff, M.EquipmentIssue_settle, {
      docId: cleaning._id,
      version: cleaning.version,
      resolution: "Washed and dried",
    });
    expect(
      await h.availability(brunch.docId, SUN, SUN + 4 * HOUR, chafers.docId),
    ).toMatchObject({ outOfUse: 2, free: 8 });
    await h.reserve(
      h.staff,
      chafers.docId,
      brunch.docId,
      SUN,
      SUN + 4 * HOUR,
      8,
    );
    expect(await h.read(hold.equipmentReservationId)).toMatchObject({
      status: "returned",
      damagedQuantity: 2,
      cleaningQuantity: 3,
    });
    expect(await h.read(cleaning._id)).toMatchObject({
      status: "resolved",
      resolution: "Washed and dried",
    });

    // Out of service: no booking until it is marked back in service.
    const warmer = await h.equipment("Hot box warmer", 1);
    await h.run(h.manager, M.Equipment_updateCondition, {
      docId: warmer.docId,
      condition: "out_of_service",
      note: "Door latch broken",
    });
    await expect(
      h.reserve(h.staff, warmer.docId, brunch.docId, SUN, SUN + 4 * HOUR, 1),
    ).rejects.toThrow(/marked out of service, so it can't be booked/);
    await h.run(h.manager, M.Equipment_updateCondition, {
      docId: warmer.docId,
      condition: "good",
      note: "Latch replaced",
    });
    await h.reserve(
      h.staff,
      warmer.docId,
      brunch.docId,
      SUN,
      SUN + 4 * HOUR,
      1,
    );
  });
});
