// @vitest-environment edge-runtime
/**
 * AC-342 (CF-11.4): a maintenance problem records the issue, severity, item,
 * raised/due/settled times, owner or repair vendor, cost, notes and whether
 * it takes the item out of use. Out-of-use equipment cannot be newly booked
 * or checked out - unless a manager books it anyway and says why.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  ensureEncryptionKey,
  HOUR,
  M,
  returnsHarness,
  SAT,
  SUN,
} from "../../proofs/equipment-returns.runtime.helpers";

beforeAll(ensureEncryptionKey);

describe("maintenance and out of service (AC-342)", () => {
  it("scheduling an out-of-service maintenance task blocks new checkouts; an authorized override with reason proceeds", async () => {
    const h = returnsHarness("tenant-ac342-maintenance");
    const inventory = h.as("inventory-manager", "inventory_manager");
    const vendor = await h.run(inventory, M.Vendor_createViaOnboard, {
      name: "Kitchen Repair Co",
    });
    const wedding = await h.event("Saturday wedding", SAT, SAT + 8 * HOUR);
    const brunch = await h.event("Sunday brunch", SUN, SUN + 4 * HOUR);
    const warmer = await h.equipment("Hot box warmer", 1);
    const booked = await h.reserve(
      h.manager,
      warmer.docId,
      wedding.docId,
      SAT,
      SAT + 8 * HOUR,
      1,
    );

    // The repair ticket: every CF-11.4 fact is kept.
    const due = SAT + 48 * HOUR;
    const repair = await h.run(h.staff, M.EquipmentIssue_createViaRaise, {
      kind: "repair",
      description: "Door latch broken, won't hold heat",
      equipmentId: warmer.docId,
      severity: "high",
      holdsUnits: true,
      dueAt: due,
      ownerName: "Sam in the warehouse",
      vendorId: vendor.docId,
      cost: 85,
      notes: "Vendor picks up Monday",
    });
    expect(await h.read(repair.docId)).toMatchObject({
      kind: "repair",
      description: "Door latch broken, won't hold heat",
      equipmentId: warmer.docId,
      severity: "high",
      holdsUnits: true,
      dueAt: due,
      ownerName: "Sam in the warehouse",
      vendorId: vendor.docId,
      cost: 85,
      notes: "Vendor picks up Monday",
      status: "open",
      payer: "undecided",
    });
    expect((await h.read(repair.docId)).raisedAt).toEqual(expect.any(Number));
    await h.run(h.manager, M.Equipment_updateCondition, {
      docId: warmer.docId,
      condition: "out_of_service",
      note: "In repair",
    });

    // Not free for a new booking, and the booking made before cannot go out.
    expect(
      await h.availability(brunch.docId, SUN, SUN + 4 * HOUR, warmer.docId),
    ).toMatchObject({ outOfUse: 1, free: 0, blocked: "out_of_service" });
    await expect(
      h.reserve(h.staff, warmer.docId, brunch.docId, SUN, SUN + 4 * HOUR, 1),
    ).rejects.toThrow(/out of service, so it can't be booked/);
    await expect(h.checkOut(booked.equipmentReservationId)).rejects.toThrow(
      /out of service, so it can't be checked out/,
    );

    // Staff cannot override; a manager can, with a reason, and it is kept.
    await expect(
      h.reserve(
        h.staff,
        warmer.docId,
        brunch.docId,
        SUN,
        SUN + 4 * HOUR,
        1,
        "Latch is taped, still heats",
      ),
    ).rejects.toThrow(/Only an inventory or logistics manager/);
    await expect(
      h.reserve(
        h.manager,
        warmer.docId,
        brunch.docId,
        SUN,
        SUN + 4 * HOUR,
        1,
        "   ",
      ),
    ).rejects.toThrow(/out of service, so it can't be booked/);
    const overridden = await h.reserve(
      h.manager,
      warmer.docId,
      brunch.docId,
      SUN,
      SUN + 4 * HOUR,
      1,
      "Latch is taped, still heats",
    );
    expect(await h.read(overridden.equipmentReservationId)).toMatchObject({
      status: "reserved",
      overrideReason: "Latch is taped, still heats",
    });
    await h.checkOut(overridden.equipmentReservationId);
    expect(await h.read(overridden.equipmentReservationId)).toMatchObject({
      status: "checked_out",
    });

    // Fixed: settled with the final cost, the warmer is free again.
    await h.run(h.staff, M.EquipmentIssue_settle, {
      docId: repair.docId,
      version: (await h.read(repair.docId)).version,
      resolution: "Latch replaced",
      cost: 92.5,
    });
    const settled = await h.read(repair.docId);
    expect(settled).toMatchObject({
      status: "resolved",
      resolution: "Latch replaced",
      cost: 92.5,
    });
    expect(settled.resolvedAt).toEqual(expect.any(Number));
    await expect(
      h.run(h.staff, M.EquipmentIssue_settle, {
        docId: repair.docId,
        version: settled.version,
        resolution: "Again",
      }),
    ).rejects.toThrow(/already sorted out/);
  });
});
