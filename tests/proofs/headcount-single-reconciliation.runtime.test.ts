/**
 * Runtime proof (AC-390 menu slice): one Event.changeHeadcount scales the
 * following EventDishes exactly once via the declared syncHeadcount fan-out
 * and persists exactly one §8.2 eventReconciliation receipt for the menu
 * domain. Replaying the same headcount writes no dish diff and no second
 * receipt. Proof only — not the whole §1.5 change matrix.
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
import {
  readEventVersion,
  readReconciliationReceipts,
  type ReceiptOutput,
} from "./single-reconciliation.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type DishLineRow = {
  _id: string;
  eventId: string;
  quantityServings: number;
  followsEventHeadcount: boolean | null;
  headcountOverride: number | null;
  tenantId: string;
  deletedAt: number | null;
  removedAt: number | null;
};

type EventRow = { expectedHeadcount: number };

type DishSnapshotRow = {
  _id: string;
  quantityServings: number;
  followsEventHeadcount: boolean | null;
  headcountOverride: number | null;
};

/** Live (not deleted, not removed) dish lines of one event, sorted by id. */
async function liveDishLines(
  actor: Role,
  eventId: string,
): Promise<DishLineRow[]> {
  const rows = (await actor.run(
    async (ctx) =>
      ctx.db.query("eventDishes").collect() as unknown as Promise<
        DishLineRow[]
      >,
  )) as DishLineRow[];
  return rows
    .filter(
      (row) =>
        row.eventId === eventId &&
        row.deletedAt == null &&
        row.removedAt == null,
    )
    .sort((a, b) => a._id.localeCompare(b._id));
}

function dishSnapshot(rows: DishLineRow[]): DishSnapshotRow[] {
  return rows.map(
    ({ _id, quantityServings, followsEventHeadcount, headcountOverride }) => ({
      _id,
      quantityServings,
      followsEventHeadcount,
      headcountOverride,
    }),
  );
}

function receiptShape(receipt: ReceiptOutput): void {
  expect(typeof receipt.eventId).toBe("string");
  expect(receipt.eventId.length).toBeGreaterThan(0);
  expect(typeof receipt.tenantId).toBe("string");
  expect(receipt.tenantId.length).toBeGreaterThan(0);
  expect(typeof receipt.triggerEventId).toBe("string");
  expect(receipt.triggerEventId.length).toBeGreaterThan(0);
  expect(typeof receipt.inputVersions.checkpoint).toBe("string");
  expect(receipt.inputVersions.checkpoint.length).toBeGreaterThan(0);
  expect(typeof receipt.createdCount).toBe("number");
  expect(typeof receipt.updatedCount).toBe("number");
  expect(typeof receipt.retiredCount).toBe("number");
  expect(typeof receipt.preservedCount).toBe("number");
  expect(typeof receipt.exceptionCount).toBe("number");
  expect(Array.isArray(receipt.unresolved)).toBe(true);
  expect(receipt.checkpoint.state).toBe("complete");
}

function menuReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
): ReceiptOutput[] {
  return receipts.filter(
    (row) =>
      row.eventId === eventId &&
      row.triggerType === "EventHeadcountChanged" &&
      row.affectedDomains.length === 1 &&
      row.affectedDomains[0] === "menu",
  );
}

function checkpointKeys(receipts: ReceiptOutput[], eventId: string): string[] {
  return receipts
    .filter((row) => row.eventId === eventId)
    .map((row) => row.checkpoint.key)
    .sort((a, b) => a.localeCompare(b));
}

/** Seed + override line A to 25 + change headcount 40 → 60. */
async function seedOverrideAndChange(
  tenantId: string,
  title: string,
): Promise<{
  run: ReturnType<typeof runner>;
  events: Role;
  eventId: string;
  lineA: string;
  lineB: string;
}> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const run = runner(proof, roles.events);
  const { eventId } = await createPlannedEvent(proof, tenantId, title);
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
  return { run, events: roles.events, eventId, lineA, lineB };
}

describe("runtime proof: single menu reconciliation per headcount change (AC-390 slice)", () => {
  it("one headcount change reconciles following dishes once with a menu receipt", async () => {
    const tenantId = "tenant-ac390-menu-once";
    const { events, eventId, lineA, lineB } = await seedOverrideAndChange(
      tenantId,
      "AC-390 menu once",
    );

    const lines = await liveDishLines(events, eventId);
    expect(lines).toHaveLength(2);
    const byId = new Map(lines.map((row) => [row._id, row]));
    const a = byId.get(lineA)!;
    expect(a.quantityServings).toBe(25);
    expect(a.headcountOverride).toBe(25);
    expect(a.followsEventHeadcount).toBe(false);
    const b = byId.get(lineB)!;
    expect(b.quantityServings).toBe(60);
    expect(b.followsEventHeadcount).not.toBe(false);

    const event = (await events.run(async (ctx) =>
      ctx.db.get(eventId as never),
    )) as never as EventRow;
    expect(event.expectedHeadcount).toBe(60);

    const receipts = await readReconciliationReceipts(events, tenantId);
    const menu = menuReceipts(receipts, eventId);
    expect(menu).toHaveLength(1);
    expect(menu[0]!.affectedDomains).toEqual(["menu"]);
    expect(menu[0]!.triggerType).toBe("EventHeadcountChanged");
    expect(menu[0]!.eventId).toBe(eventId);
    expect(menu[0]!.tenantId).toBe(tenantId);
    expect(typeof menu[0]!.triggerEventId).toBe("string");
    expect(menu[0]!.triggerEventId.length).toBeGreaterThan(0);
    expect(menu[0]!.createdCount).toBe(0);
    expect(menu[0]!.updatedCount).toBe(1);
    expect(menu[0]!.retiredCount).toBe(0);
    expect(menu[0]!.preservedCount).toBe(1);
    expect(menu[0]!.exceptionCount).toBe(0);
    expect(menu[0]!.unresolved).toEqual([]);
    expect(menu[0]!.checkpoint.state).toBe("complete");
    receiptShape(menu[0]!);
  });

  it("replaying the same headcount against unchanged input is a no-op", async () => {
    const tenantId = "tenant-ac390-menu-replay";
    const { run, events, eventId } = await seedOverrideAndChange(
      tenantId,
      "AC-390 menu replay",
    );

    const linesBefore = await liveDishLines(events, eventId);
    const snapshotBefore = dishSnapshot(linesBefore);
    expect(snapshotBefore).toHaveLength(2);
    const receiptsBefore = await readReconciliationReceipts(events, tenantId);
    const checkpointsBefore = checkpointKeys(receiptsBefore, eventId);

    // The SAME headcount again — a replay, not a change.
    const version = await readEventVersion(events, eventId);
    await run(M.Event_changeHeadcount, {
      docId: eventId,
      version,
      newHeadcount: 60,
    });

    const linesAfter = await liveDishLines(events, eventId);
    expect(dishSnapshot(linesAfter)).toEqual(snapshotBefore);
    expect(linesAfter).toHaveLength(2);

    const receiptsAfter = await readReconciliationReceipts(events, tenantId);
    expect(checkpointKeys(receiptsAfter, eventId)).toEqual(checkpointsBefore);
    expect(menuReceipts(receiptsAfter, eventId)).toHaveLength(1);
  });
});
