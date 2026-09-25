/**
 * Runtime proof (AC-407, §6.5 custody slice of the plan-vs-fact matrix):
 * after inventory staff check out one equipment hold for an event, a later
 * guest-count change keeps that checked-out hold exactly as recorded — same
 * id, quantity, window, checkout stamp and condition. The handoff is history,
 * not a plan: it is never reopened, cancelled, or rewritten to the new
 * forecast, no leftover hold is invented for the extra guests, and replaying
 * the same guest count writes no second reservation.
 *
 * Proof only — the commands already exist; nothing here adds commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  changeHeadcount,
  createPlannedEvent,
  custodySnapshot,
  harness,
  listedReservationFacts,
  readEventRow,
  rolesFor,
  S,
  seedCheckedOutHold,
  type CustodySnapshot,
  type Proof,
  type ReservationFactRow,
} from "./plan-vs-fact-custody.runtime.helpers";

const SEED_HEADCOUNT = 40;
const NEW_HEADCOUNT = 60;

type CustodyState = {
  proof: Proof;
  roles: ReturnType<typeof rolesFor>;
  eventId: string;
  snapshot: CustodySnapshot;
};

/** Seed the event at 40 guests, check out one hold, snapshot the checked-out
 * row, then move the guest count to 60. */
async function seedCustodyThenChange(
  tenantId: string,
  title: string,
): Promise<CustodyState> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);

  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  const seeded = await seedCheckedOutHold(proof, tenantId, eventId);

  // The checked-out hold as recorded, BEFORE any guest-count change.
  const rows = await listedReservationFacts(roles.inventory, eventId);
  const checkedOut = rows.find((row) => row._id === seeded.reservationId);
  if (!checkedOut) throw new Error("Checked-out reservation row disappeared");
  const snapshot = custodySnapshot(checkedOut);
  expect(checkedOut.status).toBe("checked_out");
  expect(Number(checkedOut.quantity)).toBe(1);
  expect(checkedOut.checkedOutAt).toEqual(expect.any(Number));
  expect(checkedOut.checkoutCondition).toBe("good");
  expect(checkedOut.startsAt).toBe(S.startsAt);
  expect(checkedOut.endsAt).toBe(S.endsAt);
  expect(checkedOut.deletedAt ?? null).toBeNull();

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

describe("runtime proof: AC-407 §6.5 custody (plan vs fact)", () => {
  it("one headcount change after checkout keeps the custody hold", async () => {
    const tenantId = "tenant-ac407-custody-keep";
    const { roles, eventId, snapshot } = await seedCustodyThenChange(
      tenantId,
      "AC-407 custody keep",
    );

    const event = await readEventRow(roles.events, eventId);
    expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);

    // Exactly one live reservation: the checked-out hold. Headcount change
    // invents no leftover hold for the extra 20 guests.
    const row = await theOneLiveReservation(roles.inventory, eventId);
    expect(row._id).toBe(snapshot._id);
    expect(row.status).toBe("checked_out");
    expect(Number(row.quantity)).toBe(1);
    expect(row.startsAt).toBe(snapshot.startsAt);
    expect(row.endsAt).toBe(snapshot.endsAt);
    expect(row.checkedOutAt).toBe(snapshot.checkedOutAt);
    expect(row.checkoutCondition).toBe("good");
    expect(row.reservedAt).toBe(snapshot.reservedAt);
    expect(row.eventId).toBe(snapshot.eventId);
    expect(row.equipmentId).toBe(snapshot.equipmentId);
    expect(row.deletedAt ?? null).toBeNull();
    // Not reopened, cancelled, or returned.
    expect(row.status).not.toBe("reserved");
    expect(row.status).not.toBe("cancelled");
    expect(row.status).not.toBe("returned");
  });

  it("replaying the same headcount after checkout does not rewrite the custody hold", async () => {
    const tenantId = "tenant-ac407-custody-replay";
    const { proof, roles, eventId, snapshot } = await seedCustodyThenChange(
      tenantId,
      "AC-407 custody replay",
    );

    // Replay the identical headcount (same input, 60 again). A version bump
    // from the first change is tolerated: re-read and retry once.
    await changeHeadcount(proof, tenantId, eventId, NEW_HEADCOUNT);

    const event = await readEventRow(roles.events, eventId);
    expect(event.expectedHeadcount).toBe(NEW_HEADCOUNT);

    // Still exactly one live reservation, and the checked-out hold is
    // untouched: no second checkout stamp, no second reservation row.
    const row = await theOneLiveReservation(roles.inventory, eventId);
    expect(row._id).toBe(snapshot._id);
    expect(row.status).toBe("checked_out");
    expect(Number(row.quantity)).toBe(1);
    expect(row.checkedOutAt).toBe(snapshot.checkedOutAt);
    expect(row.startsAt).toBe(snapshot.startsAt);
    expect(row.endsAt).toBe(snapshot.endsAt);
    expect(row.deletedAt ?? null).toBeNull();
  });
});
