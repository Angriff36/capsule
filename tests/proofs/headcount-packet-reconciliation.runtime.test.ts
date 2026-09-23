/**
 * Runtime proof (AC-390 packet slice): one Event.changeHeadcount leaves the
 * issued packet revision untouched (same id, fingerprint, storage ids,
 * stage — the print stays as history) and persists exactly one §8.2
 * eventReconciliation receipt for the packet domain, flagging the current
 * revision as stale for the new count. Replaying the same headcount writes
 * no revision-row diff and no second packet receipt — and the prior menu
 * receipt still exists exactly once. Proof only — the reconciler never
 * writes revision rows (§14.1).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  listedRevisions,
  rolesFor,
  revisionFor,
  runner,
  seedPacketRevision,
  type PacketRevisionRow,
  type Role,
} from "./headcount-packet-reconciliation.runtime.helpers";
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

type RevisionSnapshot = Pick<
  PacketRevisionRow,
  | "_id"
  | "snapshotFingerprint"
  | "pdfStorageId"
  | "snapshotStorageId"
  | "stage"
  | "supersededBy"
>;

function revisionSnapshot(row: PacketRevisionRow): RevisionSnapshot {
  return {
    _id: row._id,
    snapshotFingerprint: row.snapshotFingerprint,
    pdfStorageId: row.pdfStorageId,
    snapshotStorageId: row.snapshotStorageId,
    stage: row.stage,
    supersededBy: row.supersededBy,
  };
}

function headcountReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
  domain: "menu" | "packet",
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

/** Seed event + current packet revision, then change headcount 40 → 60
 * (version 1). Revisions are read through the events role. */
async function seedAndChange(
  tenantId: string,
  title: string,
): Promise<{
  runEvent: ReturnType<typeof runner>;
  events: Role;
  eventId: string;
  revisionId: string;
}> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const runEvent = runner(proof, roles.events);
  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  const revisionId = await seedPacketRevision(roles.events, tenantId, eventId);

  await runEvent(M.Event_changeHeadcount, {
    docId: eventId,
    version: 1,
    newHeadcount: 60,
  });
  return { runEvent, events: roles.events, eventId, revisionId };
}

describe("runtime proof: single packet reconciliation per headcount change (AC-390 slice)", () => {
  it("one headcount change preserves the issued packet revision once with a packet receipt", async () => {
    const tenantId = "tenant-ac390-packet-once";
    const s = await seedAndChange(tenantId, "AC-390 packet once");

    const revisions = await listedRevisions(s.events, s.eventId);
    expect(revisions).toHaveLength(1);
    const revision = revisions[0]!;
    expect(revision._id).toBe(s.revisionId);
    expect(revision.snapshotFingerprint).toBe("seed-packet-40");
    expect(revision.stage).toBe("review");
    expect(revision.pdfStorageId).toBe("seed-pdf");
    expect(revision.snapshotStorageId).toBe("seed-snapshot");
    expect(revision.supersededBy == null).toBe(true);

    const receipts = await readReconciliationReceipts(s.events, tenantId);
    const packetReceipts = headcountReceipts(receipts, s.eventId, "packet");
    expect(packetReceipts).toHaveLength(1);
    const receipt = packetReceipts[0]!;
    expect(receipt.triggerType).toBe("EventHeadcountChanged");
    expect(receipt.affectedDomains).toEqual(["packet"]);
    expect(receipt.eventId).toBe(s.eventId);
    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.createdCount).toBe(0);
    expect(receipt.updatedCount).toBe(0);
    expect(receipt.retiredCount).toBe(0);
    expect(receipt.preservedCount).toBe(1);
    expect(receipt.exceptionCount).toBe(0);
    expect(receipt.unresolved).toEqual([
      { code: "packet_stale", recordIds: [s.revisionId] },
    ]);
    expect(receipt.checkpoint.state).toBe("complete");

    // The prior menu slice keeps proving: exactly one menu receipt too.
    expect(headcountReceipts(receipts, s.eventId, "menu")).toHaveLength(1);
  });

  it("replaying the same headcount against unchanged packet input is a no-op", async () => {
    const tenantId = "tenant-ac390-packet-replay";
    const s = await seedAndChange(tenantId, "AC-390 packet replay");

    const revisionBefore = await revisionFor(s.events, s.eventId);
    const snapshotBefore = revisionSnapshot(revisionBefore);
    expect(snapshotBefore.snapshotFingerprint).toBe("seed-packet-40");
    const receiptsBefore = await readReconciliationReceipts(s.events, tenantId);
    const checkpointsBefore = checkpointKeys(receiptsBefore, s.eventId);

    // The SAME headcount again — a replay, not a change.
    const version = await readEventVersion(s.events, s.eventId);
    await s.runEvent(M.Event_changeHeadcount, {
      docId: s.eventId,
      version,
      newHeadcount: 60,
    });

    const revisionAfter = await revisionFor(s.events, s.eventId);
    expect(revisionSnapshot(revisionAfter)).toEqual(snapshotBefore);

    const receiptsAfter = await readReconciliationReceipts(s.events, tenantId);
    expect(checkpointKeys(receiptsAfter, s.eventId)).toEqual(checkpointsBefore);
    expect(headcountReceipts(receiptsAfter, s.eventId, "packet")).toHaveLength(
      1,
    );
  });
});
