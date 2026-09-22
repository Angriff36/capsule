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
import { createClientPortalToken } from "../../convex/lib/clientPortalToken";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  S as FX,
  setupAc317Fixture,
} from "./venue-note-visibility.runtime.helpers";

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

  it("a management_only note is refused to a non-management role and absent from every client-facing projection", async () => {
    const proof = harness();
    const fx = await setupAc317Fixture(proof);

    // The shared proposal is not a blind empty: the client-safe note and the
    // booked venue name come through, and no venue-note marker rides along.
    const shared = (await fx.sales.query(api.shareLinks.getSharedProposal, {
      token: fx.linkId,
    })) as any;
    expect(shared?.ok).toBe(true);
    expect(shared.proposal.notes).toBe(FX.proposalNote);
    expect(shared.proposal.venueName).toBe(fx.venueName);
    const sharedText = JSON.stringify(shared);
    expect(sharedText).not.toContain(FX.internalMarker);
    expect(sharedText).not.toContain(FX.mgmtMarker);

    // The pinned revision snapshot behind that share is equally clean.
    const revisions = (await fx.sales.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: fx.proposalId },
    )) as Array<{ _id: string; snapshot: string }>;
    const revision = revisions.find((row) => row._id === fx.revisionId);
    expect(revision).toBeDefined();
    const snapshotText = JSON.stringify(JSON.parse(revision!.snapshot));
    expect(snapshotText).not.toContain(FX.internalMarker);
    expect(snapshotText).not.toContain(FX.mgmtMarker);

    // The authenticated sales read of the live proposal carries none either.
    const proposal = (await fx.sales.query(api.queries.getProposal, {
      id: fx.proposalId,
    })) as unknown;
    expect(proposal).not.toBeNull();
    const proposalText = JSON.stringify(proposal);
    expect(proposalText).not.toContain(FX.internalMarker);
    expect(proposalText).not.toContain(FX.mgmtMarker);

    // The anonymous client portal projection of the event is clean too, and
    // really resolves the event (control against a null projection).
    const portalToken = await createClientPortalToken({
      eventId: fx.eventId,
      tenantId: FX.tenantId,
    });
    const portal = (await fx.sales.query(api.clientPortal.getEvent, {
      token: portalToken,
    })) as any;
    expect(portal?.event?.title).toBe(fx.eventTitle);
    const portalText = JSON.stringify(portal);
    expect(portalText).not.toContain(FX.internalMarker);
    expect(portalText).not.toContain(FX.mgmtMarker);

    // A sales-only actor (salesAccess, no eventAccess) reads no venue notes:
    // not in the list, not by direct ID for either visibility.
    const salesOnly = proof.asRole({
      subject: `salesonly-${FX.tenantId}`,
      role: "sales_staff",
      tenantId: FX.tenantId,
    });
    expect(
      (await salesOnly.query(api.queries.listVenueNote, {})) as unknown[],
    ).toEqual([]);
    await expect(
      salesOnly.query(api.queries.getVenueNote, { id: fx.internalId }),
    ).resolves.toBeNull();
    await expect(
      salesOnly.query(api.queries.getVenueNote, { id: fx.mgmtId }),
    ).resolves.toBeNull();

    // Non-management event staff keep the internal note but never mgmt-only.
    const staffRows = (await fx.staff.query(
      api.queries.listVenueNote,
      {},
    )) as Array<{
      _id: string;
    }>;
    expect(staffRows.map((row) => row._id)).toContain(fx.internalId);
    expect(staffRows.map((row) => row._id)).not.toContain(fx.mgmtId);
    await expect(
      fx.staff.query(api.queries.getVenueNote, { id: fx.mgmtId }),
    ).resolves.toBeNull();

    // Control: the manager reads both notes with the mgmt content intact.
    const mgrRows = (await fx.manager.query(
      api.queries.listVenueNote,
      {},
    )) as Array<{ _id: string }>;
    expect(mgrRows.map((row) => row._id)).toEqual(
      expect.arrayContaining([fx.internalId, fx.mgmtId]),
    );
    await expect(
      fx.manager.query(api.queries.getVenueNote, { id: fx.mgmtId }),
    ).resolves.toMatchObject({ content: FX.mgmtMarker });
  });
});
