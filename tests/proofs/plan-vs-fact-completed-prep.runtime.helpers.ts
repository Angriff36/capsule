/**
 * Seed + readers for the AC-407 §6.5 completed-prep slice of the plan-vs-fact
 * matrix runtime proof: hire a cook, finish the one seeded prep line, snapshot
 * the finished row, and move the guest count. Reuses the AC-390 prep harness.
 * Assertion-free; the test file owns every expect().
 */
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  rolesFor,
  runner,
  seedDishWithPrepTask,
  type Proof,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";

export { createPlannedEvent, harness, rolesFor, runner, seedDishWithPrepTask };
export type { Proof, Role };

export type PrepFactRow = {
  _id: string;
  eventId: string;
  eventDishId: string;
  dishTaskId?: string | null;
  quantity: number;
  completedQuantity?: number | null;
  status: string;
  completedAt?: number | null;
  assignedToId?: string | null;
  isGenerated?: boolean | null;
  name: string;
  deletedAt?: number | null;
};

export type FinishedSnapshot = {
  _id: string;
  quantity: number;
  completedQuantity: number;
  status: string;
  completedAt: number;
  assignedToId: string;
  eventDishId: string;
  dishTaskId: string;
  eventId: string;
};

/** The identity + recorded-output slice the proof compares after a guest-count
 * change. */
export function finishedSnapshot(row: PrepFactRow): FinishedSnapshot {
  if (row.completedAt == null || row.assignedToId == null)
    throw new Error(`Prep row ${row._id} is not finished work`);
  return {
    _id: row._id,
    quantity: Number(row.quantity),
    completedQuantity: Number(row.completedQuantity ?? 0),
    status: row.status,
    completedAt: row.completedAt,
    assignedToId: row.assignedToId,
    eventDishId: row.eventDishId,
    dishTaskId: row.dishTaskId ?? "",
    eventId: row.eventId,
  };
}

/** Live (not deleted) prep rows for one event, sorted by eventDishId, read the
 * same way listedPrepTasks reads prepTasks. */
export function listedPrepFacts(
  actor: Role,
  eventId: string,
): Promise<PrepFactRow[]> {
  return actor
    .run(
      async (ctx) =>
        ctx.db.query("prepTasks").collect() as unknown as Promise<
          PrepFactRow[]
        >,
    )
    .then((rows) =>
      rows
        .filter((row) => row.eventId === eventId && row.deletedAt == null)
        .sort((a, b) => a.eventDishId.localeCompare(b.eventDishId)),
    );
}

/** Hire one part-time cook as the workforce manager. Returns the person id. */
export async function hireCook(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<string> {
  const runWorkforce = runner(
    proof,
    proof.asRole({
      subject: `workforce-${tenantId}`,
      role: "workforce_manager",
      tenantId,
    }),
  );
  const cook = await runWorkforce(api.mutations.Person_createViaHire, {
    givenName: "Rowan",
    familyName: "Bishop",
    email: `cook-${tenantId}-${title}@proof.example`,
    role: "workforce_staff",
    employmentType: "part_time",
  });
  return cook.docId;
}

/** Put the cook on one pending prep line, start it, and record the finished
 * output, as the kitchen manager. */
export async function finishPrepLine(
  proof: Proof,
  tenantId: string,
  prepTaskId: string,
  cookId: string,
  completedQuantity: number,
): Promise<void> {
  const runKitchen = runner(proof, rolesFor(proof, tenantId).kitchen);
  await runKitchen(api.mutations.PrepTask_assign, {
    docId: prepTaskId,
    personId: cookId,
  });
  await runKitchen(api.mutations.PrepTask_start, { docId: prepTaskId });
  await runKitchen(api.mutations.PrepTask_complete, {
    docId: prepTaskId,
    completedQuantity,
  });
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
  const event = await readEventRow(actorFor(proof, tenantId), eventId);
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

function actorFor(proof: Proof, tenantId: string): Role {
  return rolesFor(proof, tenantId).events;
}
