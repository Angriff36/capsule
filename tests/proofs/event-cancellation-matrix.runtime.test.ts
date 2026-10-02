/**
 * Runtime proof (BE-20.2, AC-675..683; also AC-081, 480, 481, 482): the
 * cancellation matrix. An event can be cancelled at every stage before it is
 * completed. Cancelling stands down only work that has not happened yet
 * (holds, draft purchasing, unstarted prep, unpacked logistics, unpaid
 * invoices) and keeps every fact that already happened (sent and received
 * orders, stock lots, finished prep, used stock and waste, trucks that left,
 * deliveries, payments). A second cancel is refused and writes nothing.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  sentOrderSurplus,
  type SurplusNeed,
} from "../../src/features/inventory/sentOrderSurplus";
import {
  bookedEvent,
  cancel,
  CANCEL_STAGES,
  cancelReceipts,
  eventRows,
  HOUR,
  M,
  returnsHarness,
  SAT,
  walkTo,
} from "./event-cancellation-matrix.runtime.helpers";
import {
  approvedEvent,
  drafts,
  harness as weeklyHarness,
  lineFor,
  linkedEventIds,
  liveRows,
  orders,
  readRow,
  rolesFor as weeklyRoles,
  runner,
  seedCatalog,
  versionOf,
  type LineRow,
  type OrderRow,
} from "./weekly-purchasing.runtime.helpers";
import {
  confirmWeeklyOrder,
  liveLots,
  markPartiallyReceived,
  recordPartialReceipt,
  registerDryStore,
} from "./plan-vs-fact-partial-receipt.runtime.helpers";
import {
  createPlannedEvent,
  finishPrepLine,
  harness as prepHarness,
  hireCook,
  listedPrepFacts,
  rolesFor as prepRoles,
  seedDishWithPrepTask,
} from "./plan-vs-fact-completed-prep.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

/** Cancel one weekly-purchasing event as its event manager. */
async function cancelWeekly(
  proof: ReturnType<typeof weeklyHarness>,
  tenantId: string,
  eventId: string,
  reason: string,
) {
  const roles = weeklyRoles(proof, tenantId);
  await runner(proof, roles.events)(M.Event_cancel, {
    docId: eventId,
    version: await versionOf(roles.events, eventId),
    reason,
  });
}

async function surplusFor(
  proof: ReturnType<typeof weeklyHarness>,
  tenantId: string,
) {
  const roles = weeklyRoles(proof, tenantId);
  return sentOrderSurplus({
    needs: await liveRows<SurplusNeed & { tenantId: string }>(
      roles.procurement,
      "purchaseNeeds",
      tenantId,
    ),
    orders: await orders(roles.procurement, tenantId),
  });
}

describe("runtime proof: event cancellation matrix (BE-20.2)", () => {
  it("AC-675: cancels at every stage before completion with no downstream records, once", async () => {
    const tenantId = "tenant-ac675-matrix";
    const h = returnsHarness(tenantId);
    for (const stage of CANCEL_STAGES) {
      const event = await bookedEvent(h, `AC-675 ${stage}`);
      await walkTo(h, event.docId, stage);
      expect((await h.read(event.docId)).stage).toBe(stage);
      await cancel(h, event.docId, `Called off at ${stage}`);
      expect(await h.read(event.docId)).toMatchObject({
        stage: "cancelled",
        cancellationReason: `Called off at ${stage}`,
      });
      expect(await cancelReceipts(h, tenantId, event.docId)).toHaveLength(1);
      // Approval makes the first invoice by itself; nothing made for the
      // event is left live.
      for (const [table, stoodDown] of [
        ["invoices", "voided"],
        ["packLists", "cancelled"],
        ["purchaseNeeds", "cancelled"],
      ] as const)
        for (const row of await eventRows(h, table, event.docId))
          expect(row.status).toBe(stoodDown);
      // Replay: a second cancel is refused and writes no second receipt.
      const before = await h.read(event.docId);
      await expect(cancel(h, event.docId, "Again")).rejects.toThrow();
      expect(await h.read(event.docId)).toEqual(before);
      expect(await cancelReceipts(h, tenantId, event.docId)).toHaveLength(1);
    }
    // A completed event is history: it cannot be cancelled.
    const done = await bookedEvent(h, "AC-675 completed");
    await walkTo(h, done.docId, "final");
    await h.run(h.events, M.Event_complete, {
      docId: done.docId,
      version: (await h.read(done.docId)).version,
    });
    await expect(cancel(h, done.docId, "Too late")).rejects.toThrow();
    expect((await h.read(done.docId)).stage).toBe("completed");
  });

  it("AC-676 / AC-480: cancel removes its draft order and lines and frees its equipment hold", async () => {
    const proof = weeklyHarness();
    const tenantId = "tenant-ac676-draft";
    const roles = weeklyRoles(proof, tenantId);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Rice", perServing: 0.1 },
    ]);
    const [riceId] = catalog.ingredientIds as [string];
    const eventId = await approvedEvent(proof, tenantId, {
      title: "AC-676 lunch",
      headcount: 40,
      dishIds: catalog.dishIds,
    });
    const gear = await runner(proof, roles.inventory)(
      M.Equipment_createViaRegister,
      {
        name: "AC-676 chafer",
        assetTag: "ac676-chafer",
        category: "furniture",
        ownership: "owned",
        quantity: 4,
      },
    );
    const hold = (await roles.inventory.mutation(
      api.equipmentCheckout.reserve,
      {
        equipmentId: gear.docId as never,
        eventId: eventId as never,
        startsAt: Date.UTC(2026, 6, 20, 12, 0),
        endsAt: Date.UTC(2026, 6, 20, 22, 0),
        quantity: 2,
      },
    )) as { equipmentReservationId: string };
    const [draft] = await drafts(roles.procurement, tenantId);
    const line = await lineFor(roles.procurement, tenantId, draft!._id, riceId);
    expect(Number(line!.orderedQuantity)).toBeCloseTo(4, 4);

    await cancelWeekly(proof, tenantId, eventId, "Client moved it online");

    expect(await drafts(roles.procurement, tenantId)).toHaveLength(0);
    expect(
      await readRow<OrderRow>(roles.procurement, draft!._id),
    ).toMatchObject({ status: "cancelled" });
    expect(
      await lineFor(roles.procurement, tenantId, draft!._id, riceId),
    ).toBeUndefined();
    const needs = await liveRows<{
      eventId: string;
      status: string;
      tenantId: string;
    }>(roles.procurement, "purchaseNeeds", tenantId);
    expect(
      needs.filter((n) => n.eventId === eventId).map((n) => n.status),
    ).toEqual(["cancelled"]);
    expect(
      await readRow<{ status: string }>(
        roles.inventory,
        hold.equipmentReservationId,
      ),
    ).toMatchObject({ status: "cancelled" });
  });

  it("AC-677: cancelling one of two events on a shared draft leaves only the other event's need", async () => {
    const proof = weeklyHarness();
    const tenantId = "tenant-ac677-shared";
    const roles = weeklyRoles(proof, tenantId);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Lentils", perServing: 0.1 },
    ]);
    const [lentilsId] = catalog.ingredientIds as [string];
    const gone = await approvedEvent(proof, tenantId, {
      title: "AC-677 cancelled",
      headcount: 60,
      dishIds: catalog.dishIds,
    });
    const stays = await approvedEvent(proof, tenantId, {
      title: "AC-677 staying",
      headcount: 40,
      dishIds: catalog.dishIds,
    });
    const [draft] = await drafts(roles.procurement, tenantId);
    const shared = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      lentilsId,
    );
    expect(Number(shared!.orderedQuantity)).toBeCloseTo(10, 4);

    await cancelWeekly(proof, tenantId, gone, "Double booked");

    const [after] = await drafts(roles.procurement, tenantId);
    expect(after!._id).toBe(draft!._id);
    const line = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      lentilsId,
    );
    expect(line!._id).toBe(shared!._id);
    expect(Number(line!.orderedQuantity)).toBeCloseTo(4, 4);
    expect(
      await linkedEventIds(roles.procurement, tenantId, line!._id),
    ).toEqual([stays]);
  });

  it("AC-678 / AC-481 / AC-482: a sent order is kept and the buyer sees the extra as a cancelled-event surplus", async () => {
    const proof = weeklyHarness();
    const tenantId = "tenant-ac678-sent";
    const roles = weeklyRoles(proof, tenantId);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Flour", perServing: 0.1 },
    ]);
    const [flourId] = catalog.ingredientIds as [string];
    const eventId = await approvedEvent(proof, tenantId, {
      title: "AC-678 gala",
      headcount: 40,
      dishIds: catalog.dishIds,
    });
    const [draft] = await drafts(roles.procurement, tenantId);
    const line = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      flourId,
    );
    await runner(proof, roles.procurement)(M.VendorOrder_submit, {
      docId: draft!._id,
      version: draft!.version,
    });
    const sent = await readRow<OrderRow>(roles.procurement, draft!._id);
    const sentLine = await readRow<LineRow>(roles.procurement, line!._id);

    await cancelWeekly(proof, tenantId, eventId, "Gala cancelled");

    expect(await readRow<OrderRow>(roles.procurement, draft!._id)).toEqual(
      sent,
    );
    expect(await readRow<LineRow>(roles.procurement, line!._id)).toEqual(
      sentLine,
    );
    expect(await drafts(roles.procurement, tenantId)).toHaveLength(0);
    const surplus = await surplusFor(proof, tenantId);
    expect(surplus).toHaveLength(1);
    expect(surplus[0]).toMatchObject({
      eventId,
      ingredientId: flourId,
      vendorOrderId: draft!._id,
      orderedFor: 4,
      nowNeeded: 0,
      extra: 4,
      eventCancelled: true,
    });
  });

  it("AC-679 / AC-481: a partly received order keeps its receipt and stock lot", async () => {
    const proof = weeklyHarness();
    const tenantId = "tenant-ac679-partial";
    const roles = weeklyRoles(proof, tenantId);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Oats", perServing: 0.1 },
    ]);
    const [oatsId] = catalog.ingredientIds as [string];
    const eventId = await approvedEvent(proof, tenantId, {
      title: "AC-679 brunch",
      headcount: 40,
      dishIds: catalog.dishIds,
    });
    const [draft] = await drafts(roles.procurement, tenantId);
    const line = await lineFor(roles.procurement, tenantId, draft!._id, oatsId);
    await runner(proof, roles.procurement)(M.VendorOrder_submit, {
      docId: draft!._id,
      version: draft!.version,
    });
    await confirmWeeklyOrder(proof, tenantId, draft!._id);
    const store = await registerDryStore(proof, tenantId, "AC-679 dry store");
    await recordPartialReceipt(
      proof,
      tenantId,
      line!._id,
      store,
      1.5,
      2,
      "LOT-AC679",
    );
    await markPartiallyReceived(proof, tenantId, draft!._id);
    const order = await readRow<OrderRow>(roles.procurement, draft!._id);
    const received = await readRow<LineRow>(roles.procurement, line!._id);
    const lots = await liveLots(roles.procurement, tenantId);
    expect(lots).toHaveLength(1);

    await cancelWeekly(proof, tenantId, eventId, "Brunch called off");

    expect(await readRow<OrderRow>(roles.procurement, draft!._id)).toEqual(
      order,
    );
    expect(await readRow<LineRow>(roles.procurement, line!._id)).toEqual(
      received,
    );
    expect(await liveLots(roles.procurement, tenantId)).toEqual(lots);
    expect((await surplusFor(proof, tenantId))[0]).toMatchObject({
      eventId,
      eventCancelled: true,
      nowNeeded: 0,
    });
  });

  it("AC-680: finished prep stays exactly as recorded; unstarted prep stands down", async () => {
    const proof = prepHarness();
    const tenantId = "tenant-ac680-prep";
    const roles = prepRoles(proof, tenantId);
    const { eventId } = await createPlannedEvent(proof, tenantId, "AC-680");
    await seedDishWithPrepTask(proof, tenantId, eventId, "Finished");
    await seedDishWithPrepTask(proof, tenantId, eventId, "Unstarted");
    const cookId = await hireCook(proof, tenantId, "AC-680");
    const [first] = await listedPrepFacts(roles.events, eventId);
    await finishPrepLine(proof, tenantId, first!._id, cookId, 40);
    const rows = await listedPrepFacts(roles.events, eventId);
    const finished = rows.find((row) => row._id === first!._id)!;
    const open = rows.filter((row) => row._id !== first!._id);
    expect(finished.status).toBe("completed");
    expect(open.length).toBeGreaterThan(0);

    await runner(proof, roles.events)(M.Event_cancel, {
      docId: eventId,
      version: await versionOf(roles.events, eventId),
      reason: "Kitchen fire at venue",
    });

    const after = await listedPrepFacts(roles.events, eventId);
    expect(after.find((row) => row._id === first!._id)).toEqual(finished);
    for (const row of open)
      expect(after.find((r) => r._id === row._id)!.status).toBe("cancelled");
  });

  it("AC-681 / AC-081: used stock and waste stay; only the unused hold is released", async () => {
    const tenantId = "tenant-ac681-consumed";
    const h = returnsHarness(tenantId);
    const kitchen = h.as("kitchen", "kitchen_manager");
    const stock = h.as("stock", "inventory_staff");
    const event = await bookedEvent(h, "AC-681 dinner");
    await walkTo(h, event.docId, "executing");
    const ingredient = await h.run(kitchen, M.Ingredient_createViaIntroduce, {
      name: "AC-681 butter",
      unit: "kilogram",
      costPerUnit: 8,
      allergens: [],
      category: "dairy",
    });
    const place = await h.run(stock, M.StorageLocation_createViaRegister, {
      name: "AC-681 walk-in",
      locationType: "dry",
    });
    const item = await h.run(stock, M.InventoryItem_createViaOpen, {
      ingredientId: ingredient.docId,
      locationId: place.docId,
      unit: "kilogram",
      quantityOnHand: 20,
    });
    const used = await h.run(stock, M.InventoryReservation_createViaReserve, {
      inventoryItemId: item.docId,
      eventId: event.docId,
      ingredientId: ingredient.docId,
      quantity: 5,
    });
    await h.run(stock, M.InventoryReservation_consume, {
      docId: used.docId,
      version: 1,
    });
    const unused = await h.run(stock, M.InventoryReservation_createViaReserve, {
      inventoryItemId: item.docId,
      eventId: event.docId,
      ingredientId: ingredient.docId,
      quantity: 3,
    });
    const waste = await h.run(stock, M.WasteRecord_createViaRecord, {
      ingredientId: ingredient.docId,
      locationId: place.docId,
      quantity: 1,
      unit: "kilogram",
      reason: "spoilage",
      eventId: event.docId,
    });
    const usedBefore = await h.read(used.docId);
    const wasteBefore = await h.read(waste.docId);

    await cancel(h, event.docId, "Power cut at the venue");

    expect(await h.read(used.docId)).toEqual(usedBefore);
    expect(await h.read(waste.docId)).toEqual(wasteBefore);
    expect(await h.read(unused.docId)).toMatchObject({
      status: "released",
      releaseReason: "Power cut at the venue",
    });
  });

  it("AC-682: a truck that left and its delivery stay; packing not yet sent stands down", async () => {
    const tenantId = "tenant-ac682-logistics";
    const h = returnsHarness(tenantId);
    const step = async (cmd: unknown, id: string, args: object = {}) =>
      h.run(h.manager, cmd, {
        docId: id,
        version: (await h.read(id)).version,
        ...args,
      });
    const event = await bookedEvent(h, "AC-682 wedding");
    await walkTo(h, event.docId, "executing");
    const truck = await h.run(h.manager, M.PackList_createViaOpen, {
      eventId: event.docId,
      name: "Truck 1",
    });
    const chafers = await h.equipment("AC-682 chafer", 4);
    await h.reserve(
      h.manager,
      chafers.docId,
      event.docId,
      SAT,
      SAT + 6 * HOUR,
      4,
    );
    const pull = (await h.all("packListItems")).find(
      (row) => row.packListId === truck.docId,
    )!;
    await step(M.PackList_startPacking, truck.docId);
    await step(M.PackListItem_markPacked, pull._id, { packedQuantity: 4 });
    await step(M.PackList_markPacked, truck.docId);
    await step(M.PackList_markLoaded, truck.docId);
    await step(M.PackList_dispatch, truck.docId);
    const driver = await h.run(
      h.as("workforce", "workforce_manager"),
      M.Person_createViaHire,
      {
        givenName: "Dana",
        familyName: "Driver",
        email: `driver-${tenantId}@proof.example`,
        role: "workforce_staff",
        employmentType: "part_time",
      },
    );
    const drop = await h.run(h.manager, M.Delivery_createViaSchedule, {
      driverId: driver.docId,
      packListId: truck.docId,
      eventId: event.docId,
      destination: "Proof Hall",
      windowStartsAt: SAT - HOUR,
      windowEndsAt: SAT,
    });
    await step(M.Delivery_startTransit, drop.docId);
    await step(M.Delivery_confirmDelivery, drop.docId);
    const spare = await h.run(h.manager, M.PackList_createViaOpen, {
      eventId: event.docId,
      name: "Truck 2",
    });
    const truckBefore = await h.read(truck.docId);
    const dropBefore = await h.read(drop.docId);
    expect(dropBefore.status).toBe("delivered");

    await cancel(h, event.docId, "Storm warning");

    expect(await h.read(truck.docId)).toEqual(truckBefore);
    expect(await h.read(drop.docId)).toEqual(dropBefore);
    expect(await h.read(spare.docId)).toMatchObject({ status: "cancelled" });
    const [receipt] = await cancelReceipts(h, tenantId, event.docId);
    expect(receipt!.unresolved).toEqual(
      expect.arrayContaining([
        { code: "pack_list_sent", recordIds: [truck.docId] },
      ]),
    );
  });

  it("AC-683: an unpaid invoice is voided; part-paid and paid invoices and their payments stay", async () => {
    const tenantId = "tenant-ac683-invoices";
    const h = returnsHarness(tenantId);
    const owner = h.as("owner", "admin");
    const event = await bookedEvent(h, "AC-683 party");
    await walkTo(h, event.docId, "final");
    const { clientId } = await h.read(event.docId);
    const ids: Record<"unpaid" | "part" | "paid", string> = {
      unpaid: "",
      part: "",
      paid: "",
    };
    const payments: string[] = [];
    for (const [key, paid] of [
      ["unpaid", 0],
      ["part", 40],
      ["paid", 100],
    ] as const) {
      const invoice = await h.run(owner, M.Invoice_createViaIssue, {
        clientId,
        eventId: event.docId,
        invoiceNumber: `AC683-${key}`,
        subtotal: 100,
        total: 100,
        taxAmount: 0,
        discountAmount: 0,
      });
      await h.run(owner, M.Invoice_send, { docId: invoice.docId, version: 1 });
      if (paid > 0) {
        const payment = await h.run(owner, M.Payment_createViaRecord, {
          invoiceId: invoice.docId,
          clientId,
          amount: paid,
          method: "card",
        });
        await h.run(owner, M.Payment_settle, {
          docId: payment.docId,
          version: 1,
        });
        payments.push(payment.docId);
      }
      ids[key] = invoice.docId;
    }
    const partBefore = await h.read(ids.part);
    const paidBefore = await h.read(ids.paid);
    const paymentsBefore = await Promise.all(payments.map((id) => h.read(id)));
    expect(Number(partBefore.amountPaid)).toBe(40);

    await cancel(h, event.docId, "Couple split up");

    expect(await h.read(ids.unpaid)).toMatchObject({
      status: "voided",
      voidReason: "Couple split up",
    });
    expect(await h.read(ids.part)).toEqual(partBefore);
    expect(await h.read(ids.paid)).toEqual(paidBefore);
    expect(await Promise.all(payments.map((id) => h.read(id)))).toEqual(
      paymentsBefore,
    );
    // The money already paid is a to-do for finance, on the receipt and the
    // cancelled event's "Still to sort out" list.
    const [receipt] = await cancelReceipts(h, tenantId, event.docId);
    expect(receipt!.unresolved).toEqual([
      {
        code: "invoice_paid",
        recordIds: expect.arrayContaining([ids.part, ids.paid]),
      },
    ]);
    const shown = await h.exceptions(h.events, event.docId);
    expect(
      shown.obligations.filter(
        (row: { code: string }) => row.code === "invoice_paid",
      ),
    ).toHaveLength(2);
  });
});
