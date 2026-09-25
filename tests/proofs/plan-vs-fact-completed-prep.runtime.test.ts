/**
 * Runtime proof (AC-407, §6.5 completed-prep slice of the plan-vs-fact
 * matrix): after kitchen staff finish a prep line, a later guest-count change
 * preserves the finished work — the recorded output, cook, and completion time
 * stay exactly as recorded — and lands only the leftover need on a NEW
 * unfinished line. Replaying the same guest count touches neither the finished
 * row nor the leftover line.
 *
 * Proof only — the commands already exist; nothing here adds commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  changeHeadcount,
  createPlannedEvent,
  finishedSnapshot,
  finishPrepLine,
  harness,
  hireCook,
  listedPrepFacts,
  readEventRow,
  rolesFor,
  seedDishWithPrepTask,
  type FinishedSnapshot,
  type Proof,
  type PrepFactRow,
} from "./plan-vs-fact-completed-prep.runtime.helpers";

const SEED_HEADCOUNT = 40;
const NEW_HEADCOUNT = 60;
const COMPLETED_QUANTITY = 40;

type CompletedPrepState = {
  proof: Proof;
  roles: ReturnType<typeof rolesFor>;
  eventId: string;
  cookId: string;
  snapshot: FinishedSnapshot;
};

/** Seed the event at 40 guests, finish the one seeded prep line as a hired
 * cook, snapshot the finished row, then move the guest count to 60. */
async function seedCompletedPrepThenChange(
  tenantId: string,
  title: string,
): Promise<CompletedPrepState> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);

  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  await seedDishWithPrepTask(proof, tenantId, eventId, "Completed");
  const cookId = await hireCook(proof, tenantId, title);

  const seeded = await listedPrepFacts(roles.events, eventId);
  const pending = seeded.find(
    (row) =>
      row.status === "pending" && Number(row.quantity) === SEED_HEADCOUNT,
  );
  if (!pending)
    throw new Error(`No pending prep line at ${SEED_HEADCOUNT} to finish`);
  await finishPrepLine(
    proof,
    tenantId,
    pending._id,
    cookId,
    COMPLETED_QUANTITY,
  );

  // The finished work as recorded, BEFORE any guest-count change.
  const finishedRows = await listedPrepFacts(roles.events, eventId);
  const finished = finishedRows.find((row) => row._id === pending._id);
  if (!finished) throw new Error("Finished prep row disappeared");
  const snapshot = finishedSnapshot(finished);
  expect(finished.status).toBe("completed");
  expect(Number(finished.quantity)).toBe(SEED_HEADCOUNT);
  expect(Number(finished.completedQuantity)).toBe(COMPLETED_QUANTITY);
  expect(finished.completedAt).toEqual(expect.any(Number));
  expect(finished.assignedToId).toBe(cookId);

  await changeHeadcount(proof, tenantId, eventId, NEW_HEADCOUNT);

  const event = await readEventRow(roles.events, eventId);
  expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);

  return { proof, roles, eventId, cookId, snapshot };
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: AC-407 §6.5 completed prep (plan vs fact)", () => {
  it("one headcount change after completed prep keeps the finished work and opens leftover unfinished work", async () => {
    const tenantId = "tenant-ac407-prep-keep";
    const { roles, eventId, cookId, snapshot } =
      await seedCompletedPrepThenChange(tenantId, "AC-407 prep keep");

    const event = await readEventRow(roles.events, eventId);
    expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);

    // Exactly 2 live prep rows: the finished one kept as recorded, plus one
    // new leftover line.
    const rows: PrepFactRow[] = await listedPrepFacts(roles.events, eventId);
    expect(rows).toHaveLength(2);

    // The finished row: same id, same recorded output, cook, and completion
    // time. Not deleted, not rewritten to match the new forecast.
    const finished = rows.find((row) => row._id === snapshot._id);
    expect(finished).toBeDefined();
    expect(finished!.deletedAt ?? null).toBeNull();
    expect(finished!.status).toBe("completed");
    expect(Number(finished!.quantity)).toBe(SEED_HEADCOUNT);
    expect(Number(finished!.completedQuantity)).toBe(COMPLETED_QUANTITY);
    expect(finished!.completedAt).toBe(snapshot.completedAt);
    expect(finished!.assignedToId).toBe(cookId);

    // Exactly one other live prep on that event: the leftover need for the
    // extra guests, as new unfinished generated work on the same recipe step.
    const leftovers = rows.filter((row) => row._id !== snapshot._id);
    expect(leftovers).toHaveLength(1);
    const leftover = leftovers[0]!;
    expect(leftover.status).toBe("pending");
    expect(Number(leftover.quantity)).toBe(20);
    expect(leftover._id).not.toBe(snapshot._id);
    expect(leftover.eventDishId).toBe(snapshot.eventDishId);
    expect(leftover.dishTaskId).toBe(snapshot.dishTaskId);
    expect(leftover.isGenerated).toBe(true);
  });

  it("replaying the same headcount after completed prep does not rewrite the finished work", async () => {
    const tenantId = "tenant-ac407-prep-replay";
    const { proof, roles, eventId, cookId, snapshot } =
      await seedCompletedPrepThenChange(tenantId, "AC-407 prep replay");

    // The leftover line the first change opened, before the replay.
    const afterFirst = await listedPrepFacts(roles.events, eventId);
    const leftoverBefore = afterFirst.find((row) => row._id !== snapshot._id);
    if (!leftoverBefore)
      throw new Error("First change opened no leftover line");

    // Replay the identical headcount (same input). A version bump from the
    // first change is tolerated: re-read and retry once.
    await changeHeadcount(proof, tenantId, eventId, NEW_HEADCOUNT);

    const event = await readEventRow(roles.events, eventId);
    expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);

    // Still exactly 2 live prep rows, and the finished row is untouched.
    const rows = await listedPrepFacts(roles.events, eventId);
    expect(rows).toHaveLength(2);
    const finished = rows.find((row) => row._id === snapshot._id);
    expect(finished).toBeDefined();
    expect(finished!._id).toBe(snapshot._id);
    expect(finished!.status).toBe("completed");
    expect(Number(finished!.quantity)).toBe(SEED_HEADCOUNT);
    expect(Number(finished!.completedQuantity)).toBe(COMPLETED_QUANTITY);
    expect(finished!.completedAt).toBe(snapshot.completedAt);
    expect(finished!.assignedToId).toBe(cookId);

    // Still exactly one leftover pending at 20 — the SAME line the first
    // change opened: no second leftover, no piled quantity.
    const leftovers = rows.filter((row) => row._id !== snapshot._id);
    expect(leftovers).toHaveLength(1);
    const leftover = leftovers[0]!;
    expect(leftover.status).toBe("pending");
    expect(Number(leftover.quantity)).toBe(20);
    expect(leftover._id).toBe(leftoverBefore._id);
  });
});
