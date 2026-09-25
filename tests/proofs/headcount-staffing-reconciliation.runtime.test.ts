/**
 * Runtime proof (AC-390 staffing slice): one Event.changeHeadcount leaves the
 * live eventStaffNeeds untouched (staffing does not scale with guest count)
 * and persists exactly one §8.2 eventReconciliation receipt for the staffing
 * domain. Replaying the same headcount writes no staff-need diff and no
 * second staffing receipt — and the prior menu receipt still exists exactly
 * once. Proof only — not the whole §1.5 change matrix.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  listedStaffNeeds,
  needFor,
  rolesFor,
  runner,
  seedStaffNeed,
  type StaffNeedRow,
  type Role,
} from "./headcount-staffing-reconciliation.runtime.helpers";
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

// The deliberate captain override: 2pm–6pm on the original event day.
const OVERRIDE = {
  startsAt: Date.UTC(2026, 9, 18, 14, 0),
  endsAt: Date.UTC(2026, 9, 18, 18, 0),
} as const;

type NeedSnapshotRow = {
  _id: string;
  role: string;
  startsAt: number | null;
  endsAt: number | null;
  followsEventTiming: boolean | null;
  status: string;
};

function needSnapshot(rows: StaffNeedRow[]): NeedSnapshotRow[] {
  return rows.map(
    ({ _id, role, startsAt, endsAt, followsEventTiming, status }) => ({
      _id,
      role,
      startsAt,
      endsAt,
      followsEventTiming,
      status,
    }),
  );
}

function headcountReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
  domain: "menu" | "staffing",
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

/** Seed (no configureTiming) + override captain to 2pm–6pm + change headcount
 * 40 → 60 (version 1). Needs are identified by role, never array index. */
async function seedOverrideAndChange(
  tenantId: string,
  title: string,
): Promise<{
  runEvent: ReturnType<typeof runner>;
  events: Role;
  eventId: string;
}> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const runEvent = runner(proof, roles.events);
  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  await seedStaffNeed(proof, tenantId, eventId, "captain");
  await seedStaffNeed(proof, tenantId, eventId, "server");

  const captain = await needFor(roles.workforce, eventId, "captain");
  await runner(proof, roles.workforce)(M.EventStaffNeed_planTiming, {
    docId: captain._id,
    version: captain.version,
    startsAt: OVERRIDE.startsAt,
    endsAt: OVERRIDE.endsAt,
    followsEventTiming: false,
  });

  await runEvent(M.Event_changeHeadcount, {
    docId: eventId,
    version: 1,
    newHeadcount: 60,
  });
  return { runEvent, events: roles.events, eventId };
}

describe("runtime proof: single staffing reconciliation per headcount change (AC-390 slice)", () => {
  it("one headcount change preserves staff needs once with a staffing receipt", async () => {
    const tenantId = "tenant-ac390-staff-once";
    const s = await seedOverrideAndChange(tenantId, "AC-390 staffing once");

    const needs = await listedStaffNeeds(s.events, s.eventId);
    expect(needs).toHaveLength(2);
    const captain = await needFor(s.events, s.eventId, "captain");
    expect(captain.startsAt).toBe(OVERRIDE.startsAt);
    expect(captain.endsAt).toBe(OVERRIDE.endsAt);
    expect(captain.followsEventTiming).toBe(false);
    expect(captain.status).toBe("open");
    const server = await needFor(s.events, s.eventId, "server");
    expect(server.role).toBe("server");
    expect(server.status).toBe("open");

    const receipts = await readReconciliationReceipts(s.events, tenantId);
    const staffing = headcountReceipts(receipts, s.eventId, "staffing");
    expect(staffing).toHaveLength(1);
    const receipt = staffing[0]!;
    expect(receipt.triggerType).toBe("EventHeadcountChanged");
    expect(receipt.affectedDomains).toEqual(["staffing"]);
    expect(receipt.eventId).toBe(s.eventId);
    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.createdCount).toBe(0);
    expect(receipt.updatedCount).toBe(0);
    expect(receipt.retiredCount).toBe(0);
    expect(receipt.preservedCount).toBe(2);
    expect(receipt.exceptionCount).toBe(0);
    expect(receipt.unresolved).toEqual([]);
    expect(receipt.checkpoint.state).toBe("complete");

    // The prior menu slice keeps proving: exactly one menu receipt too.
    expect(headcountReceipts(receipts, s.eventId, "menu")).toHaveLength(1);
  });

  it("replaying the same headcount against unchanged staffing input is a no-op", async () => {
    const tenantId = "tenant-ac390-staff-replay";
    const s = await seedOverrideAndChange(tenantId, "AC-390 staffing replay");

    const needsBefore = await listedStaffNeeds(s.events, s.eventId);
    const snapshotBefore = needSnapshot(needsBefore);
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

    const needsAfter = await listedStaffNeeds(s.events, s.eventId);
    expect(needSnapshot(needsAfter)).toEqual(snapshotBefore);

    const receiptsAfter = await readReconciliationReceipts(s.events, tenantId);
    expect(checkpointKeys(receiptsAfter, s.eventId)).toEqual(checkpointsBefore);
    expect(
      headcountReceipts(receiptsAfter, s.eventId, "staffing"),
    ).toHaveLength(1);
  });
});
