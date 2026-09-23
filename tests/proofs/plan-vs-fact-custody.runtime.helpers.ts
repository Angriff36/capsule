/**
 * Seed + readers for the AC-407 §6.5 custody slice of the plan-vs-fact matrix
 * runtime proof: reserve one equipment hold for the event, check it out,
 * snapshot the checked-out row, and move the guest count. Reuses the AC-390
 * prep harness for the planned event and window. Assertion-free; the test
 * file owns every expect().
 */
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  runner,
  S,
  type Proof,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";

export { createPlannedEvent, harness, runner, S };
export type { Proof, Role };

/** Events / inventory actors for one tenant. The prep harness roles have no
 * inventory actor, so this slice declares its own. */
export function rolesFor(proof: Proof, tenantId: string) {
  const mk = (name: string, role: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role, tenantId });
  return {
    events: mk("event-manager", "event_manager"),
    inventory: mk("inventory", "inventory_staff"),
  };
}

export type ReservationFactRow = {
  _id: string;
  eventId: string;
  equipmentId: string;
  quantity: number;
  status: string;
  startsAt: number | null;
  endsAt: number | null;
  checkedOutAt?: number | null;
  checkoutCondition?: string | null;
  reservedAt?: number | null;
  deletedAt?: number | null;
};

export type CustodySnapshot = {
  _id: string;
  quantity: number;
  status: string;
  startsAt: number | null;
  endsAt: number | null;
  checkedOutAt: number;
  checkoutCondition: string;
  reservedAt: number;
  eventId: string;
  equipmentId: string;
  deletedAt?: number | null;
};

/** The identity + custody slice the proof compares after a guest-count
 * change. */
export function custodySnapshot(row: ReservationFactRow): CustodySnapshot {
  if (row.checkedOutAt == null || row.reservedAt == null)
    throw new Error(`Reservation ${row._id} is not checked-out history`);
  return {
    _id: row._id,
    quantity: Number(row.quantity),
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    checkedOutAt: row.checkedOutAt,
    checkoutCondition: row.checkoutCondition as string,
    reservedAt: row.reservedAt,
    eventId: row.eventId,
    equipmentId: row.equipmentId,
    deletedAt: row.deletedAt ?? null,
  };
}

let holdSeed = 0;

/** Register one owned equipment lot, reserve ONE hold of 1 for the event on
 * the seed window, and check it out through the governed commands. Returns
 * the reservation and equipment ids. */
export async function seedCheckedOutHold(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<{ reservationId: string; equipmentId: string }> {
  const { inventory } = rolesFor(proof, tenantId);
  holdSeed += 1;
  const equipment = await runner(proof, inventory)(
    api.mutations.Equipment_createViaRegister,
    {
      name: `Custody equipment ${tenantId} ${holdSeed}`,
      assetTag: `custody-${tenantId}-${holdSeed}`,
      category: "furniture",
      ownership: "owned",
      quantity: 1,
    },
  );
  const res = (await inventory.mutation(api.equipmentCheckout.reserve, {
    equipmentId: equipment.docId,
    eventId,
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    quantity: 1,
  })) as { equipmentReservationId: string };
  await runner(proof, inventory)(api.mutations.EquipmentReservation_checkOut, {
    docId: res.equipmentReservationId,
    version: 0,
    condition: "good",
  });
  return {
    reservationId: res.equipmentReservationId,
    equipmentId: equipment.docId,
  };
}

/** Live (deletedAt == null or absent) equipmentReservations for one event,
 * read the same way the consumed-stock proof reads inventoryReservations. */
export function listedReservationFacts(
  actor: Role,
  eventId: string,
): Promise<ReservationFactRow[]> {
  return actor
    .run(
      async (ctx) =>
        ctx.db.query("equipmentReservations").collect() as unknown as Promise<
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
  const roles = rolesFor(proof, tenantId);
  const runEvent = runner(proof, roles.events);
  const event = await readEventRow(roles.events, eventId);
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
