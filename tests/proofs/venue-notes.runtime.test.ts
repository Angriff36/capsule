/**
 * Runtime proof (AC-316): a VenueNote binds to a venue, optionally to an
 * event, and carries author, time, category, pin, visibility, and an
 * archive/removal path. A note posts, pins, revises, and only its author or
 * an admin removes it — a peer or a manager without adminAccess cannot.
 * Removal is a soft delete: the raw row keeps its venue, event, and content.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  M,
  createEvent,
  harness,
  hireStaff,
  noteLedger,
  postNote,
  rawNote,
  readNote,
  registerVenue,
} from "./venue-notes.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: venue note post/pin/revise/remove (AC-316)", () => {
  it("posts a note bound to a venue and optional event with author, time, category, and visibility", async () => {
    const proof = harness();
    const tenantId = "tenant-ac316-post";

    const authorHire = await hireStaff(
      proof,
      tenantId,
      "author",
      "event_staff",
    );
    const staff = proof.asRole({
      subject: authorHire.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const manager = proof.asRole({
      subject: `venue-registrar-${tenantId}`,
      role: "event_manager",
      tenantId,
    });

    const venueId = await registerVenue(proof, manager, "Garden Hall", 80);
    const eventId = await createEvent(proof, tenantId, "AC-316 venue note");

    const noteId = await postNote(
      proof,
      staff,
      venueId,
      authorHire.personId,
      "Riley Author",
      "Dock is on the alley",
      {
        eventId,
        category: "logistics",
        visibility: "internal",
      },
    );

    const posted = await readNote(staff, noteId);
    expect(posted.venueId).toBe(venueId);
    expect(posted.eventId).toBe(eventId);
    expect(posted.authorPersonId).toBe(authorHire.personId);
    expect(posted.authorName).toBe("Riley Author");
    expect(posted.category).toBe("logistics");
    expect(posted.content).toBe("Dock is on the alley");
    expect(posted.visibility).toBe("internal");
    expect(posted.isPinned).toBe(false);
    expect(posted.postedAt).toEqual(expect.any(Number));
    expect(posted.postedAt as unknown as number).toBeGreaterThan(0);
    expect(posted.deletedAt).toBeNull();

    // Pin, then exactly one pinned ledger row for this note.
    await proof.executeCommand(staff, M.VenueNote_pin, {
      docId: noteId,
      version: posted.version,
    });
    expect((await readNote(staff, noteId)).isPinned).toBe(true);
    expect(await noteLedger(staff, noteId, "VenueNotePinned")).toHaveLength(1);

    // Revise content, category, and visibility in one pass.
    await proof.executeCommand(staff, M.VenueNote_revise, {
      docId: noteId,
      content: "Dock is on the alley; code 4411",
      category: "access" as const,
      visibility: "public" as const,
      version: (await readNote(staff, noteId)).version,
    });
    const revised = await readNote(staff, noteId);
    expect(revised.content).toBe("Dock is on the alley; code 4411");
    expect(revised.category).toBe("access");
    expect(revised.visibility).toBe("public");
    expect(await noteLedger(staff, noteId, "VenueNoteRevised")).toHaveLength(1);

    // The author removes: soft delete, archive not wipe.
    await proof.executeCommand(staff, M.VenueNote_remove, {
      docId: noteId,
      version: revised.version,
    });
    const listed = (await staff.query(api.queries.listVenueNote, {})) as Array<{
      _id: string;
    }>;
    expect(listed.map((row) => row._id)).not.toContain(noteId);

    const removed = await rawNote(staff, noteId);
    expect(removed.deletedAt).toEqual(expect.any(Number));
    expect(removed.deletedAt as unknown as number).toBeGreaterThan(0);
    expect(removed.venueId).toBe(venueId);
    expect(removed.eventId).toBe(eventId);
    expect(removed.content).toBe("Dock is on the alley; code 4411");
    expect(await noteLedger(staff, noteId, "VenueNoteRemoved")).toHaveLength(1);
  });

  it("only the author or an admin can remove a posted note", async () => {
    const proof = harness();
    const tenantId = "tenant-ac316-remove";

    const authorHire = await hireStaff(
      proof,
      tenantId,
      "author",
      "event_staff",
    );
    const peerHire = await hireStaff(proof, tenantId, "peer", "event_staff");
    const mgrHire = await hireStaff(
      proof,
      tenantId,
      "coordinator",
      "event_manager",
    );
    const adminHire = await hireStaff(proof, tenantId, "boss", "admin");

    const author = proof.asRole({
      subject: authorHire.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const peer = proof.asRole({
      subject: peerHire.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const manager = proof.asRole({
      subject: mgrHire.authSubjectId,
      role: "event_manager",
      tenantId,
    });
    const admin = proof.asRole({
      subject: adminHire.authSubjectId,
      role: "admin",
      tenantId,
    });

    const venueId = await registerVenue(proof, manager, "Peer proof hall", 60);
    const noteA = await postNote(
      proof,
      author,
      venueId,
      authorHire.personId,
      "Riley Author",
      "Side gate sticks",
    );
    const noteB = await postNote(
      proof,
      author,
      venueId,
      authorHire.personId,
      "Riley Author",
      "Elevator needs a key",
    );

    // A peer without authorship cannot remove.
    await expect(
      proof.executeCommand(peer, M.VenueNote_remove, {
        docId: noteA,
        version: (await rawNote(peer, noteA)).version,
      }),
    ).rejects.toThrow(/Guard/);
    expect((await rawNote(peer, noteA)).deletedAt).toBeNull();

    // manageAccess alone is not adminAccess: the manager cannot remove either.
    await expect(
      proof.executeCommand(manager, M.VenueNote_remove, {
        docId: noteA,
        version: (await rawNote(manager, noteA)).version,
      }),
    ).rejects.toThrow(/Guard/);
    expect((await rawNote(manager, noteA)).deletedAt).toBeNull();

    // The author removes note A; note B stays.
    await proof.executeCommand(author, M.VenueNote_remove, {
      docId: noteA,
      version: (await rawNote(author, noteA)).version,
    });
    let listed = (await author.query(api.queries.listVenueNote, {})) as Array<{
      _id: string;
    }>;
    expect(listed.map((row) => row._id)).toEqual([noteB]);

    // Admin (adminAccess + linked Person) removes note B.
    await proof.executeCommand(admin, M.VenueNote_remove, {
      docId: noteB,
      version: (await rawNote(admin, noteB)).version,
    });
    listed = (await admin.query(api.queries.listVenueNote, {})) as Array<{
      _id: string;
    }>;
    expect(listed).toEqual([]);
  });

  it("refuses empty content and writes no note", async () => {
    const proof = harness();
    const tenantId = "tenant-ac316-empty";

    const authorHire = await hireStaff(
      proof,
      tenantId,
      "author",
      "event_staff",
    );
    const staff = proof.asRole({
      subject: authorHire.authSubjectId,
      role: "event_staff",
      tenantId,
    });
    const manager = proof.asRole({
      subject: `venue-registrar-${tenantId}`,
      role: "event_manager",
      tenantId,
    });
    const venueId = await registerVenue(proof, manager, "Empty proof hall", 30);

    await expect(
      proof.executeCommand(staff, M.VenueNote_createViaPost, {
        venueId,
        authorPersonId: authorHire.personId,
        authorName: "Riley Author",
        category: "other" as const,
        content: "",
      }),
    ).rejects.toThrow("Write something in this note.");
    await expect(
      proof.executeCommand(staff, M.VenueNote_createViaPost, {
        venueId,
        authorPersonId: authorHire.personId,
        authorName: "Riley Author",
        category: "other" as const,
        content: "   ",
      }),
    ).rejects.toThrow("Write something in this note.");

    expect(
      (await staff.query(api.queries.listVenueNote, {})) as unknown[],
    ).toEqual([]);

    // Refusal is the constraint, not a freeze: a valid post still works.
    const noteId = await postNote(
      proof,
      staff,
      venueId,
      authorHire.personId,
      "Riley Author",
      "Gate code changed to 7712",
    );
    expect((await readNote(staff, noteId)).content).toBe(
      "Gate code changed to 7712",
    );
  });
});
