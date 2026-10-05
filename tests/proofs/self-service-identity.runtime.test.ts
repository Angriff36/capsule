/**
 * PL-STAFF-SELF-SERVICE self-service and identity (spec §12.1, §12.3):
 * - AC-513: a staff member acts on their own work (confirm, claim, start,
 *   swap) and cannot claim, confirm, start, decline or swap someone else's.
 * - AC-125: a worker reads their own assignment and the event facts it needs
 *   (venue, times, instructions) with no money, and cannot read other
 *   workers' time off (even one entered for a person with no sign-in), time
 *   records, reviews or pay rates. Their acknowledgement of a schedule change
 *   is what the manager sees - a sent notice is not acceptance.
 * - AC-493: one sign-in is one Person; hiring or linking a sign-in another
 *   live profile holds is refused, so identity never forks.
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

const M = api.mutations;
const Q = api.queries;
const TENANT = "tenant-self-service-identity";
const HOUR = 3_600_000;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

function setup(proof: Proof) {
  const { workforce } = rolesFor(proof, TENANT);
  const manage = runner(proof, workforce);
  const read = <T>(id: string) =>
    workforce.run(async (ctx) => ctx.db.get(id as never)) as Promise<T>;
  async function hire(name: string, linked = true) {
    const subject = `${TENANT}-${name.toLowerCase()}`;
    const created = await manage(M.Person_createViaHire, {
      givenName: name,
      familyName: "Self",
      email: `${name.toLowerCase()}@self.example`,
      role: "event_staff",
      employmentType: "part_time",
      ...(linked ? { authSubjectId: subject } : {}),
    });
    const self = proof.asRole({
      subject,
      role: "event_staff",
      tenantId: TENANT,
    });
    return { personId: created.docId, self, run: runner(proof, self) };
  }
  return { workforce, manage, read, hire };
}

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

describe("self-service acts only on your own work (AC-513)", () => {
  it("a staff member cannot claim, confirm, start, decline or swap another person's work; their own succeeds", async () => {
    const proof = harness();
    const s = setup(proof);
    const { eventId } = await createPlannedEvent(proof, TENANT, "Lake lunch");
    const kit = await s.hire("Kit");
    const lou = await s.hire("Lou");

    const kitWork = await s.manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: kit.personId,
      role: "Server",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    const need = await s.manage(M.EventStaffNeed_createViaPostOpen, {
      eventId,
      role: "Runner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    const kitShift = (
      (await s.workforce.run(async (ctx) =>
        ctx.db.query("shifts").collect(),
      )) as Doc<"shifts">[]
    ).find((row) => row.personId === kit.personId)!;

    // Lou acting on Kit's work: every path refused, nothing changes.
    for (const attempt of [
      () =>
        lou.run(M.EventAssignment_confirm, {
          docId: kitWork.docId,
          version: 1,
        }),
      () =>
        lou.run(M.EventAssignment_checkIn, {
          docId: kitWork.docId,
          version: 1,
        }),
      () =>
        lou.run(M.EventAssignment_decline, {
          docId: kitWork.docId,
          version: 1,
          reason: "Not coming",
        }),
      () =>
        lou.run(M.EventStaffNeed_claim, {
          docId: need.docId,
          version: 1,
          personId: kit.personId,
        }),
      () =>
        lou.run(M.EventStaffNeed_fill, {
          docId: need.docId,
          version: 1,
          personId: lou.personId,
        }),
      () =>
        lou.run(M.Shift_start, {
          docId: kitShift._id,
          version: kitShift.version,
        }),
      () =>
        lou.run(M.ShiftSwapRequest_createViaPropose, {
          shiftId: kitShift._id,
          requesterPersonId: kit.personId,
          recipientPersonId: lou.personId,
        }),
    ]) {
      expect(await refused(attempt)).toBe(true);
    }
    expect(await s.read<Doc<"eventAssignments">>(kitWork.docId)).toMatchObject({
      status: "assigned",
      personId: kit.personId,
    });
    expect(await s.read<Doc<"eventStaffNeeds">>(need.docId)).toMatchObject({
      status: "open",
    });

    // Own actions succeed.
    await kit.run(M.EventAssignment_confirm, {
      docId: kitWork.docId,
      version: 1,
    });
    await lou.run(M.EventStaffNeed_claim, {
      docId: need.docId,
      version: 1,
      personId: lou.personId,
    });
    await kit.run(M.Shift_start, {
      docId: kitShift._id,
      version: kitShift.version,
    });
    expect(await s.read<Doc<"eventAssignments">>(kitWork.docId)).toMatchObject({
      status: "confirmed",
    });
    expect(await s.read<Doc<"eventStaffNeeds">>(need.docId)).toMatchObject({
      status: "claimed",
      claimedByPersonId: lou.personId,
    });
    expect(await s.read<Doc<"shifts">>(kitShift._id)).toMatchObject({
      status: "started",
    });
  });
});

describe("worker visibility and acknowledgement (AC-125)", () => {
  it("a worker reads own work and event facts without money or other workers' private records", async () => {
    const proof = harness();
    const s = setup(proof);
    const { eventId } = await createPlannedEvent(
      proof,
      TENANT,
      "Vineyard supper",
    );
    const kit = await s.hire("Kit");
    const lou = await s.hire("Lou");
    const mo = await s.hire("Mo", false);

    await s.manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: kit.personId,
      role: "Captain",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      notes: "Black shirt, bring wine key",
    });
    await s.manage(M.Person_setPayRate, {
      docId: lou.personId,
      version: (await s.read<Doc<"people">>(lou.personId)).version,
      hourlyRate: 31,
    });
    for (const person of [lou, mo]) {
      const request = await s.manage(M.TimeOffRequest_createViaSubmit, {
        personId: person.personId,
        startsAt: S.startsAt + 48 * HOUR,
        endsAt: S.startsAt + 72 * HOUR,
        reason: "Medical appointment",
      });
      await s.manage(M.TimeOffRequest_approve, {
        docId: request.docId,
        version: 1,
      });
    }
    const ownAway = await kit.run(M.TimeOffRequest_createViaSubmit, {
      personId: kit.personId,
      startsAt: S.startsAt + 96 * HOUR,
      endsAt: S.startsAt + 100 * HOUR,
      reason: "Graduation",
    });

    const mine = (await kit.self.query(Q.listEventAssignment, {})) as Array<
      Doc<"eventAssignments">
    >;
    expect(mine.some((row) => row.personId === kit.personId)).toBe(true);

    const briefing = (await kit.self.query(api.eventDayBriefing.getBriefing, {
      eventId,
    })) as { event: Record<string, unknown>; assignments: unknown[] } | null;
    expect(briefing?.event).toMatchObject({
      title: "Vineyard supper",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    const text = JSON.stringify(briefing);
    for (const money of ["quotedPrice", "budgetAmount", "hourlyRate", "total"])
      expect(text).not.toContain(money);

    const timeOff = (await kit.self.query(Q.listTimeOffRequest, {})) as Array<
      Doc<"timeOffRequests">
    >;
    expect(timeOff.map((row) => row._id)).toEqual([ownAway.docId]);
    const loups = (await kit.self.query(Q.getPerson, {
      id: lou.personId,
    })) as Record<string, unknown> | null;
    expect(loups).not.toBeNull();
    expect(loups).not.toHaveProperty("hourlyRate");
    expect(await kit.self.query(Q.listPerformanceReview, {})).toEqual([]);
    expect(await kit.self.query(Q.listPayrollInput, {})).toEqual([]);
    expect(await kit.self.query(Q.listQualification, {})).toEqual([]);
  });

  it("the manager sees a schedule change as acknowledged only after the worker acknowledges it", async () => {
    const proof = harness();
    const s = setup(proof);
    const kit = await s.hire("Kit");
    const notice = await s.manage(
      M.WeeklyScheduleNotice_createViaPublishSchedule,
      {
        personId: kit.personId,
        recipientAuthSubjectId: `${TENANT}-kit`,
        weekStartsAt: S.startsAt - 24 * HOUR,
        weekEndsAt: S.startsAt + 6 * 24 * HOUR,
        shiftCount: 1,
        shiftSummary: "Sat 5 PM Captain at Vineyard",
      },
    );
    await s.manage(M.WeeklyScheduleNotice_republishSchedule, {
      docId: notice.docId,
      version: (await s.read<Doc<"weeklyScheduleNotices">>(notice.docId))
        .version,
      shiftCount: 1,
      shiftSummary: "Sat 3 PM Captain at Vineyard",
    });
    const sent = (await s.workforce.query(
      Q.listWeeklyScheduleNotice,
      {},
    )) as Array<Doc<"weeklyScheduleNotices">>;
    expect(sent[0]).toMatchObject({
      shiftSummary: "Sat 3 PM Captain at Vineyard",
      previousShiftSummary: "Sat 5 PM Captain at Vineyard",
    });
    expect(sent[0]!.acknowledgedAt ?? null).toBeNull();
    await kit.run(M.WeeklyScheduleNotice_acknowledge, {
      docId: notice.docId,
      version: sent[0]!.version,
    });
    const seen = (await s.workforce.query(
      Q.listWeeklyScheduleNotice,
      {},
    )) as Array<Doc<"weeklyScheduleNotices">>;
    expect(seen[0]!.acknowledgedAt).toEqual(expect.any(Number));
  });
});

describe("one sign-in, one person (AC-493)", () => {
  it("refuses to hire or link a sign-in another live profile holds; workforce rows point at the one Person", async () => {
    const proof = harness();
    const s = setup(proof);
    const kit = await s.hire("Kit");
    await expect(
      s.manage(M.Person_createViaHire, {
        givenName: "Kitty",
        familyName: "Copy",
        email: "kitty@self.example",
        role: "event_staff",
        employmentType: "part_time",
        authSubjectId: `${TENANT}-kit`,
      }),
    ).rejects.toThrow(/already belongs to Kit Self/);
    const other = await s.hire("Ned", false);
    await expect(
      s.manage(M.Person_linkAccount, {
        docId: other.personId,
        version: (await s.read<Doc<"people">>(other.personId)).version,
        authSubjectId: `${TENANT}-kit`,
      }),
    ).rejects.toThrow(/already belongs to Kit Self/);
    const people = (await s.workforce.run(async (ctx) =>
      ctx.db.query("people").collect(),
    )) as Doc<"people">[];
    expect(
      people.filter((row) => row.authSubjectId === `${TENANT}-kit`),
    ).toHaveLength(1);

    // Unlink, then relink to the same profile: still one person, same id.
    await s.manage(M.Person_unlinkAccount, {
      docId: kit.personId,
      version: (await s.read<Doc<"people">>(kit.personId)).version,
    });
    await s.manage(M.Person_linkAccount, {
      docId: kit.personId,
      version: (await s.read<Doc<"people">>(kit.personId)).version,
      authSubjectId: `${TENANT}-kit`,
    });
    const { eventId } = await createPlannedEvent(proof, TENANT, "Pier party");
    await s.manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: kit.personId,
      role: "Server",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    const shifts = (await kit.self.query(Q.listShift, {})) as Doc<"shifts">[];
    expect(shifts.filter((row) => row.personId === kit.personId)).toHaveLength(
      1,
    );
  });
});
