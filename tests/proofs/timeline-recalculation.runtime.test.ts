/**
 * Runtime proof (AC-430, PL-TIMING, spec §8.4 recalculation). A venue change
 * queues a drive-time check and a timing re-plan. The new plan moves a shift
 * nobody was told about yet, but a shift in a published (and acknowledged)
 * week stays put: Capsule shows the proposed change, and a manager sends it
 * through the week notice, which asks the person to acknowledge again. A
 * failed drive-time check keeps the last drive time, marked out of date.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { fakeRoutes } from "./route-facts.runtime.helpers";
import {
  MIN,
  SERVE_AT,
  settle,
  stubTimingEnv,
  timingWorld,
  TIMING_TENANT,
} from "./timing-rules.runtime.helpers";

beforeEach(() => {
  stubTimingEnv();
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "route-key-proof");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const M = api.mutations;
const WEEK_START = SERVE_AT - 3 * 24 * 60 * MIN;
const WEEK_END = SERVE_AT + 4 * 24 * 60 * MIN;

describe("timeline recalculation (AC-430)", () => {
  it("venue change queues recalculation; acknowledged shift gets a proposed delta via the correction path; failed refresh keeps stale-marked last fact", async () => {
    // 30 minutes to the first venue, 70 minutes to the new one.
    const google = fakeRoutes((_from, to) =>
      to.startsWith("55 Farm Road") ? 4200 : 1800,
    );
    const { t, owner, event } = await timingWorld({ safetyBufferMinutes: 0 });
    await owner.mutation(M.OperatingLocation_createViaAdd, {
      name: "Main kitchen",
      addressLine1: "100 Commissary Way",
      city: "Portland",
      region: "ME",
      countryCode: "US",
      timeZone: "America/New_York",
    });
    await owner.mutation(M.Event_configureTiming, {
      docId: event,
      serviceStartsAt: SERVE_AT,
      setupMinutes: 180,
      loadMinutes: 60,
      cleanupMinutes: 60,
      unloadMinutes: 30,
    });
    await settle(t);
    let saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingOutboundTravelMinutes).toBe(30);
    const firstStaffOn = SERVE_AT - (180 + 30 + 60) * MIN;
    expect(saved.timingStaffOnAt).toBe(firstStaffOn);

    // Two crew members; Drew's week is published and acknowledged.
    const hire = async (givenName: string, subject: string) =>
      (
        (await owner.mutation(M.Person_createViaHire, {
          givenName,
          familyName: "Crew",
          email: `${subject}@proof.example`,
          role: "event_staff",
          employmentType: "part_time",
          authSubjectId: subject,
        })) as { docId: Id<"people"> }
      ).docId;
    const drew = await hire("Drew", "timing-crew-drew");
    const eli = await hire("Eli", "timing-crew-eli");
    for (const personId of [drew, eli]) {
      await owner.mutation(M.EventAssignment_createViaAssign, {
        eventId: event,
        personId,
        role: "Server",
      });
    }
    await settle(t);
    const shiftOf = async (personId: Id<"people">) =>
      (
        await t.run((ctx) =>
          ctx.db
            .query("shifts")
            .withIndex("by_personId", (q) => q.eq("personId", personId))
            .collect(),
        )
      ).filter((row) => row.status === "scheduled")[0];
    expect((await shiftOf(drew)).startsAt).toBe(firstStaffOn);
    expect((await shiftOf(eli)).startsAt).toBe(firstStaffOn);

    const notice = (await owner.mutation(
      M.WeeklyScheduleNotice_createViaPublishSchedule,
      {
        personId: drew,
        recipientAuthSubjectId: "timing-crew-drew",
        weekStartsAt: WEEK_START,
        weekEndsAt: WEEK_END,
        shiftCount: 1,
        shiftSummary: "Fri · 7:30 PM · Server · Timing proof gala",
      },
    )) as { docId: Id<"weeklyScheduleNotices"> };
    const drewActor = t.withIdentity({
      subject: "timing-crew-drew",
      org_id: TIMING_TENANT,
      role: "event_staff",
    });
    await drewActor.mutation(M.WeeklyScheduleNotice_acknowledge, {
      docId: notice.docId,
    });

    // The venue changes: the drive-time check and re-plan are queued, not run
    // in the same step.
    await owner.mutation(M.Event_changeVenue, {
      docId: event,
      venueName: "Garden Barn",
      venueAddress: "55 Farm Road, Freeport ME, US",
    });
    const queued = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const pending = queued.filter((job) => job.state.kind === "pending");
    expect(pending.map((job) => job.name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("eventRoutes"),
        expect.stringContaining("eventTimingRules"),
      ]),
    );
    await settle(t);

    saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingOutboundTravelMinutes).toBe(70);
    const newStaffOn = SERVE_AT - (180 + 70 + 60) * MIN;
    expect(saved.timingStaffOnAt).toBe(newStaffOn);

    // Eli was never told: his shift follows the new plan.
    expect((await shiftOf(eli)).startsAt).toBe(newStaffOn);
    // Drew acknowledged his week: his shift keeps the old time and a change
    // waits for a manager.
    expect((await shiftOf(drew)).startsAt).toBe(firstStaffOn);
    const changes = await owner.query(
      api.shiftTimingChanges.listEventShiftChanges,
      { eventId: event },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      personName: "Drew Crew",
      acknowledged: true,
      from: { startsAt: firstStaffOn },
      to: { startsAt: newStaffOn },
    });

    // Another re-plan with the same times does not ask twice.
    await t.mutation(internal.eventTimingRules.recalculate, {
      tenantId: TIMING_TENANT,
      eventId: event,
    });
    await settle(t);
    const ledger = await t.run((ctx) =>
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", changes[0].shiftId))
        .collect(),
    );
    expect(
      ledger.filter((row) => row.type === "ShiftTimingChangeProposed"),
    ).toHaveLength(1);

    // The manager sends it: the shift moves and Drew must acknowledge again.
    await owner.mutation(api.shiftTimingChanges.applyShiftTimingChange, {
      proposalId: changes[0].proposalId,
      shiftSummary: "Fri · 6:50 PM · Server · Timing proof gala",
    });
    expect((await shiftOf(drew)).startsAt).toBe(newStaffOn);
    const republished = await t.run((ctx) => ctx.db.get(notice.docId));
    expect(republished!.acknowledgedAt ?? null).toBeNull();
    expect(republished!.shiftSummary).toContain("6:50 PM");
    expect(
      await owner.query(api.shiftTimingChanges.listEventShiftChanges, {
        eventId: event,
      }),
    ).toHaveLength(0);

    // A failed drive-time check keeps the last drive time, marked stale.
    google.state.mode = "down";
    await owner.action(api.eventRoutes.refreshEventRoute, { eventId: event });
    saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingOutboundTravelMinutes).toBe(70);
    const route = await owner.query(api.eventRoutes.getEventRoute, {
      eventId: event,
    });
    expect(route!.legs[0].state).toBe("stale");
    expect(route!.legs[0].fact!.durationSeconds).toBe(4200);
    expect(route!.routeStale).toBe(true);
  });

  it("keeping the old time stops the question for those times", async () => {
    fakeRoutes(() => 1800);
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
    const person = (await owner.mutation(M.Person_createViaHire, {
      givenName: "Fran",
      familyName: "Crew",
      email: "fran@proof.example",
      role: "event_staff",
      employmentType: "part_time",
    })) as { docId: Id<"people"> };
    await owner.mutation(M.EventAssignment_createViaAssign, {
      eventId: event,
      personId: person.docId,
      role: "Server",
    });
    await settle(t);
    await owner.mutation(M.WeeklyScheduleNotice_createViaPublishSchedule, {
      personId: person.docId,
      weekStartsAt: WEEK_START,
      weekEndsAt: WEEK_END,
      shiftCount: 1,
      shiftSummary: "Fri · 7:30 PM · Server",
    });
    // Load takes longer now: the published shift gets a proposal.
    await owner.mutation(M.Event_configureTiming, {
      docId: event,
      serviceStartsAt: SERVE_AT,
      setupMinutes: 180,
      loadMinutes: 90,
      outboundTravelMinutes: 30,
      cleanupMinutes: 60,
      returnTravelMinutes: 30,
      unloadMinutes: 30,
    });
    await settle(t);
    const [change] = await owner.query(
      api.shiftTimingChanges.listEventShiftChanges,
      { eventId: event },
    );
    expect(change.acknowledged).toBe(false);
    await owner.mutation(api.shiftTimingChanges.keepShiftTime, {
      proposalId: change.proposalId,
    });
    await t.mutation(internal.eventTimingRules.recalculate, {
      tenantId: TIMING_TENANT,
      eventId: event,
    });
    await owner.mutation(M.Event_configureTiming, {
      docId: event,
      serviceStartsAt: SERVE_AT,
      setupMinutes: 180,
      loadMinutes: 90,
      outboundTravelMinutes: 30,
      cleanupMinutes: 60,
      returnTravelMinutes: 30,
      unloadMinutes: 30,
    });
    await settle(t);
    expect(
      await owner.query(api.shiftTimingChanges.listEventShiftChanges, {
        eventId: event,
      }),
    ).toHaveLength(0);
  });
});
