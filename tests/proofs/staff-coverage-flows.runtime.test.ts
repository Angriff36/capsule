/**
 * PL-STAFF-SELF-SERVICE coverage model (spec §12.2): one event crew through
 * generated commands only.
 * - AC-494/496: filling a need or assigning a person makes exactly one future
 *   Shift that keeps the source ids; a need revision moves that same Shift.
 * - AC-497/498: an event reschedule moves only work that still follows the
 *   event; a hand-moved shift and started work keep their windows.
 * - AC-499: a replacement keeps the old request row, the work already started
 *   and links the new request to the old one.
 * - AC-500: a hand-made shift is refused for approved time off, a double
 *   booking of the same person, or a missing required training - nothing is
 *   written.
 * - AC-501: an approved swap moves shift, assignment and need together, keeps
 *   the swap record, and a replayed approval changes nothing.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  harness,
  R1,
  rolesFor,
  runner,
  S,
  type Proof,
} from "./staffing-window-override-survival.runtime.helpers";

const M = api.mutations;
const HOUR = 3_600_000;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

function crew(proof: Proof, tenantId: string) {
  const roles = rolesFor(proof, tenantId);
  const manage = runner(proof, roles.workforce);
  const read = <T>(id: string) =>
    roles.workforce.run(async (ctx) => ctx.db.get(id as never)) as Promise<T>;
  const all = <T>(table: string) =>
    roles.workforce.run(async (ctx) =>
      ctx.db.query(table as never).collect(),
    ) as Promise<T[]>;
  const liveShifts = async (personId: string) =>
    (await all<Doc<"shifts">>("shifts")).filter(
      (row) => row.personId === personId && row.status !== "cancelled",
    );
  async function hire(name: string) {
    const subject = `${tenantId}-${name.toLowerCase()}`;
    const created = await manage(M.Person_createViaHire, {
      givenName: name,
      familyName: "Crew",
      email: `${name.toLowerCase()}@coverage.example`,
      role: "event_staff",
      employmentType: "part_time",
      authSubjectId: subject,
    });
    const self = proof.asRole({ subject, role: "event_staff", tenantId });
    return { personId: created.docId, self, run: runner(proof, self) };
  }
  async function timedEvent(title: string) {
    const runSales = runner(proof, roles.sales);
    const client = await runSales(M.Client_createViaRegister, {
      clientType: "company",
      companyName: `${title} client`,
    });
    const event = await runSales(M.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Crewsheet",
      budgetAmount: 3000,
      quotedPrice: 4500,
    });
    await runner(proof, roles.events)(M.Event_configureTiming, {
      docId: event.docId,
      version: 1,
      serviceStartsAt: S.startsAt,
      setupMinutes: 180,
      loadMinutes: 60,
      outboundTravelMinutes: 45,
      cleanupMinutes: 60,
      returnTravelMinutes: 40,
      unloadMinutes: 30,
    });
    return event.docId;
  }
  return { roles, manage, read, all, liveShifts, hire, timedEvent };
}

describe("staff coverage model (AC-494, 496, 497, 498)", () => {
  it("fill and assign make one linked shift; reschedule moves only work that follows the event", async () => {
    const proof = harness();
    const c = crew(proof, "tenant-coverage-follow");
    const eventId = await c.timedEvent("Harbor dinner");

    // Fill a need: exactly one future shift, linked to the need.
    const need = await c.manage(M.EventStaffNeed_createViaPostOpen, {
      eventId,
      role: "Server",
    });
    const ann = await c.hire("Ann");
    await c.manage(M.EventStaffNeed_fill, {
      docId: need.docId,
      version: (await c.read<Doc<"eventStaffNeeds">>(need.docId)).version,
      personId: ann.personId,
    });
    const [annShift, ...extra] = await c.liveShifts(ann.personId);
    expect(extra).toHaveLength(0);
    expect(annShift).toMatchObject({
      eventId,
      role: "Server",
      status: "scheduled",
      eventStaffingSourceIds: [need.docId],
      eventStaffingPersonId: ann.personId,
    });
    expect(annShift!.startsAt).toEqual(expect.any(Number));
    expect(annShift!.startsAt! > Date.now()).toBe(true);

    // Revising the need moves the SAME shift and keeps its source id.
    const revised = {
      startsAt: S.startsAt - 2 * HOUR,
      endsAt: S.endsAt + HOUR,
    };
    await c.manage(M.EventStaffNeed_planTiming, {
      docId: need.docId,
      version: (await c.read<Doc<"eventStaffNeeds">>(need.docId)).version,
      ...revised,
      followsEventTiming: false,
    });
    const [annAfter, ...annExtra] = await c.liveShifts(ann.personId);
    expect(annExtra).toHaveLength(0);
    expect(annAfter).toMatchObject({
      _id: annShift!._id,
      ...revised,
      eventStaffingSourceIds: [need.docId],
    });

    // Assign three more: one follows the event, one is moved by hand, one
    // has started work.
    const ben = await c.hire("Ben");
    const cal = await c.hire("Cal");
    const dee = await c.hire("Dee");
    for (const person of [ben, cal, dee]) {
      await c.manage(M.EventAssignment_createViaAssign, {
        eventId,
        personId: person.personId,
        role: "Runner",
      });
    }
    const [benBefore] = await c.liveShifts(ben.personId);
    const [calShift] = await c.liveShifts(cal.personId);
    const handMoved = {
      startsAt: S.startsAt - 4 * HOUR,
      endsAt: S.startsAt - HOUR,
    };
    await c.manage(M.Shift_reschedule, {
      docId: calShift!._id,
      version: (await c.read<Doc<"shifts">>(calShift!._id)).version,
      ...handMoved,
    });
    const [deeShift] = await c.liveShifts(dee.personId);
    await dee.run(M.Shift_start, {
      docId: deeShift!._id,
      version: (await c.read<Doc<"shifts">>(deeShift!._id)).version,
    });
    const deeStarted = await c.read<Doc<"shifts">>(deeShift!._id);

    const event = await c.read<Doc<"events">>(eventId);
    await runner(proof, c.roles.events)(M.Event_reschedule, {
      docId: eventId,
      version: event.version,
      startsAt: R1.startsAt,
      endsAt: R1.endsAt,
    });

    const [benAfter, ...benExtra] = await c.liveShifts(ben.personId);
    expect(benExtra).toHaveLength(0);
    expect(benAfter!._id).toBe(benBefore!._id);
    // It moved to the new day with the crew (background timing follow-up can
    // shift the crew window by minutes, so compare to Ben's own assignment).
    expect(benAfter!.startsAt! - benBefore!.startsAt!).toBeGreaterThan(
      20 * HOUR,
    );
    const benWork = (
      await c.all<Doc<"eventAssignments">>("eventAssignments")
    ).find((row) => row.personId === ben.personId)!;
    expect(benAfter).toMatchObject({
      startsAt: benWork.startsAt,
      endsAt: benWork.endsAt,
    });
    const [calAfter, ...calExtra] = await c.liveShifts(cal.personId);
    expect(calExtra).toHaveLength(0);
    expect(calAfter).toMatchObject({ _id: calShift!._id, ...handMoved });
    const deeAfter = await c.read<Doc<"shifts">>(deeShift!._id);
    expect(deeAfter).toMatchObject({
      status: "started",
      startsAt: deeStarted.startsAt,
      endsAt: deeStarted.endsAt,
    });
    // The need that stopped following keeps its own window.
    const [annFinal] = await c.liveShifts(ann.personId);
    expect(annFinal).toMatchObject({ _id: annShift!._id, ...revised });
  });
});

describe("replacement keeps history (AC-499)", () => {
  it("replacing a worker keeps the old request, the started work and links the new request", async () => {
    const proof = harness();
    const c = crew(proof, "tenant-coverage-replace");
    const eventId = await c.timedEvent("Orchard wedding");
    const need = await c.manage(M.EventStaffNeed_createViaPostOpen, {
      eventId,
      role: "Bartender",
      description: "Full bar, two stations",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    const eve = await c.hire("Eve");
    const fay = await c.hire("Fay");
    await c.manage(M.EventStaffNeed_fill, {
      docId: need.docId,
      version: (await c.read<Doc<"eventStaffNeeds">>(need.docId)).version,
      personId: eve.personId,
    });
    const [eveShift] = await c.liveShifts(eve.personId);
    await eve.run(M.Shift_start, {
      docId: eveShift!._id,
      version: (await c.read<Doc<"shifts">>(eveShift!._id)).version,
    });

    await c.manage(M.EventStaffNeed_changeCoverage, {
      docId: need.docId,
      version: (await c.read<Doc<"eventStaffNeeds">>(need.docId)).version,
      personId: fay.personId,
    });

    const old = await c.read<Doc<"eventStaffNeeds">>(need.docId);
    expect(old).toMatchObject({
      status: "cancelled",
      role: "Bartender",
      description: "Full bar, two stations",
      filledByPersonId: eve.personId,
      coverageReplacementPersonId: fay.personId,
      cancellationReason: "Staff member replaced",
      coverageContinuedAt: expect.any(Number),
    });
    const successors = (
      await c.all<Doc<"eventStaffNeeds">>("eventStaffNeeds")
    ).filter((row) => row.previousStaffNeedId === need.docId);
    expect(successors).toHaveLength(1);
    expect(successors[0]).toMatchObject({
      status: "filled",
      role: "Bartender",
      description: "Full bar, two stations",
      filledByPersonId: fay.personId,
    });
    // Eve's started work stays hers.
    expect(await c.read<Doc<"shifts">>(eveShift!._id)).toMatchObject({
      personId: eve.personId,
      status: "started",
    });
    const fayShifts = await c.liveShifts(fay.personId);
    expect(fayShifts).toHaveLength(1);
    expect(fayShifts[0]!.eventStaffingSourceIds).toEqual([successors[0]!._id]);
  });
});

describe("scheduling checks in one step (AC-500)", () => {
  it("refuses time off, a double booking and missing training, writing nothing", async () => {
    const proof = harness();
    const c = crew(proof, "tenant-coverage-checks");
    const gus = await c.hire("Gus");
    const window = { startsAt: S.startsAt, endsAt: S.endsAt };

    const away = await c.manage(M.TimeOffRequest_createViaSubmit, {
      personId: gus.personId,
      startsAt: S.startsAt - HOUR,
      endsAt: S.startsAt + HOUR,
      reason: "Appointment",
    });
    await c.manage(M.TimeOffRequest_approve, { docId: away.docId, version: 1 });
    await expect(
      c.manage(M.Shift_createViaSchedule, {
        personId: gus.personId,
        ...window,
      }),
    ).rejects.toThrow(/approved time off/);
    expect(await c.liveShifts(gus.personId)).toHaveLength(0);

    const later = { startsAt: S.endsAt + HOUR, endsAt: S.endsAt + 5 * HOUR };
    await c.manage(M.Shift_createViaSchedule, {
      personId: gus.personId,
      ...later,
    });
    await expect(
      c.manage(M.Shift_createViaSchedule, {
        personId: gus.personId,
        startsAt: later.startsAt + HOUR,
        endsAt: later.endsAt + HOUR,
      }),
    ).rejects.toThrow(/already has a shift/);
    expect(await c.liveShifts(gus.personId)).toHaveLength(1);

    const module = await c.manage(M.TrainingModule_createViaDefine, {
      name: "Knife safety",
      category: "food_safety",
      passingScore: 80,
    });
    const type = await c.manage(M.ShiftType_createViaDefine, {
      name: "Carving station",
      requiredTrainingModuleId: module.docId,
    });
    await expect(
      c.manage(M.Shift_createViaSchedule, {
        personId: gus.personId,
        startsAt: later.endsAt + 24 * HOUR,
        endsAt: later.endsAt + 28 * HOUR,
        shiftTypeId: type.docId,
      }),
    ).rejects.toThrow(/proof of training/);
    expect(await c.liveShifts(gus.personId)).toHaveLength(1);
  });
});

describe("approved swap moves everything together (AC-501)", () => {
  it("moves the shift, assignment and need to the new person once and keeps the swap record", async () => {
    const proof = harness();
    const c = crew(proof, "tenant-coverage-swap");
    const eventId = await c.timedEvent("River gala");
    const gil = await c.hire("Gil");
    const hal = await c.hire("Hal");
    const ivy = await c.hire("Ivy");
    const jo = await c.hire("Jo");

    const assignment = await c.manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: gil.personId,
      role: "Captain",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    const need = await c.manage(M.EventStaffNeed_createViaPostOpen, {
      eventId,
      role: "Bar back",
      startsAt: S.startsAt + HOUR,
      endsAt: S.endsAt,
    });
    await c.manage(M.EventStaffNeed_fill, {
      docId: need.docId,
      version: (await c.read<Doc<"eventStaffNeeds">>(need.docId)).version,
      personId: ivy.personId,
    });

    async function swap(
      from: Awaited<ReturnType<typeof c.hire>>,
      to: Awaited<ReturnType<typeof c.hire>>,
    ) {
      const [shift] = await c.liveShifts(from.personId);
      const request = await from.run(M.ShiftSwapRequest_createViaPropose, {
        shiftId: shift!._id,
        requesterPersonId: from.personId,
        recipientPersonId: to.personId,
        reason: "Family dinner",
      });
      await to.run(M.ShiftSwapRequest_accept, {
        docId: request.docId,
        version: 1,
      });
      await c.manage(M.ShiftSwapRequest_approve, {
        docId: request.docId,
        version: 2,
      });
      return { shiftId: shift!._id, requestId: request.docId };
    }

    const captain = await swap(gil, hal);
    expect(await c.read<Doc<"shifts">>(captain.shiftId)).toMatchObject({
      personId: hal.personId,
      status: "scheduled",
    });
    expect(
      await c.read<Doc<"eventAssignments">>(assignment.docId),
    ).toMatchObject({ personId: hal.personId, status: "confirmed" });
    const request = await c.read<Doc<"shiftSwapRequests">>(captain.requestId);
    expect(request).toMatchObject({
      status: "approved",
      requesterPersonId: gil.personId,
      recipientPersonId: hal.personId,
      requesterConfirmedAt: expect.any(Number),
      recipientConfirmedAt: expect.any(Number),
      managerApprovedAt: expect.any(Number),
    });
    expect(await c.liveShifts(gil.personId)).toHaveLength(0);

    // Replaying the approval changes nothing.
    await expect(
      c.manage(M.ShiftSwapRequest_approve, {
        docId: captain.requestId,
        version: request.version,
      }),
    ).rejects.toThrow();
    expect(await c.liveShifts(hal.personId)).toHaveLength(1);
    expect(
      await c.read<Doc<"eventAssignments">>(assignment.docId),
    ).toMatchObject({ personId: hal.personId });

    const bar = await swap(ivy, jo);
    expect(await c.read<Doc<"shifts">>(bar.shiftId)).toMatchObject({
      personId: jo.personId,
    });
    expect(await c.read<Doc<"eventStaffNeeds">>(need.docId)).toMatchObject({
      status: "filled",
      filledByPersonId: jo.personId,
    });
  });
});
