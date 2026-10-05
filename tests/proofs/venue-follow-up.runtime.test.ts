/**
 * Runtime proof: the after-event venue follow-up notes (Venue Partner Playbook
 * section 13). Thank-you, debrief and client feedback are venue notes linked
 * to the event; the client's 1-10 score is kept; a score outside 1-10 is
 * refused with a plain reason; the scorecard reads the score back.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { followUpSteps } from "../../src/features/events/venueFollowUp";
import { partnerScorecard } from "../../src/features/facilities/venuePartnership";
import {
  createEvent,
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
  eventId?: string | null;
  category: string;
  content: string;
  rating?: number | null;
  authorName?: string | null;
  postedAt?: number | null;
  deletedAt?: number | null;
};

describe("runtime proof: venue follow-up notes", () => {
  it("thank-you, debrief and client feedback save against the event; the score is kept and checked", async () => {
    const proof = harness();
    const tenantId = "tenant-venue-follow-up";
    const manager = proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    });
    const rep = await hireStaff(proof, tenantId, "Kayden", "event_staff");
    const repActor = proof.asRole({
      subject: rep.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const venueId = await registerVenue(proof, manager, "Kindred + Co.", 180);
    const eventId = await createEvent(proof, tenantId, "Kindred wedding");

    for (const [category, content, rating] of [
      ["thank_you", "Hey Sarah, thanks for another great event.", undefined],
      ["debrief", "What went well: fast service", undefined],
      ["client_feedback", "Score: 9/10", 9],
    ] as const) {
      await proof.executeCommand(repActor, M.VenueNote_createViaPost, {
        venueId,
        eventId,
        category,
        content,
        visibility: "internal",
        rating,
      });
    }

    await expect(
      proof.executeCommand(repActor, M.VenueNote_createViaPost, {
        venueId,
        eventId,
        category: "client_feedback",
        content: "Score: 11/10",
        visibility: "internal",
        rating: 11,
      }),
    ).rejects.toThrow(/1 to 10/);

    const notes = (await manager.query(
      api.queries.listVenueNote,
      {},
    )) as NoteRow[];
    const mine = notes.filter((note) => note.eventId === eventId);
    expect(mine.map((note) => note.category).sort()).toEqual([
      "client_feedback",
      "debrief",
      "thank_you",
    ]);
    const feedback = mine.find((note) => note.category === "client_feedback")!;
    expect(feedback.rating).toBe(9);
    // The author comes from the signed-in person, not the browser.
    expect(feedback.authorName).toContain("Kayden");

    const now = Date.now();
    const steps = followUpSteps({
      venueId,
      eventId,
      endedAt: now - 3_600_000,
      notes,
      now,
    });
    expect(steps.every((step) => step.done != null)).toBe(true);

    const card = partnerScorecard({
      venue: { _id: venueId },
      events: [],
      notes,
      referralSources: [],
      leads: [],
      now,
    });
    expect(card.clientSatisfaction).toBe(9);
    expect(card.lastContactAt).not.toBeNull();
  });
});
