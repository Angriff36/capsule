/**
 * Runtime proof (AC-388 proposal draft slice): after Event.changeHeadcount an
 * unsent draft proposal still sized for the event's old count follows the new
 * count through Proposal.followEventHeadcount, priced by the central calc
 * (per-person lines scale, flat lines and tax stay). The change is made by an
 * event manager, who has no sales access. A draft a person sized differently
 * keeps its count and is flagged proposal_review; sent, viewed and accepted
 * proposals are never rewritten and are flagged proposal_change_required.
 * One proposal receipt per input shape; replay is a no-op, and a proposal
 * added since an earlier visit to the same count still gets its flag.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  listedProposals,
  rolesFor,
  runner,
  seedAcceptedProposal,
  type Proof,
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

// 30 per guest + a 200 flat setup fee, 50 tax: 40 guests = 1400 / 1450.
const LINES = [
  {
    description: "Dinner per guest",
    pricingBasis: "per_person",
    unitPrice: 30,
  },
  { description: "Setup fee", pricingBasis: "flat", unitPrice: 200 },
];

type Setup = {
  proof: Proof;
  sales: Role;
  events: Role;
  runEvent: ReturnType<typeof runner>;
  eventId: string;
  clientId: string;
};

async function setup(tenantId: string): Promise<Setup> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const created = await createPlannedEvent(
    proof,
    tenantId,
    "AC-388 " + tenantId,
  );
  return {
    proof,
    sales: roles.sales,
    events: roles.events,
    runEvent: runner(proof, roles.events),
    eventId: created.eventId,
    clientId: created.clientId,
  };
}

/** A priced draft linked to the event, made through the central draft path. */
async function seedDraft(
  s: Setup,
  title: string,
  guestCount: number,
): Promise<string> {
  const before = new Set(
    (await listedProposals(s.sales, s.eventId)).map((row) => row._id),
  );
  await s.sales.mutation(
    (api.lib as any).proposalDraft.draftProposalWithLines,
    {
      clientId: s.clientId,
      title,
      guestCount,
      subtotal: 0,
      taxAmount: 50,
      discountAmount: 0,
      total: 0,
      eventId: s.eventId,
      lines: LINES,
    },
  );
  const created = (await listedProposals(s.sales, s.eventId)).filter(
    (row) => !before.has(row._id),
  );
  if (created.length !== 1)
    throw new Error("Expected one new draft, found " + created.length);
  return created[0]!._id;
}

async function changeHeadcount(s: Setup, newHeadcount: number): Promise<void> {
  const version = await readEventVersion(s.events, s.eventId);
  await s.runEvent(M.Event_changeHeadcount, {
    docId: s.eventId,
    version,
    newHeadcount,
  });
}

async function proposalById(s: Setup, id: string): Promise<ProposalRow> {
  const row = (await listedProposals(s.sales, s.eventId)).find(
    (p) => p._id === id,
  );
  if (!row) throw new Error("Proposal " + id + " not found");
  return row;
}

async function lineAmounts(
  s: Setup,
  proposalId: string,
): Promise<Record<string, number>> {
  const rows = (await s.sales.query(
    api.queries.listProposalLineItemByProposalId,
    {
      proposalId,
    },
  )) as Array<{
    description: string;
    amount: number;
    deletedAt: number | null;
  }>;
  const map: Record<string, number> = {};
  for (const row of rows)
    if (row.deletedAt == null) map[row.description] = row.amount;
  return map;
}

async function proposalReceipts(
  s: Setup,
  tenantId: string,
): Promise<ReceiptOutput[]> {
  return (await readReconciliationReceipts(s.events, tenantId)).filter(
    (row) =>
      row.eventId === s.eventId &&
      row.triggerType === "EventHeadcountChanged" &&
      row.affectedDomains.length === 1 &&
      row.affectedDomains[0] === "proposal",
  );
}

/** Flags keyed by proposal id, so the order they were written in does not matter. */
function flagsById(receipt: ReceiptOutput): Record<string, string> {
  const map: Record<string, string> = {};
  for (const flag of receipt.unresolved)
    for (const id of flag.recordIds) map[id] = flag.code;
  return map;
}

describe("runtime proof: draft proposal follows the event guest count (AC-388 proposal draft slice)", () => {
  it("an untouched draft follows 40 to 60 with one receipt, priced by the central calc", async () => {
    const tenantId = "tenant-ac388-draft-follow";
    const s = await setup(tenantId);
    const draftId = await seedDraft(s, "Draft follows", 40);
    const before = await proposalById(s, draftId);
    expect(before.subtotal).toBe(1400);
    expect(before.total).toBe(1450);

    await changeHeadcount(s, 60);

    const after = await proposalById(s, draftId);
    expect(after.status).toBe("draft");
    expect(after.guestCount).toBe(60);
    expect(after.subtotal).toBe(2000);
    expect(after.taxAmount).toBe(50);
    expect(after.total).toBe(2050);
    expect(await lineAmounts(s, draftId)).toEqual({
      "Dinner per guest": 1800,
      "Setup fee": 200,
    });

    const receipts = await proposalReceipts(s, tenantId);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.updatedCount).toBe(1);
    expect(receipts[0]!.preservedCount).toBe(0);
    expect(receipts[0]!.unresolved).toEqual([]);
  });

  it("replaying the same count changes nothing and writes no second receipt", async () => {
    const tenantId = "tenant-ac388-draft-replay";
    const s = await setup(tenantId);
    const draftId = await seedDraft(s, "Draft replay", 40);
    await changeHeadcount(s, 60);
    const once = await proposalById(s, draftId);

    await changeHeadcount(s, 60);

    const twice = await proposalById(s, draftId);
    expect(twice.version).toBe(once.version);
    expect(twice.guestCount).toBe(60);
    expect(twice.total).toBe(2050);
    expect(await proposalReceipts(s, tenantId)).toHaveLength(1);
  });

  it("a count moved 40 to 60 to 40 to 60 leaves the draft on 60", async () => {
    const tenantId = "tenant-ac388-draft-backforth";
    const s = await setup(tenantId);
    const draftId = await seedDraft(s, "Draft back and forth", 40);

    await changeHeadcount(s, 60);
    await changeHeadcount(s, 40);
    expect((await proposalById(s, draftId)).total).toBe(1450);
    await changeHeadcount(s, 60);

    const after = await proposalById(s, draftId);
    expect(after.guestCount).toBe(60);
    expect(after.total).toBe(2050);
    expect(await lineAmounts(s, draftId)).toEqual({
      "Dinner per guest": 1800,
      "Setup fee": 200,
    });
  });

  it("a draft a person sized differently keeps its count and is flagged; sent, viewed and accepted proposals are not rewritten and are flagged", async () => {
    const tenantId = "tenant-ac388-draft-override";
    const s = await setup(tenantId);
    const overrideId = await seedDraft(s, "Draft sized by a person", 50);
    const sentId = await seedDraft(s, "Sent proposal", 40);
    await s.sales.mutation(M.Proposal_send, { docId: sentId });
    const viewedId = await seedDraft(s, "Viewed proposal", 40);
    await s.sales.mutation(M.Proposal_send, { docId: viewedId });
    await s.sales.mutation(M.Proposal_markViewed, { docId: viewedId });
    const acceptedId = await seedAcceptedProposal(
      s.proof,
      tenantId,
      s.eventId,
      s.clientId,
    );

    await changeHeadcount(s, 60);

    const override = await proposalById(s, overrideId);
    expect(override.status).toBe("draft");
    expect(override.guestCount).toBe(50);
    expect(override.total).toBe(1750);
    const sent = await proposalById(s, sentId);
    expect(sent.status).toBe("sent");
    expect(sent.guestCount).toBe(40);
    expect(sent.total).toBe(1450);
    const viewed = await proposalById(s, viewedId);
    expect(viewed.status).toBe("viewed");
    expect(viewed.guestCount).toBe(40);
    expect(viewed.total).toBe(1450);
    const accepted = await proposalById(s, acceptedId);
    expect(accepted.status).toBe("accepted");
    expect(accepted.guestCount).toBe(40);

    const receipts = await proposalReceipts(s, tenantId);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.updatedCount).toBe(0);
    expect(receipts[0]!.preservedCount).toBe(4);
    expect(flagsById(receipts[0]!)).toEqual({
      [overrideId]: "proposal_review",
      [sentId]: "proposal_change_required",
      [viewedId]: "proposal_change_required",
      [acceptedId]: "proposal_change_required",
    });
  });

  it("a draft added after an earlier visit to the same count is flagged when the count returns", async () => {
    const tenantId = "tenant-ac388-draft-revisit";
    const s = await setup(tenantId);
    const followId = await seedDraft(s, "Draft follows", 40);
    await changeHeadcount(s, 60);
    await changeHeadcount(s, 40);
    const laterId = await seedDraft(s, "Draft sized by a person later", 50);

    await changeHeadcount(s, 60);

    const follow = await proposalById(s, followId);
    expect(follow.guestCount).toBe(60);
    expect(follow.total).toBe(2050);
    expect((await proposalById(s, laterId)).guestCount).toBe(50);
    const receipts = await proposalReceipts(s, tenantId);
    expect(receipts).toHaveLength(3);
    const latest = receipts.find((r) => laterId in flagsById(r));
    expect(latest).toBeDefined();
    expect(latest!.updatedCount).toBe(1);
    expect(flagsById(latest!)).toEqual({ [laterId]: "proposal_review" });
  });
});
