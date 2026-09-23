/**
 * Runtime proof (AC-423 §8.2 receipts): each timing reconciliation persists
 * a receipt carrying the trigger, input checkpoint, counts, and unresolved
 * codes. Replaying the same trigger against unchanged input is a
 * byte-identical no-op; changed timing input writes a NEW receipt and
 * re-plans the same blocks.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  configureTiming,
  createPlannedEvent,
  harness,
  liveTimeline,
  readEventVersion,
  readReconciliationReceipts,
  rolesFor,
  type Role,
} from "./reconciliation-receipts.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type TimelineSnapshot = {
  id: string;
  startsAt: number | null;
  endsAt: number | null;
  timingMilestone: string | null;
};

async function snapshot(
  actor: Role,
  eventId: string,
): Promise<TimelineSnapshot[]> {
  return (await liveTimeline(actor, eventId))
    .map(({ id, startsAt, endsAt, timingMilestone }) => ({
      id,
      startsAt,
      endsAt,
      timingMilestone,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

describe("runtime proof: §8.2 reconciliation receipts on Event timing", () => {
  it("reconciler persists §8.2 receipt; replay is byte-identical no-op", async () => {
    const proof = harness();
    const tenantId = "tenant-ac423-timing";
    const { events } = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Timing receipt replay",
    );

    await configureTiming(proof, events, eventId, 1, 180);

    const live = await liveTimeline(events, eventId);
    expect(live.length).toBeGreaterThanOrEqual(1);
    const before = await snapshot(events, eventId);

    const receipts = await readReconciliationReceipts(events, tenantId);
    const receipt = receipts.find((row) => row.eventId === eventId);
    expect(receipt).toBeDefined();
    expect(receipt!.tenantId).toBe(tenantId);
    expect(receipt!.triggerType).toBe("EventTimingConfigured");
    expect(typeof receipt!.triggerEventId).toBe("string");
    expect(receipt!.triggerEventId.length).toBeGreaterThan(0);
    expect(receipt!.affectedDomains).toEqual(["timing"]);
    expect(receipt!.createdCount).toBeGreaterThanOrEqual(1);
    expect(typeof receipt!.updatedCount).toBe("number");
    expect(typeof receipt!.retiredCount).toBe("number");
    expect(typeof receipt!.preservedCount).toBe("number");
    expect(typeof receipt!.exceptionCount).toBe("number");
    expect(Array.isArray(receipt!.unresolved)).toBe(true);
    expect(typeof receipt!.inputVersions.checkpoint).toBe("string");
    expect(receipt!.inputVersions.checkpoint.length).toBeGreaterThan(0);
    expect(Array.isArray(receipt!.inputVersions.windows)).toBe(true);
    for (const window of receipt!.inputVersions.windows) {
      expect(typeof window.key).toBe("string");
    }
    expect(receipt!.checkpoint.state).toBe("complete");
    expect(typeof receipt!.checkpoint.key).toBe("string");
    expect(receipt!.checkpoint.key).toContain(eventId);
    expect(receipt!.checkpoint.key).toContain("timing");

    // Same minutes again → same checkpoint → the reconciler must find the
    // prior receipt and return without touching a single timeline row.
    const version = await readEventVersion(events, eventId);
    await configureTiming(proof, events, eventId, version, 180);

    const after = await snapshot(events, eventId);
    expect(after).toEqual(before);

    const replayReceipts = await readReconciliationReceipts(events, tenantId);
    expect(replayReceipts.some((row) => row.eventId === eventId)).toBe(true);
  });

  it("changed timing input writes a new receipt and updates the plan", async () => {
    const proof = harness();
    const tenantId = "tenant-ac423-timing-change";
    const { events } = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Timing receipt change",
    );

    await configureTiming(proof, events, eventId, 1, 180);

    const first = await liveTimeline(events, eventId);
    const firstIds = first.map((row) => row.id).sort();
    const firstReceipts = await readReconciliationReceipts(events, tenantId);
    const firstCheckpoint =
      firstReceipts.find((row) => row.eventId === eventId)?.inputVersions
        .checkpoint ?? "";
    expect(firstCheckpoint).not.toBe("");

    // Shorter setup moves staff_on / load windows → new checkpoint.
    const version = await readEventVersion(events, eventId);
    await configureTiming(proof, events, eventId, version, 90);

    const changedIds = (await liveTimeline(events, eventId))
      .map((row) => row.id)
      .sort();
    expect(changedIds).toEqual(firstIds);

    const changedReceipts = await readReconciliationReceipts(events, tenantId);
    const newer = changedReceipts.find(
      (row) =>
        row.eventId === eventId &&
        row.inputVersions.checkpoint !== firstCheckpoint,
    );
    expect(newer).toBeDefined();
    expect(newer!.tenantId).toBe(tenantId);
    expect(newer!.triggerType).toBe("EventTimingConfigured");
    expect(newer!.affectedDomains).toEqual(["timing"]);
    expect(newer!.checkpoint.state).toBe("complete");
  });
});
