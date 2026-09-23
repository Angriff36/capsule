/**
 * Runtime proof (AC-407, §6.5 consumed-stock slice of the plan-vs-fact
 * matrix): after inventory staff consume a hold for an event, a later
 * guest-count change keeps the consumed hold exactly as recorded — same id,
 * same used quantity, same consumed time. The used stock is history, not a
 * plan: it is never reopened, deleted, or rewritten to the new forecast, and
 * replaying the same guest count writes no second consumption.
 *
 * Proof only — the commands already exist; nothing here adds commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  changeHeadcount,
  consumedSnapshot,
  createPlannedEvent,
  harness,
  listedReservationFacts,
  readEventRow,
  rolesFor,
  seedConsumedHold,
  type ConsumedSnapshot,
  type Proof,
  type ReservationFactRow,
} from "./plan-vs-fact-consumed-stock.runtime.helpers";

const SEED_HEADCOUNT = 40;
const NEW_HEADCOUNT = 60;
const CONSUMED_QUANTITY = 40;

type ConsumedStockState = {
  proof: Proof;
  roles: ReturnType<typeof rolesFor>;
  eventId: string;
  snapshot: ConsumedSnapshot;
};

/** Seed the event at 40 guests, hold + consume 40 units, snapshot the consumed
 * row, then move the guest count to 60. */
async function seedConsumedStockThenChange(
  tenantId: string,
  title: string,
): Promise<ConsumedStockState> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);

  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  const seeded = await seedConsumedHold(
    proof,
    tenantId,
    eventId,
    CONSUMED_QUANTITY,
  );

  // The used stock as recorded, BEFORE any guest-count change.
  const rows = await listedReservationFacts(roles.inventory, eventId);
  const consumed = rows.find((row) => row._id === seeded.reservationId);
  if (!consumed) throw new Error("Consumed reservation row disappeared");
  const snapshot = consumedSnapshot(consumed);
  expect(consumed.status).toBe("consumed");
  expect(Number(consumed.quantity)).toBe(CONSUMED_QUANTITY);
  expect(consumed.consumedAt).toEqual(expect.any(Number));
  expect(consumed.deletedAt ?? null).toBeNull();

  await changeHeadcount(proof, tenantId, eventId, NEW_HEADCOUNT);

  const event = await readEventRow(roles.events, eventId);
  expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);

  return { proof, roles, eventId, snapshot };
}

/** The one live reservation, or a thrown error when the count is not 1. */
async function theOneLiveReservation(
  actor: ReturnType<typeof rolesFor>["inventory"],
  eventId: string,
): Promise<ReservationFactRow> {
  const rows = await listedReservationFacts(actor, eventId);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: AC-407 §6.5 consumed stock (plan vs fact)", () => {
  it("one headcount change after consumed stock keeps the used hold", async () => {
    const tenantId = "tenant-ac407-stock-keep";
    const { roles, eventId, snapshot } = await seedConsumedStockThenChange(
      tenantId,
      "AC-407 stock keep",
    );

    const event = await readEventRow(roles.events, eventId);
    expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);

    // Exactly one live reservation: the consumed hold. Headcount change
    // opens no leftover hold of the extra 20.
    const row = await theOneLiveReservation(roles.inventory, eventId);
    expect(row._id).toBe(snapshot._id);
    expect(row.status).toBe("consumed");
    expect(Number(row.quantity)).toBe(CONSUMED_QUANTITY);
    expect(row.consumedAt).toBe(snapshot.consumedAt);
    expect(row.reservedAt).toBe(snapshot.reservedAt);
    expect(row.eventId).toBe(snapshot.eventId);
    expect(row.ingredientId).toBe(snapshot.ingredientId);
    expect(row.inventoryItemId).toBe(snapshot.inventoryItemId);
    expect(row.deletedAt ?? null).toBeNull();
    // Not reopened.
    expect(row.status).not.toBe("active");
    expect(row.status).not.toBe("pending");
    expect(row.status).not.toBe("released");
  });

  it("replaying the same headcount after consumed stock does not rewrite the used hold", async () => {
    const tenantId = "tenant-ac407-stock-replay";
    const { proof, roles, eventId, snapshot } =
      await seedConsumedStockThenChange(tenantId, "AC-407 stock replay");

    // Replay the identical headcount (same input, 60 again). A version bump
    // from the first change is tolerated: re-read and retry once.
    await changeHeadcount(proof, tenantId, eventId, NEW_HEADCOUNT);

    const event = await readEventRow(roles.events, eventId);
    expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);

    // Still exactly one live reservation, and the consumed hold is
    // untouched: no second consume stamp, no second reservation row.
    const row = await theOneLiveReservation(roles.inventory, eventId);
    expect(row._id).toBe(snapshot._id);
    expect(row.status).toBe("consumed");
    expect(Number(row.quantity)).toBe(CONSUMED_QUANTITY);
    expect(row.consumedAt).toBe(snapshot.consumedAt);
    expect(row.reservedAt).toBe(snapshot.reservedAt);
    expect(row.deletedAt ?? null).toBeNull();
  });
});
