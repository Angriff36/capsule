/**
 * Runtime proof (AC-388, staffing slice): a deliberate EventStaffNeed timing
 * override survives Event.reschedule — the overridden captain keeps its
 * planTiming window while a following server need keeps moving with the crew
 * window. Proof only — the commands already exist in the manifest; nothing
 * here adds commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  liveEvents,
  liveStaffNeeds,
  OVERRIDE,
  R1,
  R2,
  readEvent,
  rolesFor,
  runner,
  seedStaffingEvent,
  type StaffNeedRow,
} from "./staffing-window-override-survival.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function byId<T extends { _id: string }>(rows: T[], id: string): T {
  const found = rows.find((row) => row._id === id);
  if (!found) throw new Error(`No row for ${id}`);
  return found;
}

describe("runtime proof: staffing window override survival (AC-388)", () => {
  it("reschedule keeps a planTiming override and moves a following need", async () => {
    const proof = harness();
    const tenantId = "tenant-ac388-staff-keep";
    const s = await seedStaffingEvent(proof, tenantId, "AC-388 staffing keep");
    const roles = rolesFor(proof, tenantId);
    const runEvents = runner(proof, roles.events);

    const seeded = await liveStaffNeeds(roles.workforce, tenantId, s.eventId);
    const captainBefore = byId(seeded, s.captainId);
    const serverBefore = byId(seeded, s.serverId);
    expect(captainBefore.startsAt).toBe(OVERRIDE.startsAt);
    expect(captainBefore.endsAt).toBe(OVERRIDE.endsAt);
    expect(captainBefore.followsEventTiming).toBe(false);
    // The server may already sit on the crew window after post; either way
    // this is the window it must move off of.
    const followedBefore = {
      startsAt: serverBefore.startsAt,
      endsAt: serverBefore.endsAt,
    };

    // configureTiming already bumped the version past 1 — read the current one.
    const eventVersion = (await readEvent(roles.events, s.eventId)).version;
    await runEvents(M.Event_reschedule, {
      docId: s.eventId,
      version: eventVersion,
      startsAt: R1.startsAt,
      endsAt: R1.endsAt,
    });

    const event = await readEvent(roles.events, s.eventId);
    expect(event.startsAt).toBe(R1.startsAt);
    expect(event.endsAt).toBe(R1.endsAt);

    const after = await liveStaffNeeds(roles.workforce, tenantId, s.eventId);
    expect(after).toHaveLength(2);
    const captain = byId(after, s.captainId);
    const server = byId(after, s.serverId);
    expect(captain.startsAt).toBe(OVERRIDE.startsAt);
    expect(captain.endsAt).toBe(OVERRIDE.endsAt);
    expect(captain.followsEventTiming).toBe(false);
    expect(server.followsEventTiming).toBe(true);
    expect(typeof server.startsAt).toBe("number");
    expect(typeof server.endsAt).toBe("number");
    expect(
      server.startsAt !== followedBefore.startsAt ||
        server.endsAt !== followedBefore.endsAt,
    ).toBe(true);

    const events_ = await liveEvents(roles.events, tenantId);
    expect(events_).toHaveLength(1);
  });

  it("a second reschedule still leaves the override and moves the follower", async () => {
    const proof = harness();
    const tenantId = "tenant-ac388-staff-again";
    const s = await seedStaffingEvent(proof, tenantId, "AC-388 staffing again");
    const roles = rolesFor(proof, tenantId);
    const runEvents = runner(proof, roles.events);

    let eventVersion = (await readEvent(roles.events, s.eventId)).version;
    await runEvents(M.Event_reschedule, {
      docId: s.eventId,
      version: eventVersion,
      startsAt: R1.startsAt,
      endsAt: R1.endsAt,
    });
    const afterFirst = await liveStaffNeeds(
      roles.workforce,
      tenantId,
      s.eventId,
    );
    const serverMid = byId(afterFirst, s.serverId);
    const midWindow = {
      startsAt: serverMid.startsAt,
      endsAt: serverMid.endsAt,
    };

    eventVersion = (await readEvent(roles.events, s.eventId)).version;
    await runEvents(M.Event_reschedule, {
      docId: s.eventId,
      version: eventVersion,
      startsAt: R2.startsAt,
      endsAt: R2.endsAt,
    });

    const event = await readEvent(roles.events, s.eventId);
    expect(event.startsAt).toBe(R2.startsAt);
    expect(event.endsAt).toBe(R2.endsAt);

    const after = await liveStaffNeeds(roles.workforce, tenantId, s.eventId);
    expect(after).toHaveLength(2);
    const captain = byId(after, s.captainId);
    const server: StaffNeedRow = byId(after, s.serverId);
    expect(captain.startsAt).toBe(OVERRIDE.startsAt);
    expect(captain.endsAt).toBe(OVERRIDE.endsAt);
    expect(captain.followsEventTiming).toBe(false);
    expect(server.followsEventTiming).toBe(true);
    // It moved again: not the window it held after the first reschedule.
    expect(
      server.startsAt !== midWindow.startsAt ||
        server.endsAt !== midWindow.endsAt,
    ).toBe(true);

    const events_ = await liveEvents(roles.events, tenantId);
    expect(events_).toHaveLength(1);
    expect(events_[0]!._id).toBe(s.eventId);
  });
});
