/**
 * Runtime proof: handing a partner venue to a new owner (Venue Partner
 * Playbook section 02) saves the brief as a "handoff" venue note, moves the
 * owner while every other partner detail stays, and the joint visit and the
 * venue's confirmation close the hand-over.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  CONFIRMED_PREFIX,
  JOINT_VISIT_PREFIX,
  handoffStatus,
  handoffText,
} from "../../src/features/facilities/venueHandoff";
import {
  harness,
  hireStaff,
  M,
  registerVenue,
} from "./venue-notes.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type VenueRow = {
  partnerTier?: string | null;
  partnerOwnerPersonId?: string | null;
  partnerSince?: number | null;
  opsEaseScore?: number | null;
  relationshipScore?: number | null;
};
type NoteRow = {
  venueId: string;
  category: string;
  content: string;
  postedAt?: number | null;
  deletedAt?: number | null;
};

describe("runtime proof: venue hand-over", () => {
  it("saves the brief, moves the owner, and closes after visit and confirmation", async () => {
    const proof = harness();
    const tenantId = "tenant-venue-handoff";
    const manager = proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    });
    const josh = await hireStaff(proof, tenantId, "Josh", "event_staff");
    const kayden = await hireStaff(proof, tenantId, "Kayden", "event_staff");
    const joshActor = proof.asRole({
      subject: josh.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const kaydenActor = proof.asRole({
      subject: kayden.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const venueId = await registerVenue(proof, manager, "Kindred + Co.", 180);
    const read = async () =>
      (await manager.query(api.queries.getVenue, {
        id: venueId as never,
      })) as VenueRow;
    const notes = async () =>
      (await manager.query(api.queries.listVenueNote, {})) as NoteRow[];

    await proof.executeCommand(manager, M.Venue_setPartnership, {
      docId: venueId,
      partnerTier: "full_event",
      partnerOwnerPersonId: josh.personId,
      opsEaseScore: 8,
      relationshipScore: 9,
    });
    const before = await read();

    // The outgoing owner writes the brief, then the owner moves; the panel
    // restates every other partner detail so none is cleared.
    await proof.executeCommand(joshActor, M.VenueNote_createViaPost, {
      venueId,
      category: "handoff",
      content: handoffText({
        from: "Riley Josh",
        to: "Riley Kayden",
        reason: "Workload balance",
        answers: { contacts: "Sarah (owner) texts only" },
      }),
      visibility: "internal",
    });
    await proof.executeCommand(manager, M.Venue_setPartnership, {
      docId: venueId,
      partnerTier: before.partnerTier,
      partnerOwnerPersonId: kayden.personId,
      opsEaseScore: before.opsEaseScore,
      relationshipScore: before.relationshipScore,
    });
    const after = await read();
    expect(after.partnerOwnerPersonId).toBe(kayden.personId);
    expect(after).toMatchObject({
      partnerTier: "full_event",
      opsEaseScore: 8,
      relationshipScore: 9,
      partnerSince: before.partnerSince,
    });

    const open = handoffStatus({
      venueId,
      notes: await notes(),
      now: Date.now(),
    });
    expect(open).toMatchObject({
      from: "Riley Josh",
      to: "Riley Kayden",
      done: false,
      jointVisitAt: null,
    });

    for (const content of [
      `${JOINT_VISIT_PREFIX}Met Sarah together`,
      `${CONFIRMED_PREFIX}Sarah is happy with Kayden`,
    ]) {
      await proof.executeCommand(kaydenActor, M.VenueNote_createViaPost, {
        venueId,
        category: "check_in",
        content,
        visibility: "internal",
      });
    }
    const closed = handoffStatus({
      venueId,
      notes: await notes(),
      now: Date.now(),
    });
    expect(closed?.done).toBe(true);
    expect(closed?.jointVisitAt).not.toBeNull();
    expect(closed?.reminders).toEqual([]);
  });
});
