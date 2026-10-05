/**
 * Runtime proof (AC-551 BE-13-gs-exceptions): broken, missing, dirty, late
 * and short vendor returns reach the bill and the closeout. The return check
 * opens the problems; the office says who pays and how much; the closeout
 * read shows each one with the money owed by the client, claimed from a
 * vendor, and absorbed by the company.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  ensureEncryptionKey,
  HOUR,
  M,
  returnsHarness,
} from "./equipment-returns.runtime.helpers";

beforeAll(ensureEncryptionKey);

describe("equipment exceptions to billing and closeout (AC-551)", () => {
  it("a damaged return creates a billed exception and appears in closeout actuals", async () => {
    const h = returnsHarness("tenant-ac551-billing");
    const inventory = h.as("inventory-manager", "inventory_manager");
    const vendor = await h.run(inventory, M.Vendor_createViaOnboard, {
      name: "Party Rentals Co",
    });
    // An event that already ended, so returns today are late.
    const endsAt = Date.now() - 2 * HOUR;
    const startsAt = endsAt - 6 * HOUR;
    const gala = await h.event("Last night's gala", startsAt, endsAt);
    const chafers = await h.equipment("Round chafer", 8, {
      replacementCost: 120,
    });
    const hold = await h.reserve(
      h.manager,
      chafers.docId,
      gala.docId,
      startsAt,
      endsAt,
      8,
    );
    await h.checkOut(hold.equipmentReservationId);
    await h.markReturned(hold.equipmentReservationId, {
      condition: "fair",
      damagedQuantity: 1,
      missingQuantity: 1,
      cleaningQuantity: 2,
    });

    // A rented tent comes back short to the vendor, after the pick-up time.
    const tent = await h.run(h.manager, M.RentalOrderLine_createViaAskVendor, {
      eventId: gala.docId,
      vendorId: vendor.docId,
      description: "Tent side wall",
      quantity: 4,
      vendorCost: 200,
      deliverBy: startsAt - HOUR,
      pickupAt: endsAt + HOUR / 2,
    });
    const step = async (cmd: unknown, id: string, args: object) =>
      h.run(h.manager, cmd, {
        docId: id,
        version: (await h.read(id)).version,
        ...args,
      });
    await step(M.RentalOrderLine_markDelivered, tent.docId, {
      deliveredQuantity: 4,
    });
    await step(M.RentalOrderLine_markReturned, tent.docId, {
      returnedQuantity: 3,
      note: "One torn and thrown out",
    });

    const issues = await h.issuesFor(gala.docId);
    const byKind = Object.fromEntries(issues.map((row) => [row.kind, row]));
    expect(Object.keys(byKind).sort()).toEqual([
      "cleaning",
      "damaged",
      "missing",
      "vendor_return",
    ]);
    // Missing units suggest the replacement cost as the charge.
    expect(byKind.missing).toMatchObject({
      quantity: 1,
      chargeAmount: 120,
      payer: "undecided",
    });
    expect(byKind.vendor_return).toMatchObject({
      quantity: 1,
      vendorId: vendor.docId,
      rentalOrderLineId: tent.docId,
      notes: "One torn and thrown out",
    });

    // Finance decides who pays: the client for the broken and lost chafers,
    // the company for the torn wall; the wash is free.
    await step(M.EquipmentIssue_revise, byKind.damaged._id, {
      payer: "client",
      chargeAmount: 60,
    });
    await h.run(h.finance, M.EquipmentIssue_settle, {
      docId: byKind.missing._id,
      version: (await h.read(byKind.missing._id)).version,
      resolution: "Added to the final bill",
      payer: "client",
    });
    await step(M.EquipmentIssue_revise, byKind.vendor_return._id, {
      payer: "company",
      cost: 45,
    });
    await step(M.EquipmentIssue_settle, byKind.cleaning._id, {
      resolution: "Washed",
      payer: "company",
    });

    const closeout = await h.exceptions(h.finance, gala.docId);
    expect(closeout.problems).toHaveLength(4);
    expect(closeout.totals).toEqual({
      open: 2,
      payerUndecided: 0,
      chargeClient: 180,
      chargeVendor: 0,
      companyCost: 45,
    });
    expect(
      closeout.late.map((row: Record<string, unknown>) => [
        row.name,
        row.fromVendor,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["Round chafer", false],
        ["Tent side wall", true],
      ]),
    );
    expect(closeout.obligations).toEqual([]);

    // Kitchen staff do not see equipment money.
    const kitchen = h.as("kitchen", "kitchen_staff");
    expect(await h.exceptions(kitchen, gala.docId)).toBeNull();
  });
});
