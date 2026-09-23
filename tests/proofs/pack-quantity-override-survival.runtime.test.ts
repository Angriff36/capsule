/**
 * Runtime proof (AC-388, slice 2): a PackListItem quantity override survives
 * Event.changeHeadcount recalculation — the adjusted line keeps its manual
 * quantity while following container lines keep scaling. Proof only — the
 * commands already exist in the manifest; nothing here adds commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  listedPackItems,
  openPackList,
  readRow,
  rolesFor,
  runner,
  seedContainerDishLine,
  liveRows,
  type PackItemRow,
  type Role,
} from "./pack-quantity-override-survival.runtime.helpers";

const M = api.mutations;

type EventRow = { expectedHeadcount: number; tenantId: string };
type EventDishRow = { quantityServings: number; tenantId: string };
type PackListRow = { eventId: string; tenantId: string };

function itemFor(items: PackItemRow[], eventDishId: string): PackItemRow {
  const found = items.find((item) => item.eventDishId === eventDishId);
  if (!found) throw new Error(`No pack item for event dish ${eventDishId}`);
  return found;
}

type Seed = {
  events: Role;
  logistics: Role;
  eventId: string;
  lineA: string;
  lineB: string;
  packListId: string;
};

async function seed(
  proof: ReturnType<typeof harness>,
  tenantId: string,
  title: string,
): Promise<Seed> {
  const roles = rolesFor(proof, tenantId);
  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  const a = await seedContainerDishLine(
    proof,
    tenantId,
    eventId,
    `Override tray ${tenantId}`,
  );
  const b = await seedContainerDishLine(
    proof,
    tenantId,
    eventId,
    `Follow tray ${tenantId}`,
  );
  const packListId = await openPackList(
    proof,
    tenantId,
    eventId,
    `Pack list ${title}`,
  );
  return {
    events: roles.events,
    logistics: roles.logistics,
    eventId,
    lineA: a.lineId,
    lineB: b.lineId,
    packListId,
  };
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: pack quantity override survival (AC-388)", () => {
  it("headcount change keeps an adjusted pack quantity and scales a following pack line", async () => {
    const proof = harness();
    const tenantId = "tenant-ac388-pack-keep";
    const s = await seed(proof, tenantId, "AC-388 pack keep");
    const runEvent = runner(proof, s.events);
    const runLogistics = runner(proof, s.logistics);

    const listed = await listedPackItems(s.events, tenantId, s.packListId);
    expect(listed).toHaveLength(2);
    const packA = itemFor(listed, s.lineA);
    const packB = itemFor(listed, s.lineB);
    expect(packA.requiredQuantity).toBe(4);
    expect(packA.followsDishServings).not.toBe(false);
    expect(packB.requiredQuantity).toBe(4);
    expect(packB.followsDishServings).not.toBe(false);

    await runLogistics(M.PackListItem_adjustQuantity, {
      docId: packA._id,
      requiredQuantity: 7,
    });

    const adjusted = await readRow<PackItemRow>(s.events, packA._id);
    expect(adjusted.requiredQuantity).toBe(7);
    expect(adjusted.followsDishServings).toBe(false);

    await runEvent(M.Event_changeHeadcount, {
      docId: s.eventId,
      version: 1,
      newHeadcount: 60,
    });

    const event = await readRow<EventRow>(s.events, s.eventId);
    expect(event.expectedHeadcount).toBe(60);
    const dishA = await readRow<EventDishRow>(s.events, s.lineA);
    expect(dishA.quantityServings).toBe(60);
    const dishB = await readRow<EventDishRow>(s.events, s.lineB);
    expect(dishB.quantityServings).toBe(60);

    const after = await listedPackItems(s.events, tenantId, s.packListId);
    expect(after).toHaveLength(2);
    const a = itemFor(after, s.lineA);
    expect(a.requiredQuantity).toBe(7);
    expect(a.followsDishServings).toBe(false);
    const b = itemFor(after, s.lineB);
    expect(b.requiredQuantity).toBe(6);
    expect(b.followsDishServings).not.toBe(false);

    const events_ = await liveRows<EventRow>(s.events, "events", tenantId);
    expect(events_).toHaveLength(1);
    const lists = await liveRows<PackListRow>(s.events, "packLists", tenantId);
    expect(lists).toHaveLength(1);
  });

  it("a second headcount change still leaves the adjusted pack quantity and scales the follower", async () => {
    const proof = harness();
    const tenantId = "tenant-ac388-pack-again";
    const s = await seed(proof, tenantId, "AC-388 pack again");
    const runEvent = runner(proof, s.events);
    const runLogistics = runner(proof, s.logistics);

    const listed = await listedPackItems(s.events, tenantId, s.packListId);
    expect(listed).toHaveLength(2);
    const packA = itemFor(listed, s.lineA);

    await runLogistics(M.PackListItem_adjustQuantity, {
      docId: packA._id,
      requiredQuantity: 7,
    });
    await runEvent(M.Event_changeHeadcount, {
      docId: s.eventId,
      version: 1,
      newHeadcount: 60,
    });
    const mid = await listedPackItems(s.events, tenantId, s.packListId);
    expect(itemFor(mid, s.lineA).requiredQuantity).toBe(7);
    expect(itemFor(mid, s.lineB).requiredQuantity).toBe(6);

    await runEvent(M.Event_changeHeadcount, {
      docId: s.eventId,
      version: 2,
      newHeadcount: 80,
    });

    const event = await readRow<EventRow>(s.events, s.eventId);
    expect(event.expectedHeadcount).toBe(80);
    const after = await listedPackItems(s.events, tenantId, s.packListId);
    expect(after).toHaveLength(2);
    const a = itemFor(after, s.lineA);
    expect(a.requiredQuantity).toBe(7);
    expect(a.followsDishServings).toBe(false);
    const b = itemFor(after, s.lineB);
    expect(b.requiredQuantity).toBe(8);
    expect(b.followsDishServings).not.toBe(false);

    const events_ = await liveRows<EventRow>(s.events, "events", tenantId);
    expect(events_).toHaveLength(1);
    const lists = await liveRows<PackListRow>(s.events, "packLists", tenantId);
    expect(lists).toHaveLength(1);
  });
});
