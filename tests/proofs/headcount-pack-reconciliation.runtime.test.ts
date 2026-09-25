/**
 * Runtime proof (AC-390 pack slice): one Event.changeHeadcount scales the
 * following PackListItems exactly once via the declared
 * syncContainerServings fan-out and persists exactly one §8.2
 * eventReconciliation receipt for the pack domain. Replaying the same
 * headcount writes no pack-item diff and no second pack receipt — and the
 * prior menu receipt still exists exactly once. Proof only — not the whole
 * §1.5 change matrix.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  listedPackItems,
  openPackList,
  rolesFor,
  runner,
  seedContainerDishLine,
  type PackItemRow,
  type Role,
} from "./pack-quantity-override-survival.runtime.helpers";
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

type Seed = {
  runEvent: ReturnType<typeof runner>;
  runLogistics: ReturnType<typeof runner>;
  events: Role;
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
  const runEvent = runner(proof, roles.events);
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
    runEvent,
    runLogistics: runner(proof, roles.logistics),
    events: roles.events,
    eventId,
    lineA: a.lineId,
    lineB: b.lineId,
    packListId,
  };
}

function itemFor(items: PackItemRow[], eventDishId: string): PackItemRow {
  const found = items.find((item) => item.eventDishId === eventDishId);
  if (!found) throw new Error(`No pack item for event dish ${eventDishId}`);
  return found;
}

type FullPackItemRow = PackItemRow & { containerServings: number | null };

type PackSnapshotRow = {
  _id: string;
  requiredQuantity: number;
  followsDishServings: boolean | null;
  containerServings: number | null;
};

function packSnapshot(rows: FullPackItemRow[]): PackSnapshotRow[] {
  return rows.map(
    ({ _id, requiredQuantity, followsDishServings, containerServings }) => ({
      _id,
      requiredQuantity,
      followsDishServings,
      containerServings,
    }),
  );
}

function headcountReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
  domain: "menu" | "pack",
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

/** Seed + override pack line A to 7 + change headcount 40 → 60 (version 1). */
async function seedOverrideAndChange(
  tenantId: string,
  title: string,
): Promise<Seed> {
  const proof = harness();
  const s = await seed(proof, tenantId, title);
  const listed = await listedPackItems(s.events, tenantId, s.packListId);
  expect(listed).toHaveLength(2);
  const packA = itemFor(listed, s.lineA);
  await s.runLogistics(M.PackListItem_adjustQuantity, {
    docId: packA._id,
    requiredQuantity: 7,
  });
  await s.runEvent(M.Event_changeHeadcount, {
    docId: s.eventId,
    version: 1,
    newHeadcount: 60,
  });
  return s;
}

describe("runtime proof: single pack reconciliation per headcount change (AC-390 slice)", () => {
  it("one headcount change reconciles following pack lines once with a pack receipt", async () => {
    const tenantId = "tenant-ac390-pack-once";
    const s = await seedOverrideAndChange(tenantId, "AC-390 pack once");

    const after = await listedPackItems(s.events, tenantId, s.packListId);
    expect(after).toHaveLength(2);
    const a = itemFor(after, s.lineA);
    expect(a.requiredQuantity).toBe(7);
    expect(a.followsDishServings).toBe(false);
    const b = itemFor(after, s.lineB);
    expect(b.requiredQuantity).toBe(6);
    expect(b.followsDishServings).not.toBe(false);

    const receipts = await readReconciliationReceipts(s.events, tenantId);
    const pack = headcountReceipts(receipts, s.eventId, "pack");
    expect(pack).toHaveLength(1);
    const receipt = pack[0]!;
    expect(receipt.triggerType).toBe("EventHeadcountChanged");
    expect(receipt.affectedDomains).toEqual(["pack"]);
    expect(receipt.eventId).toBe(s.eventId);
    expect(receipt.tenantId).toBe(tenantId);
    expect(typeof receipt.triggerEventId).toBe("string");
    expect(receipt.triggerEventId.length).toBeGreaterThan(0);
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

  it("replaying the same headcount against unchanged pack input is a no-op", async () => {
    const tenantId = "tenant-ac390-pack-replay";
    const s = await seedOverrideAndChange(tenantId, "AC-390 pack replay");

    const itemsBefore = await listedPackItems(s.events, tenantId, s.packListId);
    const snapshotBefore = packSnapshot(itemsBefore as FullPackItemRow[]);
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

    const itemsAfter = await listedPackItems(s.events, tenantId, s.packListId);
    expect(packSnapshot(itemsAfter as FullPackItemRow[])).toEqual(
      snapshotBefore,
    );
    expect(itemsAfter).toHaveLength(2);

    const receiptsAfter = await readReconciliationReceipts(s.events, tenantId);
    expect(checkpointKeys(receiptsAfter, s.eventId)).toEqual(checkpointsBefore);
    expect(headcountReceipts(receiptsAfter, s.eventId, "pack")).toHaveLength(1);
  });
});
