/**
 * Runtime proof (AC-326, PL-SCHEDULE-CORRECTION, feature spec CF-9.1 timing
 * change flow). Moving an event: crew nobody has told yet simply follow the
 * new times; a person already checked in keeps what happened; a person whose
 * week was already sent is not moved silently — a change waits for a manager,
 * and sending it re-sends the week (with what it said before) so the person
 * confirms again and gets a phone notice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ENDS_AT,
  MIN,
  SERVE_AT,
  settle,
  stubTimingEnv,
  timingWorld,
  TIMING_TENANT,
} from "./timing-rules.runtime.helpers";

beforeEach(() => {
  stubTimingEnv();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const M = api.mutations;
const WEEK_START = SERVE_AT - 3 * 24 * 60 * MIN;
const WEEK_END = SERVE_AT + 4 * 24 * 60 * MIN;

describe("event reschedule staffing flow (AC-326)", () => {
  it("rescheduling an event re-times follow-timing assignments, preserves checked-in rows, and raises a reviewable conflict", async () => {
    const { t, owner, event } = await timingWorld({ safetyBufferMinutes: 0 });
    await owner.mutation(M.Event_configureTiming, {
      docId: event,
      serviceStartsAt: SERVE_AT,
      setupMinutes: 180,
      loadMinutes: 60,
      outboundTravelMinutes: 30,
      cleanupMinutes: 60,
      returnTravelMinutes: 30,
      unloadMinutes: 30,
    });
    await settle(t);
    const staffOn = SERVE_AT - 270 * MIN;

    const hire = async (givenName: string) =>
      (
        (await owner.mutation(M.Person_createViaHire, {
          givenName,
          familyName: "Crew",
          email: `${givenName.toLowerCase()}.move@proof.example`,
          role: "event_staff",
          employmentType: "part_time",
          authSubjectId: `move-${givenName.toLowerCase()}`,
        })) as { docId: Id<"people"> }
      ).docId;
    const ana = await hire("Ana"); // nobody told her yet
    const ben = await hire("Ben"); // already checked in
    const cy = await hire("Cy"); // week already sent and confirmed
    const rows: Record<string, Id<"eventAssignments">> = {};
    for (const [name, personId] of Object.entries({ ana, ben, cy })) {
      rows[name] = (
        (await owner.mutation(M.EventAssignment_createViaAssign, {
          eventId: event,
          personId,
          role: "Server",
        })) as { docId: Id<"eventAssignments"> }
      ).docId;
    }
    await settle(t);
    const benRow = await t.run((ctx) => ctx.db.get(rows.ben));
    await owner.mutation(M.EventAssignment_checkIn, {
      docId: rows.ben,
      version: benRow!.version,
    });
    const notice = (await owner.mutation(
      M.WeeklyScheduleNotice_createViaPublishSchedule,
      {
        personId: cy,
        recipientAuthSubjectId: "move-cy",
        weekStartsAt: WEEK_START,
        weekEndsAt: WEEK_END,
        shiftCount: 1,
        shiftSummary: "Thu · 6:30 PM · Server · Timing proof gala",
      },
    )) as { docId: Id<"weeklyScheduleNotices"> };
    const cyActor = t.withIdentity({
      subject: "move-cy",
      org_id: TIMING_TENANT,
      role: "event_staff",
    });
    await cyActor.mutation(M.WeeklyScheduleNotice_acknowledge, {
      docId: notice.docId,
    });
    await settle(t);

    // The event moves two hours later.
    const shift = 120 * MIN;
    const saved = await owner.query(api.queries.getEvent, { id: event });
    await owner.mutation(M.Event_reschedule, {
      docId: event,
      version: saved.version,
      startsAt: saved.startsAt + shift,
      endsAt: ENDS_AT + shift,
    });
    await settle(t);

    const shiftsOf = async (personId: Id<"people">) =>
      (
        await t.run((ctx) =>
          ctx.db
            .query("shifts")
            .withIndex("by_personId", (q) => q.eq("personId", personId))
            .collect(),
        )
      ).filter((row) => row.status !== "cancelled");
    // Ana follows the event: her work moves with it.
    expect(await shiftsOf(ana)).toMatchObject([{ startsAt: staffOn + shift }]);
    const anaRow = await t.run((ctx) => ctx.db.get(rows.ana));
    expect(anaRow!.startsAt).toBe(staffOn + shift);
    // Ben is checked in: what happened stays.
    const benAfter = await t.run((ctx) => ctx.db.get(rows.ben));
    expect(benAfter!.status).toBe("checked_in");
    expect(benAfter!.startsAt).toBe(staffOn);
    // Cy was told: not moved, a change waits for review.
    expect(await shiftsOf(cy)).toMatchObject([{ startsAt: staffOn }]);
    const changes = await owner.query(
      api.shiftTimingChanges.listEventShiftChanges,
      { eventId: event },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      personName: "Cy Crew",
      acknowledged: true,
      from: { startsAt: staffOn },
      to: { startsAt: staffOn + shift },
    });

    // The manager sends it: the shift moves, the week is re-sent with what it
    // said before, Cy must confirm again, and a phone notice is queued.
    await owner.mutation(api.shiftTimingChanges.applyShiftTimingChange, {
      proposalId: changes[0].proposalId,
      shiftSummary: "Thu · 8:30 PM · Server · Timing proof gala",
    });
    expect(await shiftsOf(cy)).toMatchObject([{ startsAt: staffOn + shift }]);
    const resent = await t.run((ctx) => ctx.db.get(notice.docId));
    expect(resent!.acknowledgedAt ?? null).toBeNull();
    expect(resent!.shiftSummary).toContain("8:30 PM");
    expect(resent!.previousShiftSummary).toContain("6:30 PM");
    expect(resent!.changedAt).toEqual(expect.any(Number));
    const queued = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(queued.some((job) => job.name.includes("schedulePushSend"))).toBe(
      true,
    );
    await cyActor.mutation(M.WeeklyScheduleNotice_acknowledge, {
      docId: notice.docId,
    });
    const confirmed = await t.run((ctx) => ctx.db.get(notice.docId));
    expect(confirmed!.acknowledgedAt).toEqual(expect.any(Number));
  });
});
