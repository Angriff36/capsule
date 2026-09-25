/**
 * Seed + readers for the AC-407 §6.5 consumed-stock slice of the plan-vs-fact
 * matrix runtime proof: hold 40 units for the event, consume the hold, snapshot
 * the consumed row, and move the guest count. Reuses the AC-390 prep harness
 * for the planned event. Assertion-free; the test file owns every expect().
 */
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  runner,
  type Proof,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";

export { createPlannedEvent, harness, runner };
export type { Proof, Role };

/** Sales / events / kitchen / inventory actors for one tenant. The prep
 * harness roles have no inventory actor, so this slice declares its own. */
export function rolesFor(proof: Proof, tenantId: string) {
  const mk = (name: string, role: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role, tenantId });
  return {
    sales: mk("sales", "sales_manager"),
    events: mk("event-manager", "event_manager"),
    kitchen: mk("kitchen", "kitchen_manager"),
    inventory: mk("inventory", "inventory_staff"),
  };
}

export type ReservationFactRow = {
  _id: string;
  eventId: string;
  ingredientId: string;
  inventoryItemId: string;
  quantity: number;
  status: string;
  consumedAt?: number | null;
  reservedAt?: number | null;
  releasedAt?: number | null;
  deletedAt?: number | null;
};

export type ConsumedSnapshot = {
  _id: string;
  quantity: number;
  status: string;
  consumedAt: number;
  reservedAt: number;
  eventId: string;
  ingredientId: string;
  inventoryItemId: string;
};

/** The identity + used-when slice the proof compares after a guest-count
 * change. */
export function consumedSnapshot(row: ReservationFactRow): ConsumedSnapshot {
  if (row.consumedAt == null || row.reservedAt == null)
    throw new Error(`Reservation ${row._id} is not consumed history`);
  return {
    _id: row._id,
    quantity: Number(row.quantity),
    status: row.status,
    consumedAt: row.consumedAt,
    reservedAt: row.reservedAt,
    eventId: row.eventId,
    ingredientId: row.ingredientId,
    inventoryItemId: row.inventoryItemId,
  };
}

let holdSeed = 0;

/** Hold `quantity` units for the event and consume the hold, through the same
 * governed commands as the terminal-meanings proof (introduce → register →
 * open → reserve → consume). Returns the reservation and stock ids. */
export async function seedConsumedHold(
  proof: Proof,
  tenantId: string,
  eventId: string,
  quantity: number,
): Promise<{
  reservationId: string;
  ingredientId: string;
  inventoryItemId: string;
}> {
  const { kitchen, inventory } = rolesFor(proof, tenantId);
  holdSeed += 1;
  const ing = await runner(proof, kitchen)(
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: `Consumed stock ingredient ${tenantId} ${holdSeed}`,
      unit: "kilogram",
      costPerUnit: 3.5,
      allergens: [],
      category: "pantry",
    },
  );
  const runInventory = runner(proof, inventory);
  const loc = await runInventory(
    api.mutations.StorageLocation_createViaRegister,
    {
      name: `Consumed stock storage ${tenantId} ${holdSeed}`,
      locationType: "dry",
    },
  );
  const item = await runInventory(api.mutations.InventoryItem_createViaOpen, {
    ingredientId: ing.docId,
    locationId: loc.docId,
    unit: "kilogram",
    quantityOnHand: 80,
    parLevel: 10,
    reorderThreshold: 5,
    unitCost: 3.5,
  });
  const res = await runInventory(
    api.mutations.InventoryReservation_createViaReserve,
    {
      inventoryItemId: item.docId,
      eventId,
      ingredientId: ing.docId,
      quantity,
    },
  );
  await runInventory(api.mutations.InventoryReservation_consume, {
    docId: res.docId,
    version: 1,
  });
  return {
    reservationId: res.docId,
    ingredientId: ing.docId,
    inventoryItemId: item.docId,
  };
}

/** Live (deletedAt == null) inventoryReservations for one event, read the same
 * way liveRowsFor reads the table in the terminal-meanings proof. */
export function listedReservationFacts(
  actor: Role,
  eventId: string,
): Promise<ReservationFactRow[]> {
  return actor
    .run(
      async (ctx) =>
        ctx.db.query("inventoryReservations").collect() as unknown as Promise<
          ReservationFactRow[]
        >,
    )
    .then((rows) =>
      rows.filter((row) => row.deletedAt == null && row.eventId === eventId),
    );
}

export type EventRow = {
  expectedHeadcount: number;
  version: number;
};

export async function readEventRow(
  actor: Role,
  eventId: string,
): Promise<EventRow> {
  return (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as never as EventRow;
}

/** Move the guest count as the event manager. Retries once on a version
 * mismatch by re-reading the event version; other errors propagate. */
export async function changeHeadcount(
  proof: Proof,
  tenantId: string,
  eventId: string,
  newHeadcount: number,
  retryVersion?: number,
): Promise<void> {
  const runEvent = runner(proof, rolesFor(proof, tenantId).events);
  const event = await readEventRow(rolesFor(proof, tenantId).events, eventId);
  try {
    await runEvent(api.mutations.Event_changeHeadcount, {
      docId: eventId,
      version: retryVersion ?? event.version,
      newHeadcount,
    });
  } catch (error) {
    if (retryVersion !== undefined) throw error;
    if (!String(error).includes("VERSION_MISMATCH")) throw error;
    await changeHeadcount(
      proof,
      tenantId,
      eventId,
      newHeadcount,
      event.version,
    );
  }
}
