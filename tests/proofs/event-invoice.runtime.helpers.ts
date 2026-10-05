/**
 * Shared seed for the event draft-invoice proofs (AC-087, AC-182, AC-618):
 * a workspace owner, plain events at a chosen quoted price, and an accepted
 * proposal booked onto an event. Flow follows
 * proposal-projection-agreement.runtime.test.ts.
 */
import { convexTest } from "convex-test";
import { expect } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { linkStaffProfile } from "./reconciliation-failure-isolation.runtime.helpers";
import { proposalEventPrefill } from "../../src/features/events/ProposalEventPrefill";

export const M = api.mutations;

export function harness() {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}
export type Proof = ReturnType<typeof harness>;
export type Actor = ReturnType<Proof["asRole"]>;

export async function ownerOf(proof: Proof, tenantId: string, subject: string) {
  const owner = proof.asRole({ subject, role: "owner", tenantId });
  await linkStaffProfile(proof, tenantId, subject);
  return owner;
}

export async function newClient(proof: Proof, owner: Actor, name: string) {
  const client = (await proof.executeCommand(
    owner,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: name,
    },
  )) as { docId: string };
  return client.docId;
}

const STARTS = Date.parse("2026-10-01T18:00:00Z");
export async function plainEvent(
  proof: Proof,
  owner: Actor,
  clientId: string,
  title: string,
  quotedPrice: number,
) {
  const event = (await proof.executeCommand(
    owner,
    M.Event_createViaPlanEngagement,
    {
      clientId,
      title,
      eventType: "corporate dinner",
      venueName: "Proof Hall",
      serviceStyleName: "Plated",
      startsAt: STARTS,
      endsAt: STARTS + 4 * 3600_000,
      expectedHeadcount: 40,
      primaryContactName: "Casey Invoice",
      budgetAmount: 0,
      quotedPrice,
    },
  )) as { docId: string };
  return event.docId;
}

export async function liveVersion(owner: Actor, id: string) {
  return (
    (await owner.run(async (ctx) => ctx.db.get(id as never))) as {
      version: number;
    }
  ).version;
}

/** Submit then approve, each with the event's live version. */
export async function approve(proof: Proof, owner: Actor, eventId: string) {
  await proof.executeCommand(owner, M.Event_submitForApproval, {
    docId: eventId,
    version: await liveVersion(owner, eventId),
  });
  await proof.executeCommand(owner, M.Event_approve, {
    docId: eventId,
    version: await liveVersion(owner, eventId),
  });
}

export async function invoicesOf(owner: Actor, tenantId: string) {
  return (
    (await owner.run(async (ctx) =>
      ctx.db.query("invoices").collect(),
    )) as any[]
  ).filter((row) => row.tenantId === tenantId && row.deletedAt == null);
}

/** Draft proposal → send (captures revision) → accept → book the event from it. */
export async function acceptedProposalEvent(
  proof: Proof,
  owner: Actor,
  title: string,
) {
  const clientId = await newClient(proof, owner, `${title} client`);
  await owner.mutation((api.lib as any).proposalDraft.draftProposalWithLines, {
    clientId,
    title,
    guestCount: 10,
    subtotal: 600,
    taxAmount: 0,
    discountAmount: 0,
    total: 600,
    eventDate: STARTS,
    eventEndDate: STARTS + 4 * 3600_000,
    eventType: "gala dinner",
    venueName: "Riverside Hall",
    lines: [
      {
        description: "Plated dinner",
        pricingBasis: "per_person",
        unitPrice: 60,
        quantity: 1,
      },
    ],
  });
  const proposal = (
    (await owner.query(api.queries.listProposal, {})) as any[]
  ).find((p) => p.title === title);
  await owner.mutation(
    (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
    {
      docId: proposal._id,
      version: proposal.version,
    },
  );
  const revisions = (await owner.query(
    api.queries.listProposalRevisionByProposalId,
    {
      proposalId: proposal._id,
    },
  )) as any[];
  expect(revisions).toHaveLength(1);
  await proof.executeCommand(owner, M.Proposal_accept, { docId: proposal._id });
  const accepted = (
    (await owner.query(api.queries.listProposal, {})) as any[]
  ).find((p) => p._id === proposal._id);
  const prefill = proposalEventPrefill.values(accepted);
  const booked = (await proof.executeCommand(
    owner,
    api.lib.proposalEventCreation.createEventFromAcceptedProposal,
    {
      proposalId: proposal._id,
      event: {
        clientId,
        title: accepted.title,
        eventType: accepted.eventType,
        startsAt: accepted.eventDate,
        endsAt: accepted.eventEndDate,
        expectedHeadcount: accepted.guestCount,
        primaryContactName: "Casey Contact",
        budgetAmount: 0,
        quotedPrice: prefill.quotedPrice,
        venueName: accepted.venueName,
      },
    },
  )) as { docId: string };
  return {
    clientId,
    proposalId: proposal._id as string,
    revisionId: revisions[0]._id as string,
    eventId: booked.docId,
    quotedPrice: prefill.quotedPrice as number,
  };
}
