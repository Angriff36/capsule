/**
 * Issue #385: VenueNote.management_only is enforced at the canonical read
 * policy. Ordinary event staff keep reading public/internal operational
 * notes; management-only content comes back only to eventAccess holders
 * that also carry manageAccess (event managers, admins, owner). Foreign
 * tenants stay empty.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantA: "tenant-venue-a",
  tenantB: "tenant-venue-b",
} as const;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function hireStaff(
  proof: ReturnType<typeof harness>,
  tenantId: string,
  label: string,
  personRole: "event_staff" | "event_manager",
) {
  const authSubjectId = `user_${tenantId}_${label}`;
  const manager = proof.asRole({
    subject: `workforce-${tenantId}-${label}`,
    role: "workforce_manager",
    tenantId,
  });
  const person = (await proof.executeCommand(
    manager,
    api.mutations.Person_createViaHire,
    {
      givenName: "Riley",
      familyName: label,
      email: `riley-${label}-${tenantId}@proof.example`,
      role: personRole,
      employmentType: "full_time",
    },
  )) as { docId: string };
  await proof.executeCommand(manager, api.mutations.Person_linkAccount, {
    docId: person.docId,
    authSubjectId,
  });
  return { personId: person.docId, authSubjectId };
}

async function postNote(
  proof: ReturnType<typeof harness>,
  actor: Actor,
  venueId: string,
  authorPersonId: string,
  authorName: string,
  visibility: "public" | "internal" | "management_only",
  content: string,
) {
  const created = (await proof.executeCommand(
    actor,
    api.mutations.VenueNote_createViaPost,
    {
      venueId,
      authorPersonId,
      authorName,
      category: "access" as const,
      content,
      visibility,
    },
  )) as { docId: string };
  return created.docId;
}

describe("runtime proof: venue note visibility read policy (#385)", () => {
  it("hides management_only notes from ordinary staff, shows them to managers, keeps tenants apart", async () => {
    const proof = harness();

    const staffHire = await hireStaff(proof, S.tenantA, "crew", "event_staff");
    const staff = proof.asRole({
      subject: staffHire.authSubjectId,
      role: "event_staff",
      tenantId: S.tenantA,
    });
    const mgrHire = await hireStaff(
      proof,
      S.tenantA,
      "coordinator",
      "event_manager",
    );
    const manager = proof.asRole({
      subject: mgrHire.authSubjectId,
      role: "event_manager",
      tenantId: S.tenantA,
    });

    const venue = (await proof.executeCommand(
      manager,
      api.mutations.Venue_createViaRegister,
      {
        name: "Proof venue",
        venueType: "other" as const,
        capacity: 100,
      },
    )) as { docId: string };
    const venueId = venue.docId;

    const publicId = await postNote(
      proof,
      staff,
      venueId,
      staffHire.personId,
      "Riley Crew",
      "public",
      "Street parking fills before 5pm",
    );
    const internalId = await postNote(
      proof,
      staff,
      venueId,
      staffHire.personId,
      "Riley Crew",
      "internal",
      "Loading dock opens at 6am",
    );
    const mgmtId = await postNote(
      proof,
      manager,
      venueId,
      mgrHire.personId,
      "Robin Coordinator",
      "management_only",
      "Rate negotiation history for the venue owner",
    );

    // Ordinary staff read the operational notes on every list path.
    const staffRows = (await staff.query(
      api.queries.listVenueNote,
      {},
    )) as Array<{
      _id: string;
      visibility: string;
    }>;
    expect(staffRows.map((row) => row._id).sort()).toEqual(
      [publicId, internalId].sort(),
    );
    const byVenue = (await staff.query(api.queries.listVenueNoteByVenueId, {
      venueId,
    })) as Array<{ _id: string }>;
    expect(byVenue.map((row) => row._id).sort()).toEqual(
      [publicId, internalId].sort(),
    );

    // But never management-only content: not in a list, not by direct ID.
    expect(staffRows.map((row) => row._id)).not.toContain(mgmtId);
    await expect(
      staff.query(api.queries.getVenueNote, { id: mgmtId }),
    ).resolves.toBeNull();

    // No blanket denial: permitted notes still read by direct ID.
    await expect(
      staff.query(api.queries.getVenueNote, { id: internalId }),
    ).resolves.toMatchObject({ visibility: "internal" });

    // Managers (eventAccess + manageAccess) see everything.
    const mgrRows = (await manager.query(
      api.queries.listVenueNote,
      {},
    )) as Array<{ _id: string }>;
    expect(mgrRows.map((row) => row._id).sort()).toEqual(
      [publicId, internalId, mgmtId].sort(),
    );
    await expect(
      manager.query(api.queries.getVenueNote, { id: mgmtId }),
    ).resolves.toMatchObject({ visibility: "management_only" });

    // Foreign tenants see none of tenant A's notes.
    const outsiderHire = await hireStaff(
      proof,
      S.tenantB,
      "outsider",
      "event_staff",
    );
    const outsider = proof.asRole({
      subject: outsiderHire.authSubjectId,
      role: "event_manager",
      tenantId: S.tenantB,
    });
    expect(
      (await outsider.query(api.queries.listVenueNote, {})) as unknown[],
    ).toEqual([]);
    await expect(
      outsider.query(api.queries.getVenueNote, { id: mgmtId }),
    ).resolves.toBeNull();
  });
});
