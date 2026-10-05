/**
 * Runtime proof (AC-465 BE-10.2): finishing an event releases its remaining
 * mutable holds and never touches consumed movement. Cancelling one event
 * releases its active hold with the cancellation reason; completing another
 * releases its active hold too; a consumed hold keeps its quantity, status
 * and consumed time on both.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  runner,
  type Proof,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type ReservationRow = {
  _id: string;
  eventId: string;
  quantity: number;
  status: string;
  releaseReason: string | null;
  releasedAt: number | null;
  consumedAt: number | null;
  deletedAt: number | null;
};

async function seedHold(
  proof: Proof,
  tenantId: string,
  eventId: string,
  quantity: number,
) {
  const inventory = proof.asRole({
    subject: `cancel-release-inv-${tenantId}-${eventId}`,
    role: "inventory_staff",
    tenantId,
  });
  const kitchen = proof.asRole({
    subject: `cancel-release-kitchen-${tenantId}-${eventId}`,
    role: "kitchen_manager",
    tenantId,
  });
  const ing = await runner(proof, kitchen)(
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: `Cancel release ingredient ${tenantId} ${Math.random()}`,
      unit: "kilogram",
      costPerUnit: 2,
      allergens: [],
      category: "pantry",
    },
  );
  const run = runner(proof, inventory);
  const loc = await run(api.mutations.StorageLocation_createViaRegister, {
    name: `Cancel release storage ${tenantId} ${Math.random()}`,
    locationType: "dry",
  });
  const item = await run(api.mutations.InventoryItem_createViaOpen, {
    ingredientId: ing.docId,
    locationId: loc.docId,
    unit: "kilogram",
    quantityOnHand: quantity * 2,
  });
  const hold = await run(api.mutations.InventoryReservation_createViaReserve, {
    inventoryItemId: item.docId,
    eventId,
    ingredientId: ing.docId,
    quantity,
  });
  return { inventory, run, item, hold, ingredientId: ing.docId };
}

async function holdsFor(
  role: Role,
  eventId: string,
): Promise<ReservationRow[]> {
  const rows = (await role.run(async (ctx) =>
    ctx.db.query("inventoryReservations").collect(),
  )) as unknown as ReservationRow[];
  return rows.filter((row) => row.eventId === eventId && row.deletedAt == null);
}

describe("finishing an event releases its mutable holds", () => {
  it("cancel releases the active hold with the cancellation reason and keeps the consumed hold", async () => {
    const proof = harness();
    const tenantId = "tenant-a";
    const event = await createPlannedEvent(proof, tenantId, "Cancel release");
    const { inventory, run, item, hold, ingredientId } = await seedHold(
      proof,
      tenantId,
      event.eventId,
      9,
    );
    // Part of the demand was already issued: that movement is history.
    await run(api.mutations.InventoryReservation_consume, {
      docId: hold.docId,
      version: 1,
    });
    // More stock arrives and is held for the rest of the demand. Re-read the
    // item version: the consume movement touched the item row too.
    const itemRow = (await inventory.run(async (ctx) =>
      ctx.db.get(item.docId as never),
    )) as never as { version: number };
    await run(api.mutations.InventoryItem_receiveStock, {
      docId: item.docId,
      version: itemRow.version,
      quantity: 20,
    });
    const extra = await run(
      api.mutations.InventoryReservation_createViaReserve,
      {
        inventoryItemId: item.docId,
        eventId: event.eventId,
        ingredientId,
        quantity: 6,
      },
    );

    const before = await holdsFor(inventory, event.eventId);
    expect(before.map((row) => row.status).sort()).toEqual([
      "active",
      "consumed",
    ]);

    const events = proof.asRole({
      subject: "cancel-release-events",
      role: "event_manager",
      tenantId,
    });
    const eventRow = (await events.run(async (ctx) =>
      ctx.db.get(event.eventId as never),
    )) as never as { version: number };
    await runner(proof, events)(api.mutations.Event_cancel, {
      docId: event.eventId,
      version: eventRow.version,
      reason: "Client called off the party",
    });

    const after = await holdsFor(inventory, event.eventId);
    const consumed = after.find((row) => row._id === hold.docId);
    const active = after.find((row) => row._id === extra.docId);
    // The consumed hold is untouched history; the active hold is released
    // with the reason the event was cancelled.
    expect(consumed).toMatchObject({ status: "consumed", quantity: 9 });
    expect(consumed!.consumedAt ?? null).not.toBeNull();
    expect(consumed!.releasedAt ?? null).toBeNull();
    expect(active).toMatchObject({
      status: "released",
      quantity: 6,
      releaseReason: "Client called off the party",
    });
    expect(active!.releasedAt).not.toBeNull();
  });

  it("completion releases the active hold and keeps the consumed hold", async () => {
    const proof = harness();
    const tenantId = "tenant-b";
    const event = await createPlannedEvent(proof, tenantId, "Complete release");
    const { inventory, run, hold } = await seedHold(
      proof,
      tenantId,
      event.eventId,
      4,
    );

    // Walk the service ladder to final, then complete the event.
    const events = proof.asRole({
      subject: "complete-release-events",
      role: "event_manager",
      tenantId,
    });
    const sales = proof.asRole({
      subject: "complete-release-sales",
      role: "sales_manager",
      tenantId,
    });
    const ladder: Array<[Role, never]> = [
      [events, api.mutations.Event_submitForApproval as never],
      [events, api.mutations.Event_approve as never],
      [sales, api.mutations.Event_lockForSales as never],
      [events, api.mutations.Event_beginExecution as never],
      [events, api.mutations.Event_finalizeEvent as never],
    ];
    let version = 1;
    for (const [i, [role, cmd]] of ladder.entries()) {
      await runner(proof, role)(cmd, { docId: event.eventId, version });
      version = i + 2;
    }
    await runner(proof, events)(api.mutations.Event_complete, {
      docId: event.eventId,
      version,
    });

    const after = await holdsFor(inventory, event.eventId);
    expect(after).toHaveLength(1);
    expect(after[0]!._id).toBe(hold.docId);
    expect(after[0]).toMatchObject({
      status: "released",
      quantity: 4,
      releaseReason: "Event completed",
    });
  });
});
