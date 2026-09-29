/**
 * PL-TIME, spec §12.2 / §15.4:
 * - AC-509: a late clock-in raises an alert only the people who run labor
 *   can see, and a no-show is recorded on the shift without blocking payroll
 *   for anyone.
 * - AC-383: approved time (unpaid lunch off, paid breaks kept, split at 40 h
 *   a week) becomes the payroll input and the payroll export row.
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
import { buildPayrollExport } from "../../src/features/finance/payrollExport";

const M = api.mutations;
const TENANT = "tenant-clock-alerts";
const MIN = 60_000;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

async function setup(proof: Proof) {
  const { workforce } = rolesFor(proof, TENANT);
  const manage = runner(proof, workforce);
  await manage(M.Person_createViaHire, {
    givenName: "Mona",
    familyName: "Manager",
    email: "mona@alerts.example",
    role: "workforce_manager",
    employmentType: "full_time",
    authSubjectId: `workforce-${TENANT}`,
  });
  async function hire(name: string) {
    const subject = `${TENANT}-${name.toLowerCase()}`;
    const person = await manage(M.Person_createViaHire, {
      givenName: name,
      familyName: "Crew",
      email: `${name.toLowerCase()}@alerts.example`,
      role: "event_staff",
      employmentType: "part_time",
      authSubjectId: subject,
      employeeNumber: `E-${name}`,
    });
    const role = proof.asRole({
      subject,
      role: "event_staff",
      tenantId: TENANT,
    });
    return { personId: person.docId, role, run: runner(proof, role) };
  }
  const all = async <T>(table: string) =>
    (await workforce.run(async (ctx) =>
      ctx.db.query(table as never).collect(),
    )) as T[];
  const read = async <T>(id: string) =>
    (await workforce.run(async (ctx) => ctx.db.get(id as never))) as T;
  // Payroll inputs belong to finance.
  const finance = proof.asRole({
    subject: `finance-${TENANT}`,
    role: "finance_manager",
    tenantId: TENANT,
  });
  return { workforce, manage, hire, all, read, pay: runner(proof, finance) };
}

async function staffedEvent(
  proof: Proof,
  s: Awaited<ReturnType<typeof setup>>,
) {
  const { eventId } = await createPlannedEvent(proof, TENANT, "Pier supper");
  const kit = await s.hire("Kit");
  const lou = await s.hire("Lou");
  for (const person of [kit, lou])
    await s.manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: person.personId,
      role: "Server",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
  const shifts = await s.all<Doc<"shifts">>("shifts");
  const shiftOf = (personId: string) =>
    shifts.find((row) => row.personId === personId)!;
  return { eventId, kit, lou, shiftOf };
}

/** Kit clocks in on the phone, the clock reads 25 min after the call. */
async function lateClockIn(
  s: Awaited<ReturnType<typeof setup>>,
  kit: { personId: string; run: ReturnType<typeof runner> },
  shiftId: string,
) {
  const created = await kit.run(M.TimeRecord_createViaClockIn, {
    personId: kit.personId,
    shiftId,
    timeZone: "America/New_York",
  });
  await s.workforce.run(async (ctx) =>
    ctx.db.patch(
      created.docId as never,
      { clockInAt: S.startsAt + 25 * MIN } as never,
    ),
  );
  return created.docId;
}

describe("clock alerts (AC-509)", () => {
  it("a late check-in raises a manager-visible alert and a no-show is recorded without blocking payroll", async () => {
    const proof = harness();
    const s = await setup(proof);
    const { kit, lou, shiftOf } = await staffedEvent(proof, s);
    await lateClockIn(s, kit, shiftOf(kit.personId)._id);

    // Half an hour in: Kit is late, Lou is not in yet.
    const early = await s.workforce.query(api.laborSummary.attendanceAlerts, {
      now: S.startsAt + 30 * MIN,
    });
    expect(early?.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "late",
          personName: "Kit Crew",
          amount: 25,
        }),
        expect.objectContaining({
          kind: "not_in",
          personName: "Lou Crew",
          amount: 30,
        }),
      ]),
    );
    // Workers never see the team's alerts.
    expect(
      await kit.role.query(api.laborSummary.attendanceAlerts, {
        now: S.startsAt + 30 * MIN,
      }),
    ).toBeNull();

    // After the shift Lou never came: the manager records the no-show.
    const after = await s.workforce.query(api.laborSummary.attendanceAlerts, {
      now: S.endsAt + 60 * MIN,
    });
    expect(after?.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "no_show",
          personName: "Lou Crew",
          recorded: false,
        }),
      ]),
    );
    const louShift = shiftOf(lou.personId);
    await s.manage(M.Shift_markNoShow, {
      docId: louShift._id,
      version: (await s.read<Doc<"shifts">>(louShift._id)).version,
    });
    expect((await s.read<Doc<"shifts">>(louShift._id)).status).toBe("no_show");
    const recorded = await s.workforce.query(
      api.laborSummary.attendanceAlerts,
      { now: S.endsAt + 61 * MIN },
    );
    expect(recorded?.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "no_show",
          personName: "Lou Crew",
          recorded: true,
        }),
      ]),
    );

    // Payroll still goes ahead for Kit; Lou simply has no time.
    const kitRecord = (await s.all<Doc<"timeRecords">>("timeRecords")).find(
      (row) => row.personId === kit.personId,
    )!;
    await kit.run(M.TimeRecord_clockOut, {
      docId: kitRecord._id,
      version: kitRecord.version,
    });
    const closed = await s.read<Doc<"timeRecords">>(kitRecord._id);
    await s.manage(M.TimeRecord_correct, {
      docId: kitRecord._id,
      version: closed.version,
      clockInAt: S.startsAt + 25 * MIN,
      clockOutAt: S.endsAt,
      reason: "Clock-out read the next morning; left at 10 PM",
    });
    const corrected = await s.read<Doc<"timeRecords">>(kitRecord._id);
    await s.manage(M.TimeRecord_approve, {
      docId: kitRecord._id,
      version: corrected.version,
    });
    const period = {
      periodStart: S.startsAt - 24 * 60 * MIN,
      periodEnd: S.endsAt + 24 * 60 * MIN,
    };
    const kitPay = await s.workforce.query(
      api.laborSummary.personPeriodLaborSummary,
      { personId: kit.personId as never, ...period },
    );
    expect(kitPay?.approvedMinutes).toBe(275);
    const louPay = await s.workforce.query(
      api.laborSummary.personPeriodLaborSummary,
      { personId: lou.personId as never, ...period },
    );
    expect(louPay?.approvedMinutes).toBe(0);
    const input = await s.pay(M.PayrollInput_createViaPrepare, {
      personId: kit.personId,
      ...period,
      regularMinutes: kitPay!.approvedMinutes - kitPay!.approvedOvertimeMinutes,
      overtimeMinutes: kitPay!.approvedOvertimeMinutes,
      totalMinutes: kitPay!.approvedMinutes,
    });
    expect((await s.read<Doc<"payrollInputs">>(input.docId)).status).toBe(
      "prepared",
    );
  });
});

describe("approved time to payroll (AC-383)", () => {
  it("approved timesheet export produces payroll input", async () => {
    const proof = harness();
    const s = await setup(proof);
    const { kit, shiftOf } = await staffedEvent(proof, s);
    const recordId = await lateClockIn(s, kit, shiftOf(kit.personId)._id);
    const open = await s.read<Doc<"timeRecords">>(recordId);
    // 30 min lunch (unpaid) and 20 min of paid breaks.
    await kit.run(M.TimeRecord_clockOut, {
      docId: recordId,
      version: open.version,
      breakMinutes: 30,
      paidBreakMinutes: 20,
    });
    const closed = await s.read<Doc<"timeRecords">>(recordId);
    await s.manage(M.TimeRecord_correct, {
      docId: recordId,
      version: closed.version,
      clockInAt: S.startsAt,
      clockOutAt: S.endsAt,
      reason: "Matched to the call sheet",
    });
    const period = {
      periodStart: S.startsAt - 24 * 60 * MIN,
      periodEnd: S.endsAt + 24 * 60 * MIN,
    };

    // Not approved yet: payroll waits for it.
    const waiting = await s.workforce.query(
      api.laborSummary.personPeriodLaborSummary,
      { personId: kit.personId as never, ...period },
    );
    expect(waiting).toMatchObject({
      approvedMinutes: 0,
      approvedCount: 0,
      waitingApprovalCount: 1,
    });

    const corrected = await s.read<Doc<"timeRecords">>(recordId);
    await s.manage(M.TimeRecord_approve, {
      docId: recordId,
      version: corrected.version,
    });
    const pay = await s.workforce.query(
      api.laborSummary.personPeriodLaborSummary,
      { personId: kit.personId as never, ...period },
    );
    // 5 h shift = 300 min, less 30 min lunch; paid breaks stay.
    expect(pay).toMatchObject({
      approvedMinutes: 270,
      approvedOvertimeMinutes: 0,
      approvedCount: 1,
      waitingApprovalCount: 0,
    });
    const input = await s.pay(M.PayrollInput_createViaPrepare, {
      personId: kit.personId,
      ...period,
      regularMinutes: pay!.approvedMinutes,
      overtimeMinutes: 0,
      totalMinutes: pay!.approvedMinutes,
    });
    const prepared = await s.read<Doc<"payrollInputs">>(input.docId);
    expect(prepared.totalMinutes).toBe(270);

    // The export reads the same approved hours.
    const timeRecords = await s.workforce.query(
      api.laborSummary.payrollTimeRecords,
      {},
    );
    const people = await s.all<Doc<"people">>("people");
    const day = new Date(S.startsAt);
    const ymd = (value: Date) =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    const exported = buildPayrollExport({
      processor: "gusto",
      periodStart: ymd(new Date(S.startsAt - 24 * 60 * MIN)),
      periodEnd: ymd(new Date(day.getTime() + 24 * 60 * MIN)),
      people: people.map((person) => ({
        _id: String(person._id),
        givenName: person.givenName,
        familyName: person.familyName,
        employeeNumber: person.employeeNumber,
      })),
      timeRecords: timeRecords ?? [],
      payrollInputs: [],
    });
    const row = exported.rows.find(
      (entry) => entry.employeeName === "Kit Crew",
    );
    expect(row?.recordedHours).toBe(4.5);
    expect(row?.employeeId).toBe("E-Kit");
  });
});
