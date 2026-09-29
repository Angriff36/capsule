/**
 * Runtime proof (2026-09-29, governed writes): the proposal pricing restamp,
 * the public share-link view counter and the quote conversion failure
 * checkpoint change their rows only through generated Manifest commands.
 *
 *   - convex/lib/proposalPricing.ts restamps line amounts through
 *     ProposalLineItem.restampAmount and parent totals through
 *     Proposal.recomputeTotals (events emitted by the commands), with the
 *     sales caller's own identity; a caller without sales access is refused.
 *   - convex/shareLinks.ts recordShareView (anonymous, token = row id) runs
 *     ShareLink.recordView as the link tenant's system role; a revoked link
 *     is still a silent no-op.
 *   - QuoteSubmission.fail stores the partial conversion's ids in the same
 *     command that marks the row failed (the raw checkpoint patch is gone).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

beforeAll(ensureTestFieldEncryptionKey);

function harness() {
  const anonymous = convexTest(schema, modules);
  return Object.assign(
    createManifestTestContext({
      convexTest: (() => anonymous) as never,
      schema,
      modules,
    }),
    { anonymous },
  );
}

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;

type LedgerRow = {
  type: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
};

async function ledger(actor: Actor): Promise<LedgerRow[]> {
  return (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as LedgerRow[];
}

async function draftProposal(proof: Proof, owner: Actor, title: string) {
  const client = (await proof.executeCommand(
    owner,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: `${title} client` },
  )) as { docId: string };
  const proposal = (await proof.executeCommand(
    owner,
    api.mutations.Proposal_createViaDraft,
    {
      clientId: client.docId,
      title,
      guestCount: 10,
      subtotal: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 0,
    },
  )) as { docId: string };
  return { clientId: client.docId, proposalId: proposal.docId };
}

type LineRow = {
  _id: string;
  pricingBasis: string;
  amount: number;
  version: number;
};

async function lines(actor: Actor, proposalId: string) {
  return (
    (await actor.run(async (ctx) =>
      ctx.db.query("proposalLineItems").collect(),
    )) as Array<LineRow & { proposalId: string; deletedAt?: number | null }>
  ).filter((row) => row.proposalId === proposalId && row.deletedAt == null);
}

describe("proposal pricing restamp runs generated commands", () => {
  it("a line edit reprices the percentage line and totals through commands", async () => {
    const tenantId = "tenant-governed-pricing";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-governed-pricing",
      role: "owner",
      tenantId,
    });
    const { proposalId } = await draftProposal(proof, owner, "Pricing");

    await proof.executeCommand(
      owner,
      api.lib.proposalPricing.addProposalLineAndRecompute,
      {
        proposalId,
        description: "Venue fee",
        pricingBasis: "flat",
        unitPrice: 100,
      },
    );
    await proof.executeCommand(
      owner,
      api.lib.proposalPricing.addProposalLineAndRecompute,
      {
        proposalId,
        description: "Service charge",
        pricingBasis: "percentage",
        unitPrice: 10,
      },
    );
    const before = await lines(owner, proposalId);
    const flat = before.find((row) => row.pricingBasis === "flat")!;
    const percentage = before.find((row) => row.pricingBasis === "percentage")!;
    expect(percentage.amount).toBeGreaterThan(0);

    await proof.executeCommand(
      owner,
      api.lib.proposalPricing.reviseProposalLineAndRecompute,
      {
        docId: flat._id,
        version: flat.version,
        description: "Venue fee",
        pricingBasis: "flat",
        unitPrice: 200,
      },
    );

    const after = await lines(owner, proposalId);
    const percentageAfter = after.find((row) => row._id === percentage._id)!;
    // The percentage line re-resolved against the doubled base, through the
    // generated command (version bump + ProposalLineItemRepriced).
    expect(percentageAfter.amount).toBeCloseTo(percentage.amount * 2, 2);
    expect(percentageAfter.version).toBe(percentage.version + 1);
    const events = await ledger(owner);
    const repriced = events.filter(
      (row) =>
        row.type === "ProposalLineItemRepriced" &&
        row.entityId === percentage._id,
    );
    expect(repriced).toHaveLength(1);
    expect(repriced[0].payload.amount).toBe(percentageAfter.amount);

    const proposal = (await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    )) as { subtotal: number; total: number };
    const totals = events.filter(
      (row) =>
        row.type === "ProposalTotalsRecomputed" && row.entityId === proposalId,
    );
    expect(totals.length).toBeGreaterThanOrEqual(1);
    expect(totals[totals.length - 1].payload.total).toBe(proposal.total);
    expect(proposal.subtotal).toBeCloseTo(
      after.reduce((sum, row) => sum + row.amount, 0),
      2,
    );
  });

  it("a caller without sales access cannot edit lines or restamp", async () => {
    const tenantId = "tenant-governed-pricing-denied";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-governed-pricing-denied",
      role: "owner",
      tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-governed-pricing-denied",
      role: "kitchen_staff",
      tenantId,
    });
    const { proposalId } = await draftProposal(proof, owner, "Denied");
    await expect(
      proof.executeCommand(
        kitchen,
        api.lib.proposalPricing.addProposalLineAndRecompute,
        {
          proposalId,
          description: "Venue fee",
          pricingBasis: "flat",
          unitPrice: 100,
        },
      ),
    ).rejects.toThrow();
    await expect(
      proof.executeCommand(kitchen, api.mutations.Proposal_recomputeTotals, {
        docId: proposalId,
        subtotal: 5,
        total: 5,
      }),
    ).rejects.toThrow();
    expect(await lines(owner, proposalId)).toHaveLength(0);
  });
});

describe("public share-link views run ShareLink.recordView", () => {
  it("an anonymous view is recorded by the command; a revoked link records nothing", async () => {
    const tenantId = "tenant-governed-share";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-governed-share",
      role: "owner",
      tenantId,
    });
    const { proposalId } = await draftProposal(proof, owner, "Shared");
    await proof.executeCommand(
      owner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposalId },
    );
    const revisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId },
    )) as Array<{ _id: string; capturedByAuthSubjectId?: string | null }>;
    expect(revisions).toHaveLength(1);
    // The revision was captured by the generated command with the sender's
    // own identity.
    expect(revisions[0].capturedByAuthSubjectId).toBe("owner-governed-share");
    expect(
      (await ledger(owner)).filter(
        (row) =>
          row.type === "ProposalRevisionCaptured" &&
          row.entityId === revisions[0]._id,
      ),
    ).toHaveLength(1);

    const link = (await proof.executeCommand(
      owner,
      api.mutations.ShareLink_create,
      { proposalId, proposalRevisionId: revisions[0]._id },
    )) as { docId?: string; _id?: string; id?: string };
    const token = String(link.docId ?? link._id ?? link.id);

    await proof.anonymous.mutation(api.shareLinks.recordShareView, {
      token,
      viewerIdentity: "client@example.com",
    });
    await proof.anonymous.mutation(api.shareLinks.recordShareView, { token });
    const row = (await owner.run(async (ctx) =>
      ctx.db.get(token as never),
    )) as {
      viewCount: number;
      firstViewedAt?: number;
      lastViewedAt?: number;
      lastViewerIdentity?: string;
    };
    expect(row.viewCount).toBe(2);
    expect(row.firstViewedAt).toBeTypeOf("number");
    expect(row.lastViewerIdentity).toBe("client@example.com");
    expect(
      (await ledger(owner)).filter(
        (event) => event.type === "ShareLinkViewed" && event.entityId === token,
      ),
    ).toHaveLength(2);

    await proof.executeCommand(owner, api.mutations.ShareLink_revoke, {
      docId: token,
    });
    await proof.anonymous.mutation(api.shareLinks.recordShareView, { token });
    const revoked = (await owner.run(async (ctx) =>
      ctx.db.get(token as never),
    )) as { viewCount: number };
    expect(revoked.viewCount).toBe(2);
  });
});

describe("quote conversion failure keeps its partial ids through QuoteSubmission.fail", () => {
  it("fail stores the ids it is given and keeps the ones it is not", async () => {
    const tenantId = "tenant-governed-quote-fail";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-governed-quote-fail",
      role: "owner",
      tenantId,
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Partial client" },
    )) as { docId: string };
    const submissionId = (await proof.seedEntity(owner, "quoteSubmissions", {
      tenantId,
      dedupKey: "governed-quote-fail",
      status: "processing",
      submittedAt: Date.now(),
      clientName: "Partial client",
      email: "partial@example.com",
      eventDate: Date.now() + 86_400_000,
      guestCount: 40,
      consentGrantedAt: Date.now(),
      version: 1,
    })) as string;

    await proof.executeCommand(owner, api.mutations.QuoteSubmission_fail, {
      docId: submissionId,
      errorMessage: "Conversion could not complete all steps",
      processingErrors: "event: boom",
      clientId: client.docId,
    });
    const row = (await owner.run(async (ctx) =>
      ctx.db.get(submissionId as never),
    )) as { status: string; clientId?: string; leadId?: string | null };
    expect(row.status).toBe("failed");
    expect(row.clientId).toBe(client.docId);
    expect(row.leadId ?? null).toBeNull();
    expect(
      (await ledger(owner)).filter(
        (event) =>
          event.type === "QuoteProcessingFailed" &&
          event.entityId === submissionId,
      ),
    ).toHaveLength(1);
  });
});
