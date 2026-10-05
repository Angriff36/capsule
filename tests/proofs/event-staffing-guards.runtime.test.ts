/**
 * AC-325 (CF-9.1 guards): staffing an event refuses a paused worker, a worker
 * on approved time off, and a cancelled event; a finished event can only be
 * staffed with a written reason. A double booking across two events is shown
 * (not blocked): both assignments land and the roster names the clash.
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
import { findRosterConflicts } from "../../src/features/workforce/rosterConflicts";

const M = api.mutations;
const TENANT = "tenant-staffing-guards";
const HOUR = 3_600_000;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

async function hire(proof: Proof, name: string) {
  const { workforce } = rolesFor(proof, TENANT);
  const created = await runner(proof, workforce)(M.Person_createViaHire, {
    givenName: name,
    familyName: "Guard",
    email: `${name.toLowerCase()}@guards.example`,
    role: "workforce_staff",
    employmentType: "part_time",
  });
  return created.docId;
}

async function assign(
  proof: Proof,
  eventId: string,
  personId: string,
  extra: Record<string, unknown> = {},
) {
  const { workforce } = rolesFor(proof, TENANT);
  return runner(proof, workforce)(M.EventAssignment_createViaAssign, {
    eventId,
    personId,
    role: "Server",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    ...extra,
  });
}

describe("AC-325 event staffing guards", () => {
  it("rejects a paused worker and approved time off; a double booking is shown, not blocked", async () => {
    const proof = harness();
    const { workforce } = rolesFor(proof, TENANT);
    const { eventId } = await createPlannedEvent(proof, TENANT, "Garden lunch");
    const { eventId: otherEventId } = await createPlannedEvent(
      proof,
      TENANT,
      "Board dinner",
    );

    // Paused worker.
    const paused = await hire(proof, "Pat");
    await workforce.run(async (ctx) =>
      ctx.db.patch(paused as never, { status: "inactive" } as never),
    );
    await expect(assign(proof, eventId, paused)).rejects.toThrow(
      /active staff member/,
    );

    // Approved time off over the event.
    const away = await hire(proof, "Robin");
    const request = await runner(proof, workforce)(
      M.TimeOffRequest_createViaSubmit,
      {
        personId: away,
        startsAt: S.startsAt - 2 * HOUR,
        endsAt: S.endsAt + 2 * HOUR,
        reason: "Family wedding",
      },
    );
    await runner(proof, workforce)(M.TimeOffRequest_approve, {
      docId: request.docId,
      version: 1,
    });
    await expect(assign(proof, eventId, away)).rejects.toThrow(
      /Robin Guard has approved time off/,
    );
    const rows = await workforce.run(async (ctx) =>
      ctx.db.query("eventAssignments").collect(),
    );
    expect(rows).toEqual([]);

    // Time off does not block work outside it.
    await assign(proof, eventId, away, {
      startsAt: S.endsAt + 3 * HOUR,
      endsAt: S.endsAt + 5 * HOUR,
    });

    // Double booking across two events: both land, the roster names it.
    const busy = await hire(proof, "Sam");
    await assign(proof, eventId, busy);
    await assign(proof, otherEventId, busy, {
      startsAt: S.startsAt + HOUR,
      endsAt: S.endsAt + HOUR,
    });
    const snapshot = (await workforce.run(async (ctx) => ({
      shifts: await ctx.db.query("shifts").collect(),
      events: await ctx.db.query("events").collect(),
      people: await ctx.db.query("people").collect(),
    }))) as {
      shifts: Doc<"shifts">[];
      events: Doc<"events">[];
      people: Doc<"people">[];
    };
    const busyShifts = snapshot.shifts.filter(
      (row) => row.personId === busy && row.status === "scheduled",
    );
    expect(busyShifts).toHaveLength(2);
    const conflicts = findRosterConflicts({
      shifts: snapshot.shifts,
      timeOff: [],
      qualifications: [],
      eventTitle: (id) =>
        snapshot.events.find((row) => row._id === id)?.title ?? "an event",
      personName: (id) => {
        const person = snapshot.people.find((row) => row._id === id);
        return person ? `${person.givenName} ${person.familyName}` : "Someone";
      },
    });
    const overlap = conflicts.find((row) => row.kind === "overlap");
    expect(overlap).toMatchObject({
      personId: busy,
      startsAt: S.startsAt + HOUR,
      endsAt: S.endsAt,
    });
    expect(overlap?.message).toContain("Sam Guard");
    expect(overlap?.message).toContain("Garden lunch");
    expect(overlap?.message).toContain("Board dinner");
  });

  it("refuses a cancelled event; a finished event needs a written reason", async () => {
    const proof = harness();
    const { events, workforce } = rolesFor(proof, TENANT);
    const { eventId: cancelledId } = await createPlannedEvent(
      proof,
      TENANT,
      "Called off",
    );
    await runner(proof, events)(M.Event_cancel, {
      docId: cancelledId,
      version: 1,
      reason: "Client postponed",
    });
    const worker = await hire(proof, "Lee");
    await expect(assign(proof, cancelledId, worker)).rejects.toThrow(
      /cancelled/,
    );

    const { eventId: doneId } = await createPlannedEvent(
      proof,
      TENANT,
      "Last week's party",
    );
    await workforce.run(async (ctx) =>
      ctx.db.patch(doneId as never, { stage: "completed" } as never),
    );
    await expect(assign(proof, doneId, worker)).rejects.toThrow(
      /already finished/,
    );
    const late = await assign(proof, doneId, worker, {
      overrideReason: "Lee covered the bar; recording it after the event",
    });
    const row = await workforce.run(async (ctx) =>
      ctx.db.get(late.docId as never),
    );
    expect(row).toMatchObject({
      personId: worker,
      overrideReason: "Lee covered the bar; recording it after the event",
    });
  });

  it("an expiring certificate the work does not need never blocks it", async () => {
    const proof = harness();
    const { workforce } = rolesFor(proof, TENANT);
    const { eventId } = await createPlannedEvent(proof, TENANT, "Picnic");
    const worker = await hire(proof, "Kim");
    await runner(proof, workforce)(M.Qualification_createViaGrant, {
      personId: worker,
      name: "Forklift",
      certificationType: "Equipment",
      issuingBody: "State board",
      issuedAt: S.startsAt - 400 * 24 * HOUR,
      expiresAt: S.startsAt - 24 * HOUR,
    });
    await assign(proof, eventId, worker);
    const shifts = await workforce.run(async (ctx) =>
      ctx.db.query("shifts").collect(),
    );
    expect(
      shifts.filter(
        (row) => row.personId === worker && row.status === "scheduled",
      ),
    ).toHaveLength(1);
  });
});
