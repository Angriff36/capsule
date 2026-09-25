/**
 * Runtime proof (AC-390 proposal slice): one Event.changeHeadcount leaves the
 * accepted proposal untouched (status, guestCount, total, acceptedRevision —
 * the signed document stays as history) and persists exactly one §8.2
 * eventReconciliation receipt for the proposal domain, flagging the
 * accepted proposal as needing a person's change decision. Replaying the
 * same headcount writes no proposal-row diff and no second proposal
 * receipt — and the prior menu receipt still exists exactly once. Proof
 * only — draft auto-refresh is AC-388, not here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  listedProposals,
  proposalFor,
  rolesFor,
  runner,
  seedAcceptedProposal,
  type ProposalRow,
  type Role,
} from "./headcount-proposal-reconciliation.runtime.helpers";
import {
  readEventVersion,
  readReconciliationReceipts,
  type ReceiptOutput,
} from "./single-reconciliation.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type ProposalSnapshot = Pick<
  ProposalRow,
  "_id" | "status" | "guestCount" | "total" | "acceptedRevisionId"
>;

function proposalSnapshot(row: ProposalRow): ProposalSnapshot {
  return {
    _id: row._id,
    status: row.status,
    guestCount: row.guestCount,
    total: row.total,
    acceptedRevisionId: row.acceptedRevisionId,
  };
}

function headcountReceipts(
  receipts: ReceiptOutput[],
  eventId: string,
  domain: "menu" | "proposal",
): ReceiptOutput[] {
  return receipts.filter(
    (row) =>
      row.eventId === eventId &&
      row.triggerType === "EventHeadcountChanged" &&
      row.affectedDomains.length === 1 &&
      row.affectedDomains[0] === domain,
  );
}

function checkpointKeys(receipts: ReceiptOutput[], eventId: string): string[] {
  return receipts
    .filter((row) => row.eventId === eventId)
    .map((row) => row.checkpoint.key)
    .sort((a, b) => a.localeCompare(b));
}

/** Seed event + accepted proposal, then change headcount 40 → 60 (version 1).
 * Proposals are read through the sales role — the generated proposal query
 * filters on salesAccess. */
async function seedAndChange(
  tenantId: string,
  title: string,
): Promise<{
  runEvent: ReturnType<typeof runner>;
  sales: Role;
  events: Role;
  eventId: string;
  proposalId: string;
  acceptedRevisionIdBefore: string | null;
}> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const runEvent = runner(proof, roles.events);
  const { eventId, clientId } = await createPlannedEvent(
    proof,
    tenantId,
    title,
  );
  const proposalId = await seedAcceptedProposal(
    proof,
    tenantId,
    eventId,
    clientId,
  );

  // The seed captures no revision, so acceptance records an honest null —
  // snapshot it BEFORE the headcount change to prove the change never moves it.
  const acceptedRevisionIdBefore = (await proposalFor(roles.sales, eventId))
    .acceptedRevisionId;

  await runEvent(M.Event_changeHeadcount, {
    docId: eventId,
    version: 1,
    newHeadcount: 60,
  });
  return {
    runEvent,
    sales: roles.sales,
    events: roles.events,
    eventId,
    proposalId,
    acceptedRevisionIdBefore,
  };
}

describe("runtime proof: single proposal reconciliation per headcount change (AC-390 slice)", () => {
  it("one headcount change preserves the accepted proposal once with a proposal receipt", async () => {
    const tenantId = "tenant-ac390-proposal-once";
    const s = await seedAndChange(tenantId, "AC-390 proposal once");

    const proposals = await listedProposals(s.sales, s.eventId);
    expect(proposals).toHaveLength(1);
    const proposal = proposals[0]!;
    expect(proposal._id).toBe(s.proposalId);
    expect(proposal.status).toBe("accepted");
    expect(proposal.guestCount).toBe(40);
    expect(proposal.total).toBe(1300);
    expect(proposal.acceptedRevisionId).toBe(s.acceptedRevisionIdBefore);

    const receipts = await readReconciliationReceipts(s.events, tenantId);
    const proposalReceipts = headcountReceipts(receipts, s.eventId, "proposal");
    expect(proposalReceipts).toHaveLength(1);
    const receipt = proposalReceipts[0]!;
    expect(receipt.triggerType).toBe("EventHeadcountChanged");
    expect(receipt.affectedDomains).toEqual(["proposal"]);
    expect(receipt.eventId).toBe(s.eventId);
    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.createdCount).toBe(0);
    expect(receipt.updatedCount).toBe(0);
    expect(receipt.retiredCount).toBe(0);
    expect(receipt.preservedCount).toBe(1);
    expect(receipt.exceptionCount).toBe(0);
    expect(receipt.unresolved).toEqual([
      { code: "proposal_change_required", recordIds: [s.proposalId] },
    ]);
    expect(receipt.checkpoint.state).toBe("complete");

    // The prior menu slice keeps proving: exactly one menu receipt too.
    expect(headcountReceipts(receipts, s.eventId, "menu")).toHaveLength(1);
  });

  it("replaying the same headcount against unchanged proposal input is a no-op", async () => {
    const tenantId = "tenant-ac390-proposal-replay";
    const s = await seedAndChange(tenantId, "AC-390 proposal replay");

    const proposalBefore = await proposalFor(s.sales, s.eventId);
    const snapshotBefore = proposalSnapshot(proposalBefore);
    expect(snapshotBefore.guestCount).toBe(40);
    const receiptsBefore = await readReconciliationReceipts(s.events, tenantId);
    const checkpointsBefore = checkpointKeys(receiptsBefore, s.eventId);

    // The SAME headcount again — a replay, not a change.
    const version = await readEventVersion(s.events, s.eventId);
    await s.runEvent(M.Event_changeHeadcount, {
      docId: s.eventId,
      version,
      newHeadcount: 60,
    });

    const proposalAfter = await proposalFor(s.sales, s.eventId);
    expect(proposalSnapshot(proposalAfter)).toEqual(snapshotBefore);

    const receiptsAfter = await readReconciliationReceipts(s.events, tenantId);
    expect(checkpointKeys(receiptsAfter, s.eventId)).toEqual(checkpointsBefore);
    expect(
      headcountReceipts(receiptsAfter, s.eventId, "proposal"),
    ).toHaveLength(1);
  });
});
