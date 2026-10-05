/**
 * AC-324 (CF-9.1 commands): one event crew through generated commands only -
 * post a staffing need, fill it, assign, publish the week, the worker
 * acknowledges and confirms, checks in and out; another worker declines with
 * a reason; a third is unassigned. Declined and unassigned work frees its
 * shift; checked-out work keeps its record.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  rolesFor,
  runner,
  S,
  type Proof,
} from "./headcount-staffing-reconciliation.runtime.helpers";

const M = api.mutations;
const TENANT = "tenant-staffing-lifecycle";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

async function hire(proof: Proof, name: string) {
  const { workforce } = rolesFor(proof, TENANT);
  const created = await runner(proof, workforce)(M.Person_createViaHire, {
    givenName: name,
    familyName: "Crew",
    email: `${name.toLowerCase()}@lifecycle.example`,
    role: "workforce_staff",
    employmentType: "part_time",
    authSubjectId: `crew-${name.toLowerCase()}`,
  });
  const self = proof.asRole({
    subject: `crew-${name.toLowerCase()}`,
    role: "workforce_staff",
    tenantId: TENANT,
  });
  return { personId: created.docId, self };
}

describe("AC-324 event staffing full lifecycle", () => {
  it("draft need, assign, publish schedule, acknowledge, check in/out, decline and unassign through generated commands", async () => {
    const proof = harness();
    const { workforce } = rolesFor(proof, TENANT);
    const manage = runner(proof, workforce);
    const { eventId } = await createPlannedEvent(proof, TENANT, "Harvest gala");
    const read = <T>(id: string) =>
      workforce.run(async (ctx) => ctx.db.get(id as never)) as Promise<T>;
    const shiftsOf = (personId: string) =>
      workforce.run(async (ctx) =>
        (await ctx.db.query("shifts").collect()).filter(
          (row) => row.personId === personId && row.eventId === eventId,
        ),
      );

    // Draft requirement, then fill it.
    const need = await manage(M.EventStaffNeed_createViaPostOpen, {
      eventId,
      role: "Bartender",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    const bar = await hire(proof, "Bo");
    await manage(M.EventStaffNeed_fill, {
      docId: need.docId,
      version: 1,
      personId: bar.personId,
    });
    expect(await read<{ status: string }>(need.docId)).toMatchObject({
      status: "filled",
    });
    expect(await shiftsOf(bar.personId)).toHaveLength(1);

    // Assign, publish the week, acknowledge, confirm, check in and out.
    const cook = await hire(proof, "Ari");
    const assigned = await manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: cook.personId,
      role: "Server",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    const [shift] = await shiftsOf(cook.personId);
    expect(shift).toMatchObject({ status: "scheduled", startsAt: S.startsAt });
    const notice = await manage(
      M.WeeklyScheduleNotice_createViaPublishSchedule,
      {
        personId: cook.personId,
        recipientAuthSubjectId: "crew-ari",
        weekStartsAt: S.startsAt - 86_400_000,
        weekEndsAt: S.startsAt + 6 * 86_400_000,
        shiftCount: 1,
        shiftSummary: "Sat 5 PM Server",
      },
    );
    await proof.executeCommand(cook.self, M.WeeklyScheduleNotice_acknowledge, {
      docId: notice.docId,
    } as never);
    expect(await read<{ acknowledgedAt?: number }>(notice.docId)).toMatchObject(
      { acknowledgedAt: expect.any(Number) },
    );
    const self = runner(proof, cook.self);
    await self(M.EventAssignment_confirm, {
      docId: assigned.docId,
      version: 1,
    });
    await self(M.EventAssignment_checkIn, {
      docId: assigned.docId,
      version: 2,
    });
    await self(M.EventAssignment_checkOut, {
      docId: assigned.docId,
      version: 3,
    });
    expect(await read<Record<string, unknown>>(assigned.docId)).toMatchObject({
      status: "checked_out",
      confirmedAt: expect.any(Number),
      checkedInAt: expect.any(Number),
      checkedOutAt: expect.any(Number),
    });

    // A worker declines with a reason: history kept, shift released.
    const runner2 = await hire(proof, "Cy");
    const offered = await manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: runner2.personId,
      role: "Runner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    expect(
      (await shiftsOf(runner2.personId)).filter(
        (row) => row.status === "scheduled",
      ),
    ).toHaveLength(1);
    await expect(
      runner(proof, runner2.self)(M.EventAssignment_decline, {
        docId: offered.docId,
        version: 1,
        reason: "  ",
      }),
    ).rejects.toThrow(/find cover/);
    await runner(proof, runner2.self)(M.EventAssignment_decline, {
      docId: offered.docId,
      version: 1,
      reason: "Car in the shop",
    });
    expect(await read<Record<string, unknown>>(offered.docId)).toMatchObject({
      status: "unassigned",
      declineReason: "Car in the shop",
      declinedAt: expect.any(Number),
    });
    expect(
      (await shiftsOf(runner2.personId)).filter(
        (row) => row.status === "scheduled",
      ),
    ).toHaveLength(0);

    // A manager unassigns: the shift is released too.
    const extra = await hire(proof, "Dee");
    const spare = await manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: extra.personId,
      role: "Runner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    await manage(M.EventAssignment_unassign, {
      docId: spare.docId,
      version: 1,
    });
    expect(await read<{ status: string }>(spare.docId)).toMatchObject({
      status: "unassigned",
    });
    expect(
      (await shiftsOf(extra.personId)).filter(
        (row) => row.status === "scheduled",
      ),
    ).toHaveLength(0);

    // Someone else cannot decline your work.
    const other = await manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: extra.personId,
      role: "Runner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    await expect(
      runner(proof, runner2.self)(M.EventAssignment_decline, {
        docId: other.docId,
        version: 1,
        reason: "Not me",
      }),
    ).rejects.toThrow();
  });
});
