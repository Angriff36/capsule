/**
 * Shared harness for the AC-390 cancellation runtime proof: roles, the
 * planned-event seed with one reserved + one checked-out equipment hold and
 * one assigned + one checked-in crew assignment, the governed cancel step,
 * and readers for the four rows. Assertion-free; the test file owns every
 * expect().
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  readEventVersion,
  runner,
  type Proof,
  type Role,
} from "./single-reconciliation.runtime.helpers";

export const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
} as const;

const M = api.mutations;

export { readEventVersion };

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
): {
  sales: Role;
  events: Role;
  inventory: Role;
  workforce: Role;
} {
  const mk = (name: string, role: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role, tenantId });
  return {
    sales: mk("sales", "sales_manager"),
    events: mk("events", "event_manager"),
    inventory: mk("inventory", "inventory_staff"),
    workforce: mk("workforce", "workforce_manager"),
  };
}

export type CancelIds = {
  eventId: string;
  reservedId: string;
  checkedOutId: string;
  assignedId: string;
  checkedInId: string;
};

/** Company client + planned Event at the seed window, one owned equipment lot
 * (quantity 2) with two holds of 1 — the SECOND checked out — and two crew
 * assignments — the SECOND checked in. Nothing is cancelled yet. */
export async function seedEventWithWork(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<CancelIds> {
  const { sales, inventory, workforce } = rolesFor(proof, tenantId);
  const runSales = runner(proof, sales);
  const runInventory = runner(proof, inventory);
  const runWorkforce = runner(proof, workforce);

  const client = await runSales(M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Cancellation receipt client ${tenantId} ${title}`,
  });
  const event = await runSales(M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: 40,
    primaryContactName: "Casey Standsdown",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });

  const equipment = await runInventory(M.Equipment_createViaRegister, {
    name: `Cancellation receipt equipment ${tenantId} ${title}`,
    assetTag: `cancel-receipt-${tenantId}-${title}`,
    category: "furniture",
    ownership: "owned",
    quantity: 2,
  });

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

  await runInventory(M.EquipmentReservation_checkOut, {
    docId: second.equipmentReservationId,
    version: 0,
    condition: "good",
  });

  const captain = await runWorkforce(M.Person_createViaHire, {
    givenName: "Avery",
    familyName: "Rivera",
    email: `captain-${tenantId}-${title}@proof.example`,
    role: "workforce_staff",
    employmentType: "part_time",
  });
  const server = await runWorkforce(M.Person_createViaHire, {
    givenName: "Sasha",
    familyName: "Laylee",
    email: `server-${tenantId}-${title}@proof.example`,
    role: "workforce_staff",
    employmentType: "part_time",
  });
  const assigned = await runWorkforce(M.EventAssignment_createViaAssign, {
    eventId: event.docId,
    personId: captain.docId,
    role: "captain",
  });
  const checkedIn = await runWorkforce(M.EventAssignment_createViaAssign, {
    eventId: event.docId,
    personId: server.docId,
    role: "server",
  });

  await runWorkforce(M.EventAssignment_checkIn, {
    docId: checkedIn.docId,
    version: 1,
  });

  return {
    eventId: event.docId,
    reservedId: first.equipmentReservationId,
    checkedOutId: second.equipmentReservationId,
    assignedId: assigned.docId,
    checkedInId: checkedIn.docId,
  };
}

/** Cancels the event through the governed cancel command at the live version. */
export async function cancelEvent(
  proof: Proof,
  tenantId: string,
  eventId: string,
  reason: string,
): Promise<void> {
  const { events } = rolesFor(proof, tenantId);
  const version = await readEventVersion(events, eventId);
  await runner(proof, events)(M.Event_cancel, {
    docId: eventId,
    version,
    reason,
  });
}

export type WorkRow = {
  _id: string;
  status: string;
  cancellationReason?: string;
};

/** One reservation or assignment row, or a thrown error. */
export async function readWorkRow(
  actor: Role,
  docId: string,
): Promise<WorkRow> {
  const row = (await actor.run(async (ctx) =>
    ctx.db.get(docId as never),
  )) as WorkRow | null;
  if (!row) throw new Error(`Row ${docId} not found`);
  return row;
}

/** The identity + status + reason slice the replay proof compares. */
export function workSnapshot(row: WorkRow): WorkRow {
  return {
    _id: row._id,
    status: row.status,
    cancellationReason: row.cancellationReason,
  };
}
