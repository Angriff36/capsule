/**
 * Runtime proof (AC-388, slice 1): an EventDish headcount override survives
 * Event.changeHeadcount recalculation until the operator revokes it with
 * setHeadcountOverride(0). Proof only — the commands already exist in the
 * manifest; nothing here adds commands or changes `final`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  rolesFor,
  runner,
  seedOverridableDishLines,
  type Role,
} from "./override-survival.runtime.helpers";

const M = api.mutations;

type EventDishRow = {
  quantityServings: number;
  headcountOverride: number | null;
  followsEventHeadcount: boolean | null;
  tenantId: string;
};

type EventRow = { expectedHeadcount: number; tenantId: string };

async function readDishLine(actor: Role, docId: string): Promise<EventDishRow> {
  return (await actor.run(async (ctx) =>
    ctx.db.get(docId as never),
  )) as never as EventDishRow;
}

async function readEvent(actor: Role, eventId: string): Promise<EventRow> {
  return (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as never as EventRow;
}

async function liveRows<T extends { tenantId: string }>(
  actor: Role,
  table: string,
  tenantId: string,
): Promise<T[]> {
  const rows = (await actor.run(
    async (ctx) =>
      ctx.db.query(table as never).collect() as unknown as Promise<T[]>,
  )) as T[];
  return rows.filter((row) => row.tenantId === tenantId);
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: EventDish headcount override survival (AC-388)", () => {
  it("headcount change keeps an overridden dish and scales a following dish", async () => {
    const proof = harness();
    const tenantId = "tenant-ac388-keep";
    const { events } = rolesFor(proof, tenantId);
    const run = runner(proof, events);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "AC-388 keep",
    );
    const { lineA, lineB } = await seedOverridableDishLines(
      proof,
      tenantId,
      eventId,
    );

    await run(M.EventDish_setHeadcountOverride, {
      docId: lineA,
      headcountOverride: 25,
    });
    await run(M.Event_changeHeadcount, {
      docId: eventId,
      version: 1,
      newHeadcount: 60,
    });

    const event = await readEvent(events, eventId);
    expect(event.expectedHeadcount).toBe(60);

    const overridden = await readDishLine(events, lineA);
    expect(overridden.quantityServings).toBe(25);
    expect(overridden.headcountOverride).toBe(25);
    expect(overridden.followsEventHeadcount).toBe(false);

    const follower = await readDishLine(events, lineB);
    expect(follower.quantityServings).toBe(60);
    expect(follower.followsEventHeadcount).toBeTruthy();

    const events_ = await liveRows<EventRow>(events, "events", tenantId);
    expect(events_).toHaveLength(1);
    const lines = await liveRows<EventDishRow>(events, "eventDishes", tenantId);
    expect(lines).toHaveLength(2);
  });

  it("revoking the override with 0 lets the next headcount change scale that dish", async () => {
    const proof = harness();
    const tenantId = "tenant-ac388-revoke";
    const { events } = rolesFor(proof, tenantId);
    const run = runner(proof, events);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "AC-388 revoke",
    );
    const { lineA, lineB } = await seedOverridableDishLines(
      proof,
      tenantId,
      eventId,
    );

    await run(M.EventDish_setHeadcountOverride, {
      docId: lineA,
      headcountOverride: 25,
    });
    await run(M.Event_changeHeadcount, {
      docId: eventId,
      version: 1,
      newHeadcount: 60,
    });
    const stillOverridden = await readDishLine(events, lineA);
    expect(stillOverridden.quantityServings).toBe(25);
    const followerNow = await readDishLine(events, lineB);
    expect(followerNow.quantityServings).toBe(60);

    await run(M.EventDish_setHeadcountOverride, {
      docId: lineA,
      headcountOverride: 0,
    });
    const revoked = await readDishLine(events, lineA);
    expect(revoked.headcountOverride).toBe(0);
    expect(revoked.followsEventHeadcount).toBe(true);
    expect(revoked.quantityServings).toBe(60);

    await run(M.Event_changeHeadcount, {
      docId: eventId,
      version: 2,
      newHeadcount: 80,
    });
    const a = await readDishLine(events, lineA);
    expect(a.quantityServings).toBe(80);
    const b = await readDishLine(events, lineB);
    expect(b.quantityServings).toBe(80);
    const event = await readEvent(events, eventId);
    expect(event.expectedHeadcount).toBe(80);
  });
});
