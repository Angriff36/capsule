/**
 * Runtime proof (AC-390 first slice): one Event.reschedule reconciles timing
 * AND staffing once each, each persisting exactly one §8.2 receipt under the
 * same trigger. Replaying the same schedule against unchanged input writes
 * no staffing rows and no second receipt. Proof only — the schedule /
 * staffing receipt slice; the rest of the §1.5 change matrix stays open.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  liveEvents,
  liveStaffNeeds,
  R1,
  readEventVersion,
  readReconciliationReceipts,
  rolesFor,
  runner,
  seedFollowingStaffEvent,
  type ReceiptOutput,
  type Role,
  type StaffNeedRow,
} from "./single-reconciliation.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

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

/** One receipt per domain for this event under this trigger, plus its
 * checkpoint keys sorted (the replay fingerprint). */
function domainReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
  triggerType: string,
  domain: string,
): ReceiptOutput[] {
  return receipts.filter(
    (row) =>
      row.eventId === eventId &&
      row.triggerType === triggerType &&
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

type StaffSnapshotRow = {
  _id: string;
  startsAt: number | null;
  endsAt: number | null;
  status: string;
};

function staffSnapshot(rows: StaffNeedRow[]): StaffSnapshotRow[] {
  return rows.map(({ _id, startsAt, endsAt, status }) => ({
    _id,
    startsAt,
    endsAt,
    status,
  }));
}

describe("runtime proof: single reconciliation per authoritative change (AC-390 slice)", () => {
  it("one authoritative change reconciles each domain once with a receipt", async () => {
    const proof = harness();
    const tenantId = "tenant-ac390-once";
    const { events, workforce } = rolesFor(proof, tenantId);
    const runEvents = runner(proof, events);
    const { eventId } = await seedFollowingStaffEvent(
      proof,
      tenantId,
      "AC-390 once-only",
    );

    const beforeNeeds = await liveStaffNeeds(workforce, tenantId, eventId);
    expect(beforeNeeds).toHaveLength(2);
    const beforeWindows = beforeNeeds.map((row) => ({
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    }));

    const eventVersion = await readEventVersion(events, eventId);
    await runEvents(M.Event_reschedule, {
      docId: eventId,
      version: eventVersion,
      startsAt: R1.startsAt,
      endsAt: R1.endsAt,
    });

    // Exactly the two seeded needs — the reschedule created no duplicates.
    const afterNeeds = await liveStaffNeeds(workforce, tenantId, eventId);
    expect(afterNeeds).toHaveLength(2);
    for (const row of afterNeeds) {
      expect(typeof row.startsAt).toBe("number");
      expect(typeof row.endsAt).toBe("number");
    }
    // At least one following need moved off its pre-reschedule window.
    expect(
      afterNeeds.some(
        (row, index) =>
          row.startsAt !== beforeWindows[index]!.startsAt ||
          row.endsAt !== beforeWindows[index]!.endsAt,
      ),
    ).toBe(true);

    const receipts = await readReconciliationReceipts(events, tenantId);
    const staffing = domainReceipts(
      receipts,
      eventId,
      "EventScheduleChanged",
      "staffing",
    );
    expect(staffing).toHaveLength(1);
    expect(staffing[0]!.affectedDomains).toEqual(["staffing"]);
    const timing = domainReceipts(
      receipts,
      eventId,
      "EventScheduleChanged",
      "timing",
    );
    expect(timing).toHaveLength(1);
    expect(timing[0]!.affectedDomains).toEqual(["timing"]);
    receiptShape(staffing[0]!);
    receiptShape(timing[0]!);

    const liveEvents_ = await liveEvents(events, tenantId);
    expect(liveEvents_).toHaveLength(1);
  });

  it("replaying the same schedule against unchanged input is a no-op", async () => {
    const proof = harness();
    const tenantId = "tenant-ac390-replay";
    const { events, workforce } = rolesFor(proof, tenantId);
    const runEvents = runner(proof, events);
    const { eventId } = await seedFollowingStaffEvent(
      proof,
      tenantId,
      "AC-390 replay",
    );

    let eventVersion = await readEventVersion(events, eventId);
    await runEvents(M.Event_reschedule, {
      docId: eventId,
      version: eventVersion,
      startsAt: R1.startsAt,
      endsAt: R1.endsAt,
    });

    const needsBefore = await liveStaffNeeds(workforce, tenantId, eventId);
    const snapshotBefore = staffSnapshot(needsBefore);
    expect(snapshotBefore).toHaveLength(2);
    const receiptsBefore = await readReconciliationReceipts(events, tenantId);
    const checkpointsBefore = checkpointKeys(receiptsBefore, eventId);

    // The SAME schedule again — a replay, not a change.
    eventVersion = await readEventVersion(events, eventId);
    await runEvents(M.Event_reschedule, {
      docId: eventId,
      version: eventVersion,
      startsAt: R1.startsAt,
      endsAt: R1.endsAt,
    });

    const needsAfter = await liveStaffNeeds(workforce, tenantId, eventId);
    expect(staffSnapshot(needsAfter)).toEqual(snapshotBefore);

    const receiptsAfter = await readReconciliationReceipts(events, tenantId);
    expect(checkpointKeys(receiptsAfter, eventId)).toEqual(checkpointsBefore);

    const liveEvents_ = await liveEvents(events, tenantId);
    expect(liveEvents_).toHaveLength(1);
  });
});
