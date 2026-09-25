/**
 * Shared harness for the AC-390 proposal-reconciliation runtime proof: roles,
 * the planned-event seed, and a real-command accepted proposal (draft → send
 * → accept) plus readers for the live proposals. Assertion-free; the test
 * file owns every expect().
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

export const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
  headcount: 40,
} as const;

export function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

export type Proof = ReturnType<typeof harness>;
export type Role = ReturnType<Proof["asRole"]>;
export type Cmd = Parameters<Proof["executeCommand"]>[1];

/** A command runner bound to one actor, for terse seed/step calls. */
export function runner(proof: Proof, role: Role) {
  return async (cmd: Cmd, args: Record<string, unknown>) =>
    (await proof.executeCommand(role, cmd, args as never)) as {
      docId: string;
    };
}

export function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role } {
  return {
    sales: proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    }),
    events: proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    }),
  };
}

/** Company client + planned Event at the 40-guest seed headcount. */
export async function createPlannedEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; clientId: string }> {
  const run = runner(proof, rolesFor(proof, tenantId).sales);
  const client = await run(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: `Proposal survival client ${tenantId} ${title}`,
  });
  const event = await run(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.headcount,
    primaryContactName: "Casey Closesheet",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
  return { eventId: event.docId, clientId: client.docId };
}

/** One accepted proposal linked to the event (real commands only: draft →
 * send → accept; the draft already carries the eventId). Returns the id. */
export async function seedAcceptedProposal(
  proof: Proof,
  tenantId: string,
  eventId: string,
  clientId: string,
): Promise<string> {
  const run = runner(proof, rolesFor(proof, tenantId).sales);
  const proposal = await run(api.mutations.Proposal_createViaDraft, {
    clientId,
    title: "AC-390 proposal " + tenantId,
    subtotal: 1200,
    taxAmount: 100,
    discountAmount: 0,
    total: 1300,
    guestCount: 40,
    eventId,
  });
  await run(api.mutations.Proposal_send, { docId: proposal.docId });
  await run(api.mutations.Proposal_accept, { docId: proposal.docId });
  return proposal.docId;
}

export type ProposalRow = {
  _id: string;
  eventId: string | null;
  status: string;
  guestCount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  acceptedRevisionId: string | null;
  version: number;
  deletedAt: number | null;
};

/** Live (not deleted) proposals linked to one event, sorted by id. The actor
 * needs salesAccess (the generated query filters on it). */
export function listedProposals(
  actor: Role,
  eventId: string,
): Promise<ProposalRow[]> {
  return actor
    .query(api.queries.listProposalByEventId, { eventId })
    .then((rows) =>
      (rows as unknown as ProposalRow[])
        .filter((row) => row.deletedAt == null)
        .sort((a, b) => a._id.localeCompare(b._id)),
    );
}

/** The one live linked proposal, or a thrown error. */
export async function proposalFor(
  actor: Role,
  eventId: string,
): Promise<ProposalRow> {
  const rows = await listedProposals(actor, eventId);
  if (rows.length !== 1) {
    throw new Error(
      `Expected one live proposal for event ${eventId}, found ${rows.length}`,
    );
  }
  return rows[0]!;
}
