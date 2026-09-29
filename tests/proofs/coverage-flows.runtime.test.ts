/**
 * AC-507 (spec §12.2): offer/claim, waiting list, direct assignment,
 * acknowledgement, decline, replacement and swap all run end to end on one
 * event, and afterwards every person has one consistent coverage row: each
 * live shift points at a live assignment or filled need for that same person.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  harness,
  rolesFor,
  runner,
  S,
} from "./staffing-window-override-survival.runtime.helpers";

const M = api.mutations;
const TENANT = "tenant-coverage-flows";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("coverage flows end to end (AC-507)", () => {
  it("claim, waiting list, assign, confirm, decline, replace and swap leave one consistent row per person", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const manage = runner(proof, roles.workforce);
    const read = <T>(id: string) =>
      roles.workforce.run(async (ctx) => ctx.db.get(id as never)) as Promise<T>;
    const all = <T>(table: string) =>
      roles.workforce.run(async (ctx) =>
        ctx.db.query(table as never).collect(),
      ) as Promise<T[]>;
    const version = async (id: string) =>
      (await read<{ version: number }>(id)).version;
    const hire = async (name: string) => {
      const subject = `${TENANT}-${name.toLowerCase()}`;
      const created = await manage(M.Person_createViaHire, {
        givenName: name,
        familyName: "Flow",
        email: `${name.toLowerCase()}@flow.example`,
        role: "event_staff",
        employmentType: "part_time",
        authSubjectId: subject,
      });
      const self = proof.asRole({
        subject,
        role: "event_staff",
        tenantId: TENANT,
      });
      return { personId: created.docId, run: runner(proof, self) };
    };
    const client = await runner(proof, roles.sales)(
      M.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Flow client",
      },
    );
    const event = await runner(proof, roles.sales)(
      M.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Flow gala",
        eventType: "gala",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: 60,
        primaryContactName: "Casey Crewsheet",
        budgetAmount: 3000,
        quotedPrice: 4500,
      },
    );
    const eventId = event.docId;
    const kit = await hire("Kit");
    const lou = await hire("Lou");
    const mo = await hire("Mo");
    const ned = await hire("Ned");

    // Offer / claim, and the waiting list.
    const need = await manage(M.EventStaffNeed_createViaPostOpen, {
      eventId,
      role: "Server",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    await expect(
      lou.run(M.StaffNeedWaitlistEntry_createViaJoin, {
        staffNeedId: need.docId,
        personId: lou.personId,
      }),
    ).rejects.toThrow(/still open/);
    await kit.run(M.EventStaffNeed_claim, {
      docId: need.docId,
      version: await version(need.docId),
      personId: kit.personId,
    });
    const entry = await lou.run(M.StaffNeedWaitlistEntry_createViaJoin, {
      staffNeedId: need.docId,
      personId: lou.personId,
    });
    await expect(
      lou.run(M.StaffNeedWaitlistEntry_createViaJoin, {
        staffNeedId: need.docId,
        personId: lou.personId,
      }),
    ).rejects.toThrow(/already on the waiting list/);
    await expect(
      kit.run(M.StaffNeedWaitlistEntry_createViaJoin, {
        staffNeedId: need.docId,
        personId: kit.personId,
      }),
    ).rejects.toThrow(/already have this shift/);
    await kit.run(M.EventStaffNeed_releaseClaim, {
      docId: need.docId,
      version: await version(need.docId),
    });
    await lou.run(M.EventStaffNeed_claim, {
      docId: need.docId,
      version: await version(need.docId),
      personId: lou.personId,
    });
    expect(
      await read<Doc<"staffNeedWaitlistEntries">>(entry.docId),
    ).toMatchObject({
      status: "placed",
      placedAt: expect.any(Number),
    });
    await manage(M.EventStaffNeed_fill, {
      docId: need.docId,
      version: await version(need.docId),
      personId: lou.personId,
    });

    // Direct assignment + acknowledgement; a decline frees its shift.
    const moWork = await manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: mo.personId,
      role: "Captain",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    await mo.run(M.EventAssignment_confirm, {
      docId: moWork.docId,
      version: await version(moWork.docId),
    });
    const nedWork = await manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: ned.personId,
      role: "Runner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    await ned.run(M.EventAssignment_decline, {
      docId: nedWork.docId,
      version: await version(nedWork.docId),
      reason: "Double booked at my other job",
    });

    // Replacement: Kit takes over the Server need from Lou.
    await manage(M.EventStaffNeed_changeCoverage, {
      docId: need.docId,
      version: await version(need.docId),
      personId: kit.personId,
    });

    // Swap: Mo hands the Captain shift to Ned.
    const moShift = (await all<Doc<"shifts">>("shifts")).find(
      (row) => row.personId === mo.personId && row.status === "scheduled",
    )!;
    const swap = await mo.run(M.ShiftSwapRequest_createViaPropose, {
      shiftId: moShift._id,
      requesterPersonId: mo.personId,
      recipientPersonId: ned.personId,
    });
    await ned.run(M.ShiftSwapRequest_accept, { docId: swap.docId, version: 1 });
    await manage(M.ShiftSwapRequest_approve, { docId: swap.docId, version: 2 });

    // One consistent coverage row per person.
    const [shifts, assignments, needs] = await Promise.all([
      all<Doc<"shifts">>("shifts"),
      all<Doc<"eventAssignments">>("eventAssignments"),
      all<Doc<"eventStaffNeeds">>("eventStaffNeeds"),
    ]);
    const live = shifts.filter(
      (row) => row.eventId === eventId && row.status === "scheduled",
    );
    const perPerson = new Map<string, number>();
    for (const shift of live) {
      perPerson.set(shift.personId, (perPerson.get(shift.personId) ?? 0) + 1);
      for (const source of shift.eventStaffingSourceIds ?? []) {
        const assignment = assignments.find((row) => row._id === source);
        const filled = needs.find((row) => row._id === source);
        expect(
          (assignment &&
            assignment.personId === shift.personId &&
            assignment.status !== "unassigned") ||
            (filled &&
              filled.filledByPersonId === shift.personId &&
              filled.status === "filled"),
        ).toBeTruthy();
      }
    }
    expect(Object.fromEntries(perPerson)).toEqual({
      [kit.personId]: 1,
      [ned.personId]: 1,
    });
    expect(await read<Doc<"eventAssignments">>(moWork.docId)).toMatchObject({
      personId: ned.personId,
      status: "confirmed",
    });
    expect(await read<Doc<"eventAssignments">>(nedWork.docId)).toMatchObject({
      status: "unassigned",
      declineReason: "Double booked at my other job",
    });
    expect(await read<Doc<"eventStaffNeeds">>(need.docId)).toMatchObject({
      status: "cancelled",
      filledByPersonId: lou.personId,
      coverageReplacementPersonId: kit.personId,
    });
  });
});
