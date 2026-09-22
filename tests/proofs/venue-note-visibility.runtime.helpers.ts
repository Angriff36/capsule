/**
 * Setup-only helpers for the AC-317 client-facing venue-note proof. Extracted
 * so the proof file stays under the ~400-line rule. No assertion logic lives
 * here — every fixture is built from real governed commands, mirroring
 * venue-notes.runtime.helpers.ts and the proposal publication proof.
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

export const S = {
  tenantId: "tenant-ac317-client-facing",
  staffLabel: "ac317crew",
  managerLabel: "ac317mgr",
  venueName: "Ridgeline Barn",
  eventTitle: "AC317 Harvest Dinner",
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
  internalMarker: "AC317-INTERNAL-NOTE-DOCK-CODE-9f3a",
  mgmtMarker: "AC317-MGMT-NOTE-RATE-HISTORY-4c21",
  proposalNote: "Client-facing proposal note",
} as const;

export const M = api.mutations;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

export type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

type Proof = ReturnType<typeof harness>;

async function hireStaff(
  proof: Proof,
  label: string,
  personRole: "event_staff" | "event_manager",
) {
  const authSubjectId = `user_${S.tenantId}_${label}`;
  const manager = proof.asRole({
    subject: `workforce-${S.tenantId}-${label}`,
    role: "workforce_manager",
    tenantId: S.tenantId,
  });
  const person = (await proof.executeCommand(manager, M.Person_createViaHire, {
    givenName: "Riley",
    familyName: label,
    email: `riley-${label}@proof.example`,
    role: personRole,
    employmentType: "full_time",
  })) as { docId: string };
  await proof.executeCommand(manager, M.Person_linkAccount, {
    docId: person.docId,
    authSubjectId,
  });
  return { personId: person.docId, authSubjectId };
}

async function postNote(
  proof: Proof,
  actor: Actor,
  venueId: string,
  authorPersonId: string,
  authorName: string,
  visibility: "internal" | "management_only",
  content: string,
) {
  const created = (await proof.executeCommand(
    actor,
    M.VenueNote_createViaPost,
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

/** Hire the staff + manager people and build the three acting roles. */
async function hireActors(proof: Proof) {
  const staffHire = await hireStaff(proof, S.staffLabel, "event_staff");
  const staff = proof.asRole({
    subject: staffHire.authSubjectId,
    role: "event_staff",
    tenantId: S.tenantId,
  });
  const mgrHire = await hireStaff(proof, S.managerLabel, "event_manager");
  const manager = proof.asRole({
    subject: mgrHire.authSubjectId,
    role: "event_manager",
    tenantId: S.tenantId,
  });
  const sales = proof.asRole({
    subject: `sales-${S.tenantId}`,
    role: "sales_manager",
    tenantId: S.tenantId,
  });
  return {
    staffHirePersonId: staffHire.personId,
    mgrHirePersonId: mgrHire.personId,
    staff,
    manager,
    sales,
  };
}

/** Register the venue under the manager. */
async function registerVenue(proof: Proof, manager: Actor) {
  const venue = (await proof.executeCommand(
    manager,
    M.Venue_createViaRegister,
    {
      name: S.venueName,
      venueType: "other" as const,
      capacity: 120,
    },
  )) as { docId: string };
  return venue.docId;
}

/** Register the client and plan the engagement at the venue. */
async function registerClientAndEvent(
  proof: Proof,
  sales: Actor,
  venueId: string,
) {
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: "AC317 Proof Client",
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      venueId,
      venueName: S.venueName,
      title: S.eventTitle,
      eventType: "catering",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 80,
      primaryContactName: "Casey AC317",
      budgetAmount: 6000,
      quotedPrice: 7500,
    },
  )) as { docId: string };
  return { clientId: client.docId, eventId: event.docId };
}

/** Register the venue, the client, and the engagement that ties them together. */
async function registerVenueAndEvent(
  proof: Proof,
  manager: Actor,
  sales: Actor,
) {
  const venueId = await registerVenue(proof, manager);
  const { clientId, eventId } = await registerClientAndEvent(
    proof,
    sales,
    venueId,
  );
  return { venueId, clientId, eventId };
}

/** Post the two marker notes: staff-internal, then management-only. */
async function postMarkerNotes(
  proof: Proof,
  staff: Actor,
  manager: Actor,
  venueId: string,
  staffPersonId: string,
  mgrPersonId: string,
) {
  const internalId = await postNote(
    proof,
    staff,
    venueId,
    staffPersonId,
    "Riley Ac317crew",
    "internal",
    S.internalMarker,
  );
  const mgmtId = await postNote(
    proof,
    manager,
    venueId,
    mgrPersonId,
    "Riley Ac317mgr",
    "management_only",
    S.mgmtMarker,
  );
  return { internalId, mgmtId };
}

/** Draft the proposal for the event and return it with its version. */
async function draftProposal(sales: Actor, clientId: string, eventId: string) {
  await sales.mutation((api.lib as any).proposalDraft.draftProposalWithLines, {
    clientId,
    eventId,
    title: S.eventTitle,
    venueName: S.venueName,
    guestCount: 80,
    subtotal: 6000,
    taxAmount: 0,
    discountAmount: 0,
    total: 6000,
    expiresAt: Date.UTC(2026, 10, 1),
    notes: S.proposalNote,
    terms: "Net 14",
    visibleSections: ["pricing_summary", "terms"],
    lines: [
      {
        description: "Harvest dinner",
        pricingBasis: "flat",
        unitPrice: 6000,
        quantity: 1,
      },
    ],
  });
  const proposals = (await sales.query(api.queries.listProposal, {})) as any[];
  return proposals[0];
}

/** Send the proposal, capture the revision, and create its share link. */
async function publishAndLinkProposal(
  proof: Proof,
  sales: Actor,
  proposal: any,
) {
  await sales.mutation(
    (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
    { docId: proposal._id, version: proposal.version },
  );
  const revisions = (await sales.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId: proposal._id },
  )) as any[];
  const revision = revisions[0];
  const link = (await proof.executeCommand(sales, M.ShareLink_create, {
    proposalId: proposal._id,
    proposalRevisionId: revision._id,
  })) as { _id: string };
  return {
    proposalId: proposal._id as string,
    revisionId: revision._id as string,
    linkId: link._id as string,
  };
}

/** Send and share the drafted proposal so a client portal link exists. */
async function publishSharedProposal(
  proof: Proof,
  sales: Actor,
  clientId: string,
  eventId: string,
) {
  const proposal = await draftProposal(sales, clientId, eventId);
  return publishAndLinkProposal(proof, sales, proposal);
}

/** Build the whole AC-317 fixture: roles, venue, event, notes, shared proposal. */
export async function setupAc317Fixture(proof: Proof) {
  const actors = await hireActors(proof);
  const { venueId, clientId, eventId } = await registerVenueAndEvent(
    proof,
    actors.manager,
    actors.sales,
  );
  const { internalId, mgmtId } = await postMarkerNotes(
    proof,
    actors.staff,
    actors.manager,
    venueId,
    actors.staffHirePersonId,
    actors.mgrHirePersonId,
  );
  const { proposalId, revisionId, linkId } = await publishSharedProposal(
    proof,
    actors.sales,
    clientId,
    eventId,
  );

  return {
    staff: actors.staff,
    manager: actors.manager,
    sales: actors.sales,
    eventId: eventId as string,
    eventTitle: S.eventTitle,
    venueName: S.venueName,
    internalId,
    mgmtId,
    proposalId,
    revisionId,
    linkId,
  };
}
