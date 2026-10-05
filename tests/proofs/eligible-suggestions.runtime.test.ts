/**
 * Worker data, suggestions and safe auto-fill (spec §12.2; AC-505, AC-506,
 * AC-511, AC-515):
 * - preferred roles rank people first; approved work places, a do-not-schedule
 *   note, approved time off, other work at the same time and a missing
 *   certificate each leave a person out with a named reason;
 * - auto-fill uses only suggested people and leaves a need open (with the
 *   reason) when nobody suitable is free;
 * - an agency worker is one Person with the agency on it; hiring the same
 *   email again is refused;
 * - the staff swap list names everyone it leaves out, without saying why a
 *   coworker is away.
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
} from "./headcount-staffing-reconciliation.runtime.helpers";

const M = api.mutations;
const TENANT = "tenant-eligible-suggestions";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("suggestions and auto-fill (AC-505, AC-506, AC-511)", () => {
  it("ranks preferred people, names every exclusion, and auto-fills only suggested people", async () => {
    const proof = harness();
    const { workforce } = rolesFor(proof, TENANT);
    const manage = runner(proof, workforce);
    const { eventId } = await createPlannedEvent(proof, TENANT, "Garden party");
    const { eventId: otherEvent } = await createPlannedEvent(
      proof,
      TENANT,
      "Office lunch",
    );
    const read = <T>(id: string) =>
      workforce.run(async (ctx) => ctx.db.get(id as never)) as Promise<T>;
    const hire = async (name: string, extra: Record<string, unknown> = {}) =>
      (
        await manage(M.Person_createViaHire, {
          givenName: name,
          familyName: "Pool",
          email: `${name.toLowerCase()}@pool.example`,
          role: "event_staff",
          employmentType: "part_time",
          authSubjectId: `${TENANT}-${name.toLowerCase()}`,
          ...extra,
        })
      ).docId;
    const certify = (personId: string) =>
      manage(M.Qualification_createViaGrant, {
        personId,
        name: "Food handler",
        certificationType: "Food safety",
        issuingBody: "County",
        issuedAt: S.startsAt - 100 * DAY,
        expiresAt: S.startsAt + 300 * DAY,
      });
    const version = async (id: string) =>
      (await read<{ version: number }>(id)).version;

    const ann = await hire("Ann");
    const bo = await hire("Bo");
    const cy = await hire("Cy");
    const dee = await hire("Dee");
    const eve = await hire("Eve");
    const fay = await hire("Fay", {
      staffingVendor: "PeopleReady",
      employmentType: "temporary",
    });
    const gus = await hire("Gus");
    for (const person of [ann, bo, dee, eve, fay, gus]) await certify(person);

    await manage(M.Person_setWorkPreferences, {
      docId: ann,
      version: await version(ann),
      preferredRoles: ["Server"],
      approvedWorkLocations: [],
    });
    await manage(M.Person_setWorkPreferences, {
      docId: eve,
      version: await version(eve),
      preferredRoles: [],
      approvedWorkLocations: ["Patio"],
    });
    await manage(M.Person_setSchedulingHold, {
      docId: dee,
      version: await version(dee),
      reason: "Waiting on paperwork",
    });
    const away = await manage(M.TimeOffRequest_createViaSubmit, {
      personId: bo,
      startsAt: S.startsAt - HOUR,
      endsAt: S.endsAt + HOUR,
      reason: "Trip",
    });
    await manage(M.TimeOffRequest_approve, { docId: away.docId, version: 1 });
    await manage(M.EventAssignment_createViaAssign, {
      eventId: otherEvent,
      personId: gus,
      role: "Runner",
      startsAt: S.startsAt + HOUR,
      endsAt: S.endsAt,
    });

    const post = () =>
      manage(M.EventStaffNeed_createViaPostOpen, {
        eventId,
        role: "Server",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        qualificationName: "Food handler",
        workLocation: "Dining room",
      });
    const first = await post();
    const second = await post();
    const third = await post();

    const result = (await workforce.query(
      api.workforceScheduling.suggestStaffForNeed,
      { needId: first.docId },
    )) as {
      suggested: Array<{
        name: string;
        prefersRole: boolean;
        agency: string | null;
      }>;
      excluded: Array<{ name: string; reason: string }>;
    };
    expect(result.suggested.map((row) => row.name)).toEqual([
      "Ann Pool",
      "Fay Pool",
    ]);
    expect(result.suggested[0]!.prefersRole).toBe(true);
    expect(result.suggested[1]!.agency).toBe("PeopleReady");
    expect(
      Object.fromEntries(result.excluded.map((row) => [row.name, row.reason])),
    ).toEqual({
      "Bo Pool": "Approved time off at this time",
      "Cy Pool": "No current Food handler certificate",
      "Dee Pool": "Do not schedule: Waiting on paperwork",
      "Eve Pool": "Not approved to work at Dining room",
      "Gus Pool": "Already working at this time",
    });

    // Crew cannot see these suggestions (they include everyone's time off).
    const crew = proof.asRole({
      subject: `${TENANT}-ann`,
      role: "event_staff",
      tenantId: TENANT,
    });
    await expect(
      crew.query(api.workforceScheduling.suggestStaffForNeed, {
        needId: first.docId,
      }),
    ).rejects.toThrow(/Staffing manager access/);

    const filled = (await workforce.mutation(
      api.workforceScheduling.autoFillEventStaffNeeds,
      { eventId },
    )) as {
      filled: Array<{ needId: string; name: string }>;
      left: Array<{ needId: string; reason: string }>;
    };
    expect(filled.filled.map((row) => row.name).sort()).toEqual([
      "Ann Pool",
      "Fay Pool",
    ]);
    expect(filled.left).toHaveLength(1);
    const needs = await Promise.all(
      [first, second, third].map((row) =>
        read<Doc<"eventStaffNeeds">>(row.docId),
      ),
    );
    const fillers = needs.flatMap((row) =>
      row.filledByPersonId ? [row.filledByPersonId] : [],
    );
    expect(fillers.sort()).toEqual([ann, fay].sort());
    expect(needs.filter((row) => row.status === "open")).toHaveLength(1);
  });

  it("an agency worker is one Person; adding the same email again is refused", async () => {
    const proof = harness();
    const { workforce } = rolesFor(proof, TENANT);
    const manage = runner(proof, workforce);
    const agency = await manage(M.Person_createViaHire, {
      givenName: "Hal",
      familyName: "Temp",
      email: "hal@agency.example",
      role: "event_staff",
      employmentType: "temporary",
      staffingVendor: "PeopleReady",
    });
    await expect(
      manage(M.Person_createViaHire, {
        givenName: "Harold",
        familyName: "Temp",
        email: "HAL@agency.example ",
        role: "event_staff",
        employmentType: "part_time",
      }),
    ).rejects.toThrow(/Hal Temp already has a staff profile/);
    const people = (await workforce.run(async (ctx) =>
      ctx.db.query("people").collect(),
    )) as Doc<"people">[];
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({
      _id: agency.docId,
      staffingVendor: "PeopleReady",
    });
    // Hired in-house later: same profile, agency cleared.
    await manage(M.Person_setStaffingVendor, {
      docId: agency.docId,
      version: people[0]!.version,
    });
    expect(
      await workforce.run(async (ctx) => ctx.db.get(agency.docId as never)),
    ).toMatchObject({ staffingVendor: null });
  });
});

describe("swap list names who is left out (AC-515)", () => {
  it("lists excluded coworkers with a reason that keeps time off private", async () => {
    const proof = harness();
    const { workforce } = rolesFor(proof, TENANT);
    const manage = runner(proof, workforce);
    const { eventId } = await createPlannedEvent(
      proof,
      TENANT,
      "Terrace dinner",
    );
    const hire = async (name: string, linked = true) =>
      (
        await manage(M.Person_createViaHire, {
          givenName: name,
          familyName: "Swap",
          email: `${name.toLowerCase()}@swap.example`,
          role: "event_staff",
          employmentType: "part_time",
          ...(linked
            ? { authSubjectId: `${TENANT}-swap-${name.toLowerCase()}` }
            : {}),
        })
      ).docId;
    const ivy = await hire("Ivy");
    const jo = await hire("Jo");
    const kai = await hire("Kai");
    await hire("Lee", false);
    const mo = await hire("Mo");
    await manage(M.EventAssignment_createViaAssign, {
      eventId,
      personId: ivy,
      role: "Server",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
    });
    const away = await manage(M.TimeOffRequest_createViaSubmit, {
      personId: kai,
      startsAt: S.startsAt - HOUR,
      endsAt: S.endsAt + HOUR,
      reason: "Surgery",
    });
    await manage(M.TimeOffRequest_approve, { docId: away.docId, version: 1 });
    await manage(M.Person_setSchedulingHold, {
      docId: mo,
      version: (
        (await workforce.run(async (ctx) => ctx.db.get(mo as never))) as {
          version: number;
        }
      ).version,
      reason: "On leave",
    });
    const shift = (
      (await workforce.run(async (ctx) =>
        ctx.db.query("shifts").collect(),
      )) as Doc<"shifts">[]
    ).find((row) => row.personId === ivy)!;
    const self = proof.asRole({
      subject: `${TENANT}-swap-ivy`,
      role: "event_staff",
      tenantId: TENANT,
    });
    const list = (await self.query(api.staffShiftSwaps.getCandidates, {
      shiftId: shift._id,
      now: Date.now(),
    })) as {
      candidates: Array<{ name: string }>;
      excluded: Array<{ name: string; reason: string }>;
    };
    expect(list.candidates.map((row) => row.name)).toEqual(["Jo Swap"]);
    expect(
      Object.fromEntries(list.excluded.map((row) => [row.name, row.reason])),
    ).toEqual({
      "Kai Swap": "Not free at this time",
      "Lee Swap": "Has no Capsule sign-in yet",
      "Mo Swap": "Not taking shifts right now",
    });
    expect(JSON.stringify(list)).not.toContain("Surgery");
  });
});
