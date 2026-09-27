/**
 * Runtime proof (PL-AUTH, AC-210 / AC-372 record author identity): who wrote
 * a client conversation note, and who set up or changed a venue supplier
 * record, come from the sign-in, never from the caller.
 *
 * ClientCommunication record used to take the author's name from the
 * browser, so a staff member could log a client call under another person's
 * name ("Added by ..."). VenueVendorRelationship establish / reviseDetails
 * took establishedByPersonId / revisedByPersonId from the caller. Now a
 * supplied name or profile is refused, the note shows the name on the
 * signed-in person's own staff profile (an account with no staff profile is
 * shown as "Staff member"), and the supplier record stores the signed-in
 * person's profile. Synthetic workspaces only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  M,
  createEvent,
  harness,
  hireStaff,
  registerVenue,
} from "./venue-notes.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

describe("runtime proof: records keep the signed-in author (AC-210 / AC-372)", () => {
  it("client conversation notes take the author's name from the sign-in", async () => {
    const proof = harness();
    const tenantId = "tenant-record-author-notes";
    const eventId = await createEvent(proof, tenantId, "Author name proof");
    const writer = await hireStaff(proof, tenantId, "writer", "event_manager");
    const staff = proof.asRole({
      subject: writer.authSubjectId,
      role: "event_manager",
      tenantId,
    });
    const note = {
      eventId,
      occurredAt: Date.UTC(2026, 9, 1, 15, 0),
      medium: "call" as const,
      summary: "Client asked for a later start",
    };

    // A caller can no longer write a note under another person's name.
    expect(
      await refused(() =>
        staff.mutation(M.ClientCommunication_createViaRecord, {
          ...note,
          authorName: "Someone Else",
        } as never),
      ),
    ).toBe(true);

    // Without it (what the client notes screen sends), the note shows the
    // name on the signed-in person's own staff profile.
    const { docId } = (await staff.mutation(
      M.ClientCommunication_createViaRecord,
      note as never,
    )) as { docId: string };
    const row = (await staff.run(async (ctx) =>
      ctx.db.get(docId as never),
    )) as { authorId: string; authorName: string };
    expect(row.authorId).toBe(writer.authSubjectId);
    expect(row.authorName).toBe("Riley writer");

    // An account with no staff profile can still log the call; it is shown
    // as a staff member, never as a name it typed.
    const unlinked = proof.asRole({
      subject: "record-author-unlinked",
      role: "event_manager",
      tenantId,
    });
    const other = (await unlinked.mutation(
      M.ClientCommunication_createViaRecord,
      note as never,
    )) as { docId: string };
    const otherRow = (await unlinked.run(async (ctx) =>
      ctx.db.get(other.docId as never),
    )) as { authorId: string; authorName: string };
    expect(otherRow.authorId).toBe("record-author-unlinked");
    expect(otherRow.authorName).toBe("Staff member");
  });

  it("venue supplier records store the signed-in person as who set up and changed them", async () => {
    const proof = harness();
    const tenantId = "tenant-record-author-vendors";
    const facility = await hireStaff(proof, tenantId, "facility", "admin");
    const someoneElse = await hireStaff(proof, tenantId, "other", "admin");
    const manager = proof.asRole({
      subject: facility.authSubjectId,
      role: "admin",
      tenantId,
    });
    const venueId = await registerVenue(proof, manager, "Supplier hall", 120);
    const vendor = (await proof.executeCommand(
      manager,
      M.Vendor_createViaOnboard,
      { name: "Linen Co", paymentTermsDays: 14 },
    )) as { docId: string };
    const setup = {
      venueId,
      vendorId: vendor.docId,
      category: "linens" as const,
    };

    // A caller can no longer name another person as who set it up.
    expect(
      await refused(() =>
        manager.mutation(M.VenueVendorRelationship_createViaEstablish, {
          ...setup,
          establishedByPersonId: someoneElse.personId,
        } as never),
      ),
    ).toBe(true);

    const { docId } = (await manager.mutation(
      M.VenueVendorRelationship_createViaEstablish,
      setup as never,
    )) as { docId: string };
    const read = async () =>
      (await manager.run(async (ctx) => ctx.db.get(docId as never))) as {
        establishedByPersonId?: string | null;
        revisedByPersonId?: string | null;
        notes?: string | null;
      };
    expect((await read()).establishedByPersonId).toBe(facility.personId);

    // Nor as who changed it.
    expect(
      await refused(() =>
        manager.mutation(M.VenueVendorRelationship_reviseDetails, {
          docId,
          notes: "Changed by someone else",
          revisedByPersonId: someoneElse.personId,
        } as never),
      ),
    ).toBe(true);

    await manager.mutation(M.VenueVendorRelationship_reviseDetails, {
      docId,
      notes: "Delivers to the side door",
    } as never);
    const revised = await read();
    expect(revised.revisedByPersonId).toBe(facility.personId);
    expect(revised.notes).toBe("Delivers to the side door");
  });
});
