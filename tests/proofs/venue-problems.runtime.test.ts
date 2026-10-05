/**
 * Runtime proof: a problem at a partner venue (Venue Partner Playbook
 * section 14) is saved with its level, any event staff member can close it
 * with what was done, the closer's name comes from their staff profile, and
 * a level outside 1-4 or a close on a note that is not a problem is refused.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { problemStatus } from "../../src/features/facilities/venueEscalation";
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

type NoteRow = {
  _id: string;
  venueId: string;
  category: string;
  content: string;
  escalationLevel?: number | null;
  isPinned?: boolean | null;
  postedAt?: number | null;
  resolvedAt?: number | null;
  resolvedByName?: string | null;
  resolution?: string | null;
  deletedAt?: number | null;
  version: number;
};

describe("runtime proof: venue problem levels", () => {
  it("saves the level, closes the problem with who and what, and refuses bad input", async () => {
    const proof = harness();
    const tenantId = "tenant-venue-problems";
    const manager = proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    });
    const kayden = await hireStaff(proof, tenantId, "Kayden", "event_staff");
    const staff = proof.asRole({
      subject: kayden.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const venueId = await registerVenue(proof, manager, "Kindred + Co.", 180);
    const notes = async () =>
      (await manager.query(api.queries.listVenueNote, {})) as NoteRow[];

    await proof.executeCommand(staff, M.VenueNote_createViaPost, {
      venueId,
      category: "incident",
      content: "The venue booked another caterer for the Smith party",
      visibility: "internal",
      isPinned: true,
      escalationLevel: 3,
    });
    await expect(
      proof.executeCommand(staff, M.VenueNote_createViaPost, {
        venueId,
        category: "incident",
        content: "Level five",
        visibility: "internal",
        escalationLevel: 5,
      }),
    ).rejects.toThrow(/level from 1 to 4/);

    const [problem] = await notes();
    expect(problem).toMatchObject({ escalationLevel: 3, isPinned: true });
    const open = problemStatus({
      venueId,
      notes: await notes(),
      contacts: [],
      now: Date.now(),
      formatDate: String,
    });
    expect(open.open).toHaveLength(1);
    expect(open.open[0]?.level).toBe(3);

    await proof.executeCommand(staff, M.VenueNote_closeProblem, {
      docId: problem!._id,
      resolution:
        "Old commitment from before our partnership; manager met the owner, no repeat.",
    });
    const [closed] = await notes();
    expect(closed).toMatchObject({
      isPinned: false,
      resolution:
        "Old commitment from before our partnership; manager met the owner, no repeat.",
    });
    expect(closed?.resolvedAt).toEqual(expect.any(Number));
    expect(closed?.resolvedByName).toContain("Kayden");

    // Closed level 3: the venue follow-up is owed until a check-in.
    const after = problemStatus({
      venueId,
      notes: await notes(),
      contacts: await notes(),
      now: Date.now(),
      formatDate: String,
    });
    expect(after.open).toEqual([]);
    expect(after.reminders).toHaveLength(1);

    await proof.executeCommand(staff, M.VenueNote_createViaPost, {
      venueId,
      category: "check_in",
      content: "Called Sarah: all good",
      visibility: "internal",
    });
    const checkIn = (await notes()).find(
      (note) => note.category === "check_in",
    )!;
    await expect(
      proof.executeCommand(staff, M.VenueNote_closeProblem, {
        docId: checkIn._id,
        resolution: "Not a problem",
      }),
    ).rejects.toThrow();
    expect(
      problemStatus({
        venueId,
        notes: await notes(),
        contacts: await notes(),
        now: Date.now(),
        formatDate: String,
      }).reminders,
    ).toEqual([]);
  });
});
