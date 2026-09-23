/**
 * Runtime proof (AC-390 style slice): one Event.changeServiceStyle writes
 * the service-style snapshot onto the Event, leaves the issued packet
 * revision untouched (same id, fingerprint, storage ids, stage — the print
 * stays as history), and persists exactly one §8.2 eventReconciliation
 * receipt for the style domain, flagging the current revision stale WITHOUT
 * mutating it. Replaying the same service style against unchanged packet
 * input writes no row diff and no second receipt. Proof only — the
 * reconciler never writes packet revision rows.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  listedRevisions,
  readEventStyle,
  registerServiceStyle,
  revisionFor,
  rolesFor,
  runner,
  seedPacketRevision,
  type EventStyleSnapshot,
  type PacketRevisionRow,
  type Role,
} from "./style-change-reconciliation.runtime.helpers";
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

function styleReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
): ReceiptOutput[] {
  return receipts.filter(
    (row) =>
      row.eventId === eventId &&
      row.triggerType === "EventServiceStyleChanged" &&
      row.affectedDomains.length >= 1 &&
      row.affectedDomains[0] === "style",
  );
}

function checkpointKeys(receipts: ReceiptOutput[], eventId: string): string[] {
  return receipts
    .filter((row) => row.eventId === eventId)
    .map((row) => row.checkpoint.key)
    .sort((a, b) => a.localeCompare(b));
}

/** Seed event + current packet revision + a registered "Limited Service"
 * style, then change the event's service style to it (version 1).
 * Revisions are read through the events role. */
async function seedPacketAndChangeStyle(
  tenantId: string,
  title: string,
): Promise<{
  runEvent: ReturnType<typeof runner>;
  events: Role;
  eventId: string;
  revisionId: string;
  styleId: string;
}> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const runEvent = runner(proof, roles.events);
  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  const { styleId } = await registerServiceStyle(
    proof,
    tenantId,
    "Limited Service",
    `LIMITED_${tenantId}`,
  );
  const revisionId = await seedPacketRevision(roles.events, tenantId, eventId);

  await runEvent(M.Event_changeServiceStyle, {
    docId: eventId,
    version: 1,
    serviceStyleId: styleId,
    serviceStyleName: "Limited Service",
  });
  return { runEvent, events: roles.events, eventId, revisionId, styleId };
}

describe("runtime proof: single style reconciliation per service-style change (AC-390 slice)", () => {
  it("one service-style change preserves the issued packet once with a style receipt", async () => {
    const tenantId = "tenant-ac390-style-once";
    const s = await seedPacketAndChangeStyle(tenantId, "AC-390 style once");

    const style = await readEventStyle(s.events, s.eventId);
    expect(style.serviceStyleId).toBe(s.styleId);
    expect(style.serviceStyleName).toBe("Limited Service");

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
    const receiptsForEvent = styleReceipts(receipts, s.eventId);
    expect(receiptsForEvent).toHaveLength(1);
    const receipt = receiptsForEvent[0]!;
    expect(receipt.triggerType).toBe("EventServiceStyleChanged");
    expect(receipt.affectedDomains).toEqual(["style"]);
    expect(receipt.eventId).toBe(s.eventId);
    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.createdCount).toBe(0);
    expect(receipt.updatedCount).toBe(1);
    expect(receipt.retiredCount).toBe(0);
    expect(receipt.preservedCount).toBe(1);
    expect(receipt.exceptionCount).toBe(0);
    expect(receipt.unresolved).toEqual([
      { code: "packet_stale", recordIds: [s.revisionId] },
    ]);
    expect(receipt.checkpoint.state).toBe("complete");
  });

  it("replaying the same service style against unchanged packet input is a no-op", async () => {
    const tenantId = "tenant-ac390-style-replay";
    const s = await seedPacketAndChangeStyle(tenantId, "AC-390 style replay");

    const revisionBefore = await revisionFor(s.events, s.eventId);
    const snapshotBefore = revisionSnapshot(revisionBefore);
    expect(snapshotBefore.snapshotFingerprint).toBe("seed-packet-40");
    const styleBefore = await readEventStyle(s.events, s.eventId);
    const receiptsBefore = await readReconciliationReceipts(s.events, tenantId);
    const checkpointsBefore = checkpointKeys(receiptsBefore, s.eventId);

    // The SAME service style again — a replay, not a change.
    const version = await readEventVersion(s.events, s.eventId);
    await s.runEvent(M.Event_changeServiceStyle, {
      docId: s.eventId,
      version,
      serviceStyleId: s.styleId,
      serviceStyleName: "Limited Service",
    });

    const revisionAfter = await revisionFor(s.events, s.eventId);
    expect(revisionSnapshot(revisionAfter)).toEqual(snapshotBefore);
    const styleAfter: EventStyleSnapshot = await readEventStyle(
      s.events,
      s.eventId,
    );
    // The style snapshot is unchanged; the Event version itself still moves
    // because every mutate bumps it — that is not a style field.
    expect(styleAfter.serviceStyleId).toEqual(styleBefore.serviceStyleId);
    expect(styleAfter.serviceStyleName).toEqual(styleBefore.serviceStyleName);

    const receiptsAfter = await readReconciliationReceipts(s.events, tenantId);
    expect(checkpointKeys(receiptsAfter, s.eventId)).toEqual(checkpointsBefore);
    expect(styleReceipts(receiptsAfter, s.eventId)).toHaveLength(1);
  });
});
