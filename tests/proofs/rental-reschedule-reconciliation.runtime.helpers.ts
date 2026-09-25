/**
 * Shared harness for the AC-390 rental-reschedule runtime proof: roles, the
 * planned-event seed, one owned equipment lot with a reserved hold and a
 * checked-out hold on the seed window, the reschedule step, and readers for
 * the reservation rows and the Event window. Assertion-free; the test file
 * owns every expect().
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  R1,
  S,
  readEventVersion,
  runner,
  type Proof,
  type Role,
} from "./single-reconciliation.runtime.helpers";

const M = api.mutations;

export { R1, S, readEventVersion };

export function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

export function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role; inventory: Role } {
  const mk = (name: string, role: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role, tenantId });
  return {
    sales: mk("sales", "sales_manager"),
    events: mk("events", "event_manager"),
    inventory: mk("inventory", "inventory_staff"),
  };
}

export type HoldIds = {
  eventId: string;
  equipmentId: string;
  reservedId: string;
  checkedOutId: string;
};

/** Company client + planned Event at the seed window, one owned equipment lot
 * (quantity 2), two reserved holds of 1 on that window, and the SECOND hold
 * checked out — reservedId stays reserved, checkedOutId becomes custody
 * history before any reschedule. */
export async function seedEventWithHolds(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<HoldIds> {
  const { sales, inventory } = rolesFor(proof, tenantId);
  const runSales = runner(proof, sales);

  const client = await runSales(M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Rental reschedule client ${tenantId} ${title}`,
  });
  const event = await runSales(M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: 40,
    primaryContactName: "Casey Closeshift",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });

  const equipment = await runner(proof, inventory)(
    M.Equipment_createViaRegister,
    {
      name: `Rental reschedule equipment ${tenantId} ${title}`,
      assetTag: `rental-reschedule-${tenantId}-${title}`,
      category: "furniture",
      ownership: "owned",
      quantity: 2,
    },
  );

  const first = (await inventory.mutation(api.equipmentCheckout.reserve, {
    equipmentId: equipment.docId,
    eventId: event.docId,
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    quantity: 1,
  })) as { equipmentReservationId: string };
  const second = (await inventory.mutation(api.equipmentCheckout.reserve, {
    equipmentId: equipment.docId,
    eventId: event.docId,
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    quantity: 1,
  })) as { equipmentReservationId: string };

  await runner(proof, inventory)(M.EquipmentReservation_checkOut, {
    docId: second.equipmentReservationId,
    version: 0,
    condition: "good",
  });

  return {
    eventId: event.docId,
    equipmentId: equipment.docId,
    reservedId: first.equipmentReservationId,
    checkedOutId: second.equipmentReservationId,
  };
}

/** Moves the event to the R1 window through the governed reschedule command. */
export async function rescheduleToR1(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const { events } = rolesFor(proof, tenantId);
  const runEvents = runner(proof, events);
  const version = await readEventVersion(events, eventId);
  await runEvents(M.Event_reschedule, {
    docId: eventId,
    version,
    startsAt: R1.startsAt,
    endsAt: R1.endsAt,
  });
}

export type ReservationRow = {
  _id: string;
  startsAt: number | null;
  endsAt: number | null;
  status: string;
};

/** One equipment reservation row, or a thrown error. */
export async function readReservation(
  actor: Role,
  reservationId: string,
): Promise<ReservationRow> {
  const row = (await actor.run(async (ctx) =>
    ctx.db.get(reservationId as never),
  )) as ReservationRow | null;
  if (!row) throw new Error(`Reservation ${reservationId} not found`);
  return row;
}

export type ReservationSnapshot = {
  _id: string;
  startsAt: number | null;
  endsAt: number | null;
  status: string;
};

export function reservationSnapshot(row: ReservationRow): ReservationSnapshot {
  return {
    _id: row._id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
  };
}

export type EventWindow = { startsAt: number | null; endsAt: number | null };

/** The Event's start/end window, or a thrown error. */
export async function readEventWindow(
  actor: Role,
  eventId: string,
): Promise<EventWindow> {
  const event = (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as EventWindow | null;
  if (!event) throw new Error(`Event ${eventId} not found`);
  return { startsAt: event.startsAt, endsAt: event.endsAt };
}
