/**
 * Runtime proof (AC-264 / CF-5-4-central-path-snapshot): preview, the stored
 * proposal totals, the revision snapshot the PDF and share portal read, and
 * the accepted proposal all carry the ONE central-calc totals object. The
 * server (not the caller's provisional numbers) produces the stored totals,
 * and a later live change never moves the accepted snapshot.
 *
 * Harness/seed follow proposal-template-publication.runtime.test.ts; the
 * send/accept flow follows proposal-publish-blocks.runtime.test.ts and
 * booking-identity.runtime.test.ts.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  computeProposalPricing,
  type PricingBasis,
} from "../../src/lib/pricing";
import { projectProposalPdf } from "../../src/features/clients/proposalPdfProjection";

const M = api.mutations;

const SEED_LINES: Array<{
  description: string;
  pricingBasis: PricingBasis;
  unitPrice: number;
  quantity: number;
  unit?: string;
}> = [
  {
    description: "Plated dinner",
    pricingBasis: "per_person",
    unitPrice: 48,
    quantity: 1,
  },
  {
    description: "Room rental",
    pricingBasis: "flat",
    unitPrice: 120,
    quantity: 1,
  },
  {
    description: "Service charge",
    pricingBasis: "percentage",
    unitPrice: 20,
    quantity: 1,
    unit: "%",
  },
];

// The one totals object every surface must read: per_person 48×10=480,
// flat 120, percentage 20% of 600=120 → subtotal 720, +40 tax, −15 discount.
const TOTALS = {
  subtotal: 720,
  taxAmount: 40,
  discountAmount: 15,
  total: 745,
};

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;

/** Client + draft proposal with WRONG provisional totals (1/1) for the seed lines. */
async function seedDraftedProposal(
  proof: Proof,
  owner: Actor,
  title: string,
): Promise<string> {
  const client = (await proof.executeCommand(
    owner,
    M.Client_createViaRegister,
    { clientType: "company", companyName: "AC-264 Snapshot Client" },
  )) as { docId: string };
  await owner.mutation((api.lib as any).proposalDraft.draftProposalWithLines, {
    clientId: client.docId,
    title,
    guestCount: 10,
    // WRONG on purpose: the central calc on the server must overwrite these.
    subtotal: 1,
    taxAmount: 40,
    discountAmount: 15,
    total: 1,
    lines: SEED_LINES,
  });
  const proposals = (await owner.query(api.queries.listProposal, {})) as any[];
  expect(proposals).toHaveLength(1);
  return proposals[0]._id;
}

/** Live (deletedAt == null) ProposalLineItem amounts keyed by description. */
async function liveLineAmounts(
  owner: Actor,
  proposalId: string,
): Promise<Record<string, number>> {
  const rows = (await owner.query(
    api.queries.listProposalLineItemByProposalId,
    { proposalId },
  )) as any[];
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (row.deletedAt == null) map[row.description] = row.amount;
  }
  return map;
}

/** A live record whose money is wrong on every field — snapshot bait. */
function liveBait(proposalId: string, total: number) {
  return {
    _id: proposalId,
    title: "Changed live title",
    eventDate: 99,
    eventType: "changed live type",
    guestCount: 99,
    venueName: "Changed live venue",
    venueAddress: "Changed live address",
    subtotal: 9999,
    taxAmount: 999,
    discountAmount: 0,
    total,
    terms: "Changed live terms",
    notes: "Changed live notes",
    pricingLines: [],
    timelineItems: [{ time: "9:00 PM", activity: "Changed live activity" }],
    venueLogistics: { loadIn: "Changed private load-in" },
  };
}

describe("proposal central-path snapshot identity (AC-264)", () => {
  it("preview, stored snapshot, PDF, and acceptance read the identical totals object", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "o-ac264",
      role: "owner",
      tenantId: "tenant-ac264",
    });

    // Preview — the exact function the draft form uses for its live total.
    const preview = computeProposalPricing({
      lines: SEED_LINES,
      guestCount: 10,
      discountAmount: 15,
      taxAmount: 40,
    });
    expect(preview).toMatchObject(TOTALS);
    expect(preview.lines.map((line) => line.amount)).toEqual([480, 120, 120]);

    const proposalId = await seedDraftedProposal(
      proof,
      owner,
      "AC-264 plated dinner",
    );

    // Stored draft totals are the server's central-calc output, not 1/1.
    const stored = (await owner.query(api.queries.listProposal, {})) as any[];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject(TOTALS);
    expect(stored[0]).toMatchObject({ status: "draft" });
    expect(await liveLineAmounts(owner, proposalId)).toEqual({
      "Plated dinner": 480,
      "Room rental": 120,
      "Service charge": 120,
    });

    await owner.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposalId, version: stored[0].version },
    );
    const revisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId },
    )) as any[];
    expect(revisions).toHaveLength(1);
    const snapshot = JSON.parse(revisions[0].snapshot);
    expect(snapshot.proposal).toMatchObject(TOTALS);
    const snapAmounts = Object.fromEntries(
      snapshot.lineItems.map((line: any) => [line.description, line.amount]),
    );
    expect(snapAmounts).toEqual({
      "Plated dinner": 480,
      "Room rental": 120,
      "Service charge": 120,
    });

    // PDF reads the snapshot even though every live money field is wrong.
    const pdf = projectProposalPdf(liveBait(proposalId, 9999), "Live client", {
      snapshot: revisions[0].snapshot,
    });
    expect(pdf.source).toBe("revision");
    expect(pdf.proposal).toMatchObject(TOTALS);
    // PDF render and preview share one calc: recompute the projection's lines.
    const recomputed = computeProposalPricing({
      lines: (pdf.proposal.pricingLines ?? []).map((line) => ({
        ...line,
        quantity: line.quantity ?? undefined,
        unit: line.unit ?? undefined,
      })),
      guestCount: pdf.proposal.guestCount,
      discountAmount: pdf.proposal.discountAmount,
      taxAmount: pdf.proposal.taxAmount,
    });
    expect(recomputed).toMatchObject(TOTALS);

    await proof.executeCommand(owner, M.Proposal_accept, { docId: proposalId });
    const accepted = (await owner.query(api.queries.listProposal, {})) as any[];
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ ...TOTALS, status: "accepted" });

    // Acceptance did not rewrite money: one revision, same snapshot totals.
    const afterAccept = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId },
    )) as any[];
    expect(afterAccept).toHaveLength(1);
    expect(JSON.parse(afterAccept[0].snapshot).proposal).toMatchObject(TOTALS);

    const link = (await proof.executeCommand(owner, M.ShareLink_create, {
      proposalId,
      proposalRevisionId: revisions[0]._id,
    })) as { _id: string };
    const shared = (await owner.query(api.shareLinks.getSharedProposal, {
      token: link._id,
    })) as any;
    expect(shared?.proposal).toMatchObject(TOTALS);
  });

  it("a later catalog-looking live change does not move the accepted snapshot totals", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "o-ac264b",
      role: "owner",
      tenantId: "tenant-ac264-b",
    });

    const proposalId = await seedDraftedProposal(
      proof,
      owner,
      "AC-264 snapshot stability",
    );
    const stored = (await owner.query(api.queries.listProposal, {})) as any[];
    await owner.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposalId, version: stored[0].version },
    );
    await proof.executeCommand(owner, M.Proposal_accept, {
      docId: proposalId,
    });

    const revisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId },
    )) as any[];
    expect(revisions).toHaveLength(1);

    // Live bait says total 1 — the snapshot must still win.
    const pdf = projectProposalPdf(liveBait(proposalId, 1), "Live client", {
      snapshot: revisions[0].snapshot,
    });
    expect(pdf.source).toBe("revision");
    expect(pdf.proposal).toMatchObject(TOTALS);

    const link = (await proof.executeCommand(owner, M.ShareLink_create, {
      proposalId,
      proposalRevisionId: revisions[0]._id,
    })) as { _id: string };
    const shared = (await owner.query(api.shareLinks.getSharedProposal, {
      token: link._id,
    })) as any;
    expect(shared?.proposal).toMatchObject(TOTALS);
  });
});
