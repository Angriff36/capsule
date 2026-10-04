/**
 * PL-TIME (AC-126, spec §12.2 / PR09-05): clock-in, clock-out, breaks and
 * manager corrections keep who did it, the real times, the time zone and the
 * reason. Elapsed time across an overnight daylight-saving change is the real
 * number of minutes, and a retried clock-in never makes a second open entry.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  createPlannedEvent,
  harness,
  rolesFor,
  runner,
  S,
  type Proof,
} from "./headcount-staffing-reconciliation.runtime.helpers";
import { paidMinutes } from "../../src/features/workforce/timePay";

const M = api.mutations;
const TENANT = "tenant-time-correction-audit";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

async function setup(proof: Proof) {
  const { workforce } = rolesFor(proof, TENANT);
  const bootstrap = runner(proof, workforce);
  // The manager is a Person linked to the workforce sign-in, as in the app.
  const manager = await bootstrap(M.Person_createViaHire, {
    givenName: "Mona",
    familyName: "Manager",
    email: "mona@time.example",
    role: "workforce_manager",
    employmentType: "full_time",
    authSubjectId: `workforce-${TENANT}`,
  });
  const manage = runner(proof, workforce);
  const kit = await manage(M.Person_createViaHire, {
    givenName: "Kit",
    familyName: "Clock",
    email: "kit@time.example",
    role: "event_staff",
    employmentType: "part_time",
    authSubjectId: `${TENANT}-kit`,
  });
  const self = runner(
    proof,
    proof.asRole({
      subject: `${TENANT}-kit`,
      role: "event_staff",
      tenantId: TENANT,
    }),
  );
  const records = async () =>
    (
      (await workforce.run(async (ctx) =>
        ctx.db.query("timeRecords").collect(),
      )) as Doc<"timeRecords">[]
    ).filter((row) => row.personId === kit.docId && row.deletedAt == null);
  const read = async (id: string) =>
    (await workforce.run(async (ctx) =>
      ctx.db.get(id as never),
    )) as Doc<"timeRecords">;
  return {
    workforce,
    manage,
    self,
    kit,
    managerId: manager.docId,
    records,
    read,
  };
}

describe("time capture keeps actor, time zone and reason (AC-126)", () => {
  it("a corrected record keeps actor, previous values and reason, and a replayed clock-in cannot create a second open record across an overnight window", async () => {
    const proof = harness();
    const s = await setup(proof);
    const { eventId } = await createPlannedEvent(proof, TENANT, "Harbor gala");
    await s.manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: s.kit.docId,
      role: "Server",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    const shift = (
      (await s.workforce.run(async (ctx) =>
        ctx.db.query("shifts").collect(),
      )) as Doc<"shifts">[]
    ).find((row) => row.personId === s.kit.docId)!;

    // Kit clocks in on their shift from the phone: time zone and location
    // are kept, and the event comes from the shift.
    const first = await s.self(M.TimeRecord_createViaClockIn, {
      personId: s.kit.docId,
      shiftId: shift._id,
      timeZone: "America/New_York",
      latitude: 40.7128,
      longitude: -74.006,
      accuracyMeters: 12,
      idempotencyKey: "kit-clock-in-1",
    });
    let record = await s.read(first.docId);
    expect(record.eventId).toBe(eventId);
    expect(record.timeZone).toBe("America/New_York");
    expect(record.clockInLatitude).toBe(40.7128);
    expect(record.clockInAccuracyMeters).toBe(12);

    // The same tap replayed returns the same entry.
    const replay = await s.self(M.TimeRecord_createViaClockIn, {
      personId: s.kit.docId,
      shiftId: shift._id,
      idempotencyKey: "kit-clock-in-1",
    });
    expect(replay.docId).toBe(first.docId);

    // Clocked in late in the evening; a fresh retry after midnight (new
    // key, e.g. a second phone) is refused while the entry is open.
    const lateEvening = Date.now() - 45 * 60_000;
    await s.workforce.run(async (ctx) =>
      ctx.db.patch(first.docId as never, { clockInAt: lateEvening } as never),
    );
    await expect(
      s.self(M.TimeRecord_createViaClockIn, {
        personId: s.kit.docId,
        idempotencyKey: "kit-clock-in-after-midnight",
      }),
    ).rejects.toThrow(/Kit Clock is already clocked in/);
    expect(
      (await s.records()).filter((row) => row.status === "open"),
    ).toHaveLength(1);

    // Clock out with a 30 minute unpaid lunch and a 15 minute paid break.
    record = await s.read(first.docId);
    await s.self(M.TimeRecord_clockOut, {
      docId: first.docId,
      version: record.version,
      breakMinutes: 30,
      paidBreakMinutes: 15,
      latitude: 40.758,
      longitude: -73.9855,
      accuracyMeters: 20,
    });
    record = await s.read(first.docId);
    expect(record.status).toBe("closed");
    expect(record.paidBreakMinutes).toBe(15);
    // The clock-out keeps its own phone location next to the clock-in one.
    expect(record.clockOutLatitude).toBe(40.758);
    expect(record.clockOutLongitude).toBe(-73.9855);
    expect(record.clockOutAccuracyMeters).toBe(20);
    expect(record.clockInLatitude).toBe(40.7128);

    // Kit cannot correct their own time; a manager cannot correct without a
    // reason.
    expect(
      await refused(() =>
        s.self(M.TimeRecord_correct, {
          docId: first.docId,
          version: record.version,
          clockInAt: record.clockInAt!,
          clockOutAt: record.clockOutAt!,
          reason: "My own fix",
        }),
      ),
    ).toBe(true);
    expect(
      await refused(() =>
        s.manage(M.TimeRecord_correct, {
          docId: first.docId,
          version: record.version,
          clockInAt: record.clockInAt!,
          clockOutAt: record.clockOutAt!,
          reason: "  ",
        }),
      ),
    ).toBe(true);

    // The manager approves, then corrects across the night clocks fall back
    // (New York, 1 Nov 2026): 10:00 PM EDT to 6:00 AM EST is 9 real hours.
    await s.manage(M.TimeRecord_approve, {
      docId: first.docId,
      version: record.version,
    });
    record = await s.read(first.docId);
    expect(record.approvedById).toBe(s.managerId);
    const before = { in: record.clockInAt, out: record.clockOutAt };
    const nightIn = Date.UTC(2026, 10, 1, 2, 0); // 22:00 EDT 31 Oct
    const nightOut = Date.UTC(2026, 10, 1, 11, 0); // 06:00 EST 1 Nov
    await s.manage(M.TimeRecord_correct, {
      docId: first.docId,
      version: record.version,
      clockInAt: nightIn,
      clockOutAt: nightOut,
      reason: "Forgot to clock out after the overnight load-out",
      timeZone: "America/New_York",
    });
    record = await s.read(first.docId);
    expect(record.status).toBe("corrected");
    expect(record.correctedById).toBe(s.managerId);
    expect(record.correctionReason).toBe(
      "Forgot to clock out after the overnight load-out",
    );
    expect(record.timeZone).toBe("America/New_York");
    // The correction sends the entry back for approval.
    expect(record.approvedAt).toBeNull();
    expect(record.clockInAt).toBe(nightIn);
    expect(record.clockOutAt).toBe(nightOut);
    // 540 real minutes, less the 30 minute unpaid lunch; paid break stays.
    expect(paidMinutes(record)).toBe(510);

    // The ledger keeps the replaced values, the actor and the reason.
    const ledger = (
      (await s.workforce.run(async (ctx) =>
        ctx.db.query("manifestEvents").collect(),
      )) as Array<{
        type: string;
        entityId: string;
        payload: Record<string, unknown>;
      }>
    ).filter((row) => row.entityId === first.docId);
    const corrected = ledger.find((row) => row.type === "TimeRecordCorrected")!;
    expect(corrected.payload).toMatchObject({
      previousClockInAt: before.in,
      previousClockOutAt: before.out,
      previousBreakMinutes: 30,
      previousPaidBreakMinutes: 15,
      correctedById: s.managerId,
      correctedByUserId: `workforce-${TENANT}`,
      reason: "Forgot to clock out after the overnight load-out",
      clockInAt: nightIn,
      clockOutAt: nightOut,
    });
    expect(corrected.payload.wasApprovedAt).not.toBeNull();

    // Still exactly one entry for Kit.
    expect(await s.records()).toHaveLength(1);
  });
});
