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
 * signed-in person's own staff profile, and every supplier record change
 * (set up, details, status, retire) stores the signed-in person's profile.
 * A sign-in with no staff profile can do neither. An event manager (not only
 * an admin) can load the supplier and contact pickers. Synthetic workspaces
 * only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
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

    // An account with no staff profile has no trusted name, so it cannot log
    // a note at all.
    const unlinked = proof.asRole({
      subject: "record-author-unlinked",
      role: "event_manager",
      tenantId,
    });
    expect(
      await refused(() =>
        unlinked.mutation(M.ClientCommunication_createViaRecord, note as never),
      ),
    ).toBe(true);
  });

  it("venue supplier records store the signed-in person as who set up and changed them", async () => {
    const proof = harness();
    const tenantId = "tenant-record-author-vendors";
    const facility = await hireStaff(
      proof,
      tenantId,
      "facility",
      "event_manager",
    );
    const someoneElse = await hireStaff(
      proof,
      tenantId,
      "other",
      "event_manager",
    );
    // A non-admin event manager: the role the supplier screen is for.
    const manager = proof.asRole({
      subject: facility.authSubjectId,
      role: "event_manager",
      tenantId,
    });
    const colleague = proof.asRole({
      subject: someoneElse.authSubjectId,
      role: "event_manager",
      tenantId,
    });
    const unlinked = proof.asRole({
      subject: "record-author-unlinked-supplier",
      role: "event_manager",
      tenantId,
    });
    const buyer = proof.asRole({
      subject: "record-author-buyer",
      role: "admin",
      tenantId,
    });
    const venueId = await registerVenue(proof, manager, "Supplier hall", 120);
    const vendor = (await proof.executeCommand(
      buyer,
      M.Vendor_createViaOnboard,
      { name: "Linen Co", paymentTermsDays: 14 },
    )) as { docId: string };
    const contact = (await proof.executeCommand(
      buyer,
      M.VendorContact_createViaAdd,
      { vendorId: vendor.docId, name: "Pat Linen" },
    )) as { docId: string };

    // The supplier form's pickers load for the event manager.
    const vendors = (await manager.query(api.queries.listVendor, {})) as {
      _id: string;
    }[];
    expect(vendors.map((v) => v._id)).toContain(vendor.docId);
    const contacts = (await manager.query(
      api.queries.listVendorContact,
      {},
    )) as { _id: string }[];
    expect(contacts.map((c) => c._id)).toContain(contact.docId);

    const setup = {
      venueId,
      vendorId: vendor.docId,
      category: "linens" as const,
      primaryContactId: contact.docId,
    };

    // A sign-in with no staff profile cannot set one up.
    expect(
      await refused(() =>
        unlinked.mutation(
          M.VenueVendorRelationship_createViaEstablish,
          setup as never,
        ),
      ),
    ).toBe(true);

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

    // A sign-in with no staff profile cannot change it, so it can never
    // inherit the last person's name.
    expect(
      await refused(() =>
        unlinked.mutation(M.VenueVendorRelationship_reviseDetails, {
          docId,
          notes: "Changed with no profile",
        } as never),
      ),
    ).toBe(true);
    expect(
      await refused(() =>
        unlinked.mutation(M.VenueVendorRelationship_reviseStatus, {
          docId,
          status: "preferred",
        } as never),
      ),
    ).toBe(true);
    expect((await read()).revisedByPersonId).toBe(facility.personId);

    // A status change names the person who made it.
    await colleague.mutation(M.VenueVendorRelationship_reviseStatus, {
      docId,
      status: "preferred",
    } as never);
    expect((await read()).revisedByPersonId).toBe(someoneElse.personId);

    // Retiring it does too.
    await manager.mutation(M.VenueVendorRelationship_retire, {
      docId,
      reason: "Venue changed linen supplier",
    } as never);
    const retired = (await read()) as { revisedByPersonId?: string | null };
    expect(retired.revisedByPersonId).toBe(facility.personId);
  });
});
