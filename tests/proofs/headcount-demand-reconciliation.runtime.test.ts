/**
 * Runtime proof (AC-390 demand slice): one Event.changeHeadcount re-syncs the
 * live IngredientDemands exactly once via the declared
 * EventIngredientContribution.revise fan-out and persists exactly one §8.2
 * eventReconciliation receipt for the demand domain. Replaying the same
 * headcount writes no demand-quantity diff and no second demand receipt —
 * and the prior menu receipt still exists exactly once. Proof only — not the
 * whole §1.5 change matrix.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  demandFor,
  harness,
  listedDemands,
  rolesFor,
  runner,
  seedComponentDishPair,
  type DemandRow,
  type Role,
} from "./headcount-demand-reconciliation.runtime.helpers";
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

type DemandSnapshotRow = {
  _id: string;
  ingredientId: string;
  requiredQuantity: number;
};

function demandSnapshot(rows: DemandRow[]): DemandSnapshotRow[] {
  return rows.map(({ _id, ingredientId, requiredQuantity }) => ({
    _id,
    ingredientId,
    requiredQuantity,
  }));
}

function headcountReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
  domain: "menu" | "demand",
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
  ingredientAId: string;
  ingredientBId: string;
}> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const runEvent = runner(proof, roles.events);
  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  const a = await seedComponentDishPair(proof, tenantId, eventId, "Override");
  const b = await seedComponentDishPair(proof, tenantId, eventId, "Follow");
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
    ingredientAId: a.ingredientId,
    ingredientBId: b.ingredientId,
  };
}

describe("runtime proof: single demand reconciliation per headcount change (AC-390 slice)", () => {
  it("one headcount change reconciles following demand once with a demand receipt", async () => {
    const tenantId = "tenant-ac390-demand-once";
    const s = await seedOverrideAndChange(tenantId, "AC-390 demand once");

    const demands = await listedDemands(s.events, s.eventId);
    expect(demands).toHaveLength(2);
    const a = await demandFor(s.events, s.eventId, s.ingredientAId);
    expect(a.requiredQuantity).toBe(25);
    const b = await demandFor(s.events, s.eventId, s.ingredientBId);
    expect(b.requiredQuantity).toBe(60);

    const receipts = await readReconciliationReceipts(s.events, tenantId);
    const demand = headcountReceipts(receipts, s.eventId, "demand");
    expect(demand).toHaveLength(1);
    const receipt = demand[0]!;
    expect(receipt.triggerType).toBe("EventHeadcountChanged");
    expect(receipt.affectedDomains).toEqual(["demand"]);
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

  it("replaying the same headcount against unchanged demand input is a no-op", async () => {
    const tenantId = "tenant-ac390-demand-replay";
    const s = await seedOverrideAndChange(tenantId, "AC-390 demand replay");

    const demandsBefore = await listedDemands(s.events, s.eventId);
    const snapshotBefore = demandSnapshot(demandsBefore);
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

    const demandsAfter = await listedDemands(s.events, s.eventId);
    expect(demandSnapshot(demandsAfter)).toEqual(snapshotBefore);
    expect(demandsAfter).toHaveLength(2);

    const receiptsAfter = await readReconciliationReceipts(s.events, tenantId);
    expect(checkpointKeys(receiptsAfter, s.eventId)).toEqual(checkpointsBefore);
    expect(headcountReceipts(receiptsAfter, s.eventId, "demand")).toHaveLength(
      1,
    );
  });
});
