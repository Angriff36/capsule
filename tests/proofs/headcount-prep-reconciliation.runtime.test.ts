/**
 * Runtime proof (AC-390 prep slice): one Event.changeHeadcount re-scales the
 * live prepTasks exactly once via the declared EventDish.syncHeadcount
 * fan-out (following dishes scale, the override stays) and persists exactly
 * one §8.2 eventReconciliation receipt for the prep domain. Replaying the
 * same headcount writes no prep-quantity diff and no second prep receipt —
 * and the prior menu receipt still exists exactly once. Proof only — not the
 * whole §1.5 change matrix.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  listedPrepTasks,
  prepFor,
  rolesFor,
  runner,
  seedDishWithPrepTask,
  type PrepTaskRow,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";
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

type PrepSnapshotRow = {
  _id: string;
  eventDishId: string;
  quantity: number;
};

function prepSnapshot(rows: PrepTaskRow[]): PrepSnapshotRow[] {
  return rows.map(({ _id, eventDishId, quantity }) => ({
    _id,
    eventDishId,
    quantity,
  }));
}

function headcountReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
  domain: "menu" | "prep",
): ReceiptOutput[] {
  return receipts.filter(
    (row) =>
      row.eventId === eventId &&
      row.triggerType === "EventHeadcountChanged" &&
      row.affectedDomains.length === 1 &&
      row.affectedDomains[0] === domain,
  );
}

function checkpointKeys(receipts: ReceiptOutput[], eventId: string): string[] {
  return receipts
    .filter((row) => row.eventId === eventId)
    .map((row) => row.checkpoint.key)
    .sort((a, b) => a.localeCompare(b));
}

/** Seed + override dish A to 25 + change headcount 40 → 60 (version 1). */
async function seedOverrideAndChange(
  tenantId: string,
  title: string,
): Promise<{
  runEvent: ReturnType<typeof runner>;
  events: Role;
  eventId: string;
  lineAId: string;
  lineBId: string;
}> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const runEvent = runner(proof, roles.events);
  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  const a = await seedDishWithPrepTask(proof, tenantId, eventId, "Override");
  const b = await seedDishWithPrepTask(proof, tenantId, eventId, "Follow");
  await runEvent(M.EventDish_setHeadcountOverride, {
    docId: a.lineId,
    headcountOverride: 25,
  });
  await runEvent(M.Event_changeHeadcount, {
    docId: eventId,
    version: 1,
    newHeadcount: 60,
  });
  return {
    runEvent,
    events: roles.events,
    eventId,
    lineAId: a.lineId,
    lineBId: b.lineId,
  };
}

describe("runtime proof: single prep reconciliation per headcount change (AC-390 slice)", () => {
  it("one headcount change reconciles following prep once with a prep receipt", async () => {
    const tenantId = "tenant-ac390-prep-once";
    const s = await seedOverrideAndChange(tenantId, "AC-390 prep once");

    const tasks = await listedPrepTasks(s.events, s.eventId);
    expect(tasks).toHaveLength(2);
    const a = await prepFor(s.events, s.eventId, s.lineAId);
    expect(a.quantity).toBe(25);
    const b = await prepFor(s.events, s.eventId, s.lineBId);
    expect(b.quantity).toBe(60);

    const receipts = await readReconciliationReceipts(s.events, tenantId);
    const prep = headcountReceipts(receipts, s.eventId, "prep");
    expect(prep).toHaveLength(1);
    const receipt = prep[0]!;
    expect(receipt.triggerType).toBe("EventHeadcountChanged");
    expect(receipt.affectedDomains).toEqual(["prep"]);
    expect(receipt.eventId).toBe(s.eventId);
    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.createdCount).toBe(0);
    expect(receipt.updatedCount).toBe(1);
    expect(receipt.retiredCount).toBe(0);
    expect(receipt.preservedCount).toBe(1);
    expect(receipt.exceptionCount).toBe(0);
    expect(receipt.unresolved).toEqual([]);
    expect(receipt.checkpoint.state).toBe("complete");

    // The prior menu slice keeps proving: exactly one menu receipt too.
    expect(headcountReceipts(receipts, s.eventId, "menu")).toHaveLength(1);
  });

  it("replaying the same headcount against unchanged prep input is a no-op", async () => {
    const tenantId = "tenant-ac390-prep-replay";
    const s = await seedOverrideAndChange(tenantId, "AC-390 prep replay");

    const tasksBefore = await listedPrepTasks(s.events, s.eventId);
    const snapshotBefore = prepSnapshot(tasksBefore);
    expect(snapshotBefore).toHaveLength(2);
    const receiptsBefore = await readReconciliationReceipts(s.events, tenantId);
    const checkpointsBefore = checkpointKeys(receiptsBefore, s.eventId);

    // The SAME headcount again — a replay, not a change.
    const version = await readEventVersion(s.events, s.eventId);
    await s.runEvent(M.Event_changeHeadcount, {
      docId: s.eventId,
      version,
      newHeadcount: 60,
    });

    const tasksAfter = await listedPrepTasks(s.events, s.eventId);
    expect(prepSnapshot(tasksAfter)).toEqual(snapshotBefore);
    expect(tasksAfter).toHaveLength(2);

    const receiptsAfter = await readReconciliationReceipts(s.events, tenantId);
    expect(checkpointKeys(receiptsAfter, s.eventId)).toEqual(checkpointsBefore);
    expect(headcountReceipts(receiptsAfter, s.eventId, "prep")).toHaveLength(1);
  });
});
