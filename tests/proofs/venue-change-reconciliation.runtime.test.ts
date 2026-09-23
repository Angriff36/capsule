/**
 * Runtime proof (AC-390 venue slice): one Event.changeVenue writes the venue
 * snapshot onto the Event, leaves the issued packet revision untouched (same
 * id, fingerprint, storage ids, stage — the print stays as history), and
 * persists exactly one §8.2 eventReconciliation receipt for the venue domain,
 * flagging the current revision stale WITHOUT mutating it. Replaying the same
 * venue against unchanged packet input writes no row diff and no second
 * receipt. Proof only — the reconciler never writes packet revision rows.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  listedRevisions,
  readEventVenue,
  revisionFor,
  rolesFor,
  runner,
  seedPacketRevision,
  type EventVenueSnapshot,
  type PacketRevisionRow,
  type Role,
} from "./venue-change-reconciliation.runtime.helpers";
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

function venueReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
): ReceiptOutput[] {
  return receipts.filter(
    (row) =>
      row.eventId === eventId &&
      row.triggerType === "EventVenueChanged" &&
      row.affectedDomains.length === 1 &&
      row.affectedDomains[0] === "venue",
  );
}

function checkpointKeys(receipts: ReceiptOutput[], eventId: string): string[] {
  return receipts
    .filter((row) => row.eventId === eventId)
    .map((row) => row.checkpoint.key)
    .sort((a, b) => a.localeCompare(b));
}

/** Seed event + current packet revision, then change venue to Lakeside
 * Pavilion (version 1, no Venue row). Revisions are read through the events
 * role. */
async function seedPacketAndChangeVenue(
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

  await runEvent(M.Event_changeVenue, {
    docId: eventId,
    version: 1,
    venueName: "Lakeside Pavilion",
    venueAddress: "12 Water Rd",
    venueCapacity: 120,
  });
  return { runEvent, events: roles.events, eventId, revisionId };
}

describe("runtime proof: single venue reconciliation per venue change (AC-390 slice)", () => {
  it("one venue change preserves the issued packet once with a venue receipt", async () => {
    const tenantId = "tenant-ac390-venue-once";
    const s = await seedPacketAndChangeVenue(tenantId, "AC-390 venue once");

    const venue = await readEventVenue(s.events, s.eventId);
    expect(venue.venueName).toBe("Lakeside Pavilion");
    expect(venue.venueAddress).toBe("12 Water Rd");
    expect(venue.venueCapacity).toBe(120);

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
    const receiptsForEvent = venueReceipts(receipts, s.eventId);
    expect(receiptsForEvent).toHaveLength(1);
    const receipt = receiptsForEvent[0]!;
    expect(receipt.triggerType).toBe("EventVenueChanged");
    expect(receipt.affectedDomains).toEqual(["venue"]);
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

  it("replaying the same venue against unchanged packet input is a no-op", async () => {
    const tenantId = "tenant-ac390-venue-replay";
    const s = await seedPacketAndChangeVenue(tenantId, "AC-390 venue replay");

    const revisionBefore = await revisionFor(s.events, s.eventId);
    const snapshotBefore = revisionSnapshot(revisionBefore);
    expect(snapshotBefore.snapshotFingerprint).toBe("seed-packet-40");
    const venueBefore = await readEventVenue(s.events, s.eventId);
    const receiptsBefore = await readReconciliationReceipts(s.events, tenantId);
    const checkpointsBefore = checkpointKeys(receiptsBefore, s.eventId);

    // The SAME venue again — a replay, not a change.
    const version = await readEventVersion(s.events, s.eventId);
    await s.runEvent(M.Event_changeVenue, {
      docId: s.eventId,
      version,
      venueName: "Lakeside Pavilion",
      venueAddress: "12 Water Rd",
      venueCapacity: 120,
    });

    const revisionAfter = await revisionFor(s.events, s.eventId);
    expect(revisionSnapshot(revisionAfter)).toEqual(snapshotBefore);
    const venueAfter: EventVenueSnapshot = await readEventVenue(
      s.events,
      s.eventId,
    );
    // The venue snapshot is unchanged; the Event version itself still moves
    // because every mutate bumps it — that is not a venue field.
    expect(venueAfter.venueId).toEqual(venueBefore.venueId);
    expect(venueAfter.venueName).toEqual(venueBefore.venueName);
    expect(venueAfter.venueAddress).toEqual(venueBefore.venueAddress);
    expect(venueAfter.venueCapacity).toEqual(venueBefore.venueCapacity);

    const receiptsAfter = await readReconciliationReceipts(s.events, tenantId);
    expect(checkpointKeys(receiptsAfter, s.eventId)).toEqual(checkpointsBefore);
    expect(venueReceipts(receiptsAfter, s.eventId)).toHaveLength(1);
  });
});
