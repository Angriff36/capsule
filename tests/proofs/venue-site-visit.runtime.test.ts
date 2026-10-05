/**
 * Runtime proof: a site visit (Venue Partner Playbook section 08) saves as a
 * "site_visit" venue note by the signed-in person, pinned when it has
 * concerns, and then counts as the venue's last visit.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  siteVisitDue,
  siteVisitText,
} from "../../src/features/facilities/venueSiteVisit";
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
  isPinned?: boolean | null;
  authorName?: string | null;
  postedAt?: number | null;
  deletedAt?: number | null;
};

describe("runtime proof: venue site visit", () => {
  it("saves the visit pinned with its concerns and makes it the last visit", async () => {
    const proof = harness();
    const tenantId = "tenant-venue-site-visit";
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

    const content = siteVisitText({
      answers: { loadIn: "Ramp at the side door", kitchen: "Warming only" },
      concerns: "One 20A circuit for the whole tent",
    });
    await proof.executeCommand(repActor, M.VenueNote_createViaPost, {
      venueId,
      category: "site_visit",
      content,
      visibility: "internal",
      isPinned: true,
    });

    const notes = (await manager.query(
      api.queries.listVenueNote,
      {},
    )) as NoteRow[];
    const visit = notes.find(
      (note) => note.venueId === venueId && note.category === "site_visit",
    )!;
    expect(visit.content).toBe(
      "Load-in: Ramp at the side door\nKitchen: Warming only\nConcerns: One 20A circuit for the whole tent",
    );
    expect(visit.isPinned).toBe(true);
    expect(visit.authorName).toContain("Kayden");

    const due = siteVisitDue({
      venue: { _id: venueId, partnerTier: "catering_only" },
      events: [],
      notes,
      now: Date.now(),
    });
    expect(due.lastVisitAt).toBe(visit.postedAt);
    expect(due.reasons).toEqual([]);
  });
});
