import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: proposal template publication", () => {
  it("persists template defaults and freezes them into shared revision output", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "proposal-template-sales",
      role: "sales_manager",
      tenantId: "tenant-proposal-template",
    });
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Snapshot Client" },
    )) as { docId: string };
    const template = (await proof.executeCommand(
      sales,
      api.mutations.ProposalTemplate_createViaDefine,
      {
        name: "Snapshot defaults",
        defaultTerms: "Net 14",
        defaultNotes: "Client-facing note",
        defaultTaxRate: 0.0825,
        defaultServiceChargePercent: 0.2,
        validityDays: 21,
        visibleSections: ["pricing_summary", "terms"],
      },
    )) as { docId: string };

    await sales.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      {
        clientId: client.docId,
        title: "Frozen template proposal",
        guestCount: 10,
        subtotal: 1200,
        taxAmount: 99,
        discountAmount: 0,
        total: 1299,
        expiresAt: Date.UTC(2026, 9, 1),
        notes: "Client-facing note",
        terms: "Net 14",
        visibleSections: ["pricing_summary", "terms"],
        lines: [
          {
            description: "Dinner",
            pricingBasis: "flat",
            unitPrice: 1000,
            quantity: 1,
          },
          {
            description: "Service charge",
            pricingBasis: "percentage",
            unitPrice: 20,
            quantity: 1,
            unit: "%",
          },
        ],
      },
    );
    const proposals = (await sales.query(
      api.queries.listProposal,
      {},
    )) as any[];
    const proposal = proposals[0];
    expect(proposal).toMatchObject({
      subtotal: 1200,
      taxAmount: 99,
      total: 1299,
      visibleSections: ["pricing_summary", "terms"],
    });

    await sales.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposal._id, version: proposal.version },
    );
    const revisions = (await sales.query(
      api.queries.listProposalRevisionByProposalId,
      {
        proposalId: proposal._id,
      },
    )) as any[];
    const revision = revisions[0];
    const snapshot = JSON.parse(revision.snapshot);
    expect(snapshot.proposal).toMatchObject({
      notes: "Client-facing note",
      terms: "Net 14",
      visibleSections: ["pricing_summary", "terms"],
      subtotal: 1200,
      taxAmount: 99,
    });
    expect(snapshot.lineItems[1]).toMatchObject({
      description: "Service charge",
      pricingBasis: "percentage",
      unitPrice: 20,
      amount: 200,
    });

    await proof.executeCommand(sales, api.mutations.ProposalTemplate_revise, {
      docId: template.docId,
      name: "Changed defaults",
      defaultTerms: "Changed later",
      visibleSections: ["event_summary"],
    });
    const unchanged = JSON.parse(
      (
        (await sales.query(api.queries.listProposalRevisionByProposalId, {
          proposalId: proposal._id,
        })) as any[]
      )[0].snapshot,
    );
    expect(unchanged.proposal.terms).toBe("Net 14");
    expect(unchanged.proposal.visibleSections).toEqual([
      "pricing_summary",
      "terms",
    ]);

    const link = (await proof.executeCommand(
      sales,
      api.mutations.ShareLink_create,
      {
        proposalId: proposal._id,
        proposalRevisionId: revision._id,
      },
    )) as { _id: string };
    const shared = (await sales.query(api.shareLinks.getSharedProposal, {
      token: link._id,
    })) as any;
    expect(shared?.proposal).toMatchObject({
      notes: "Client-facing note",
      terms: "Net 14",
      expiresAt: Date.UTC(2026, 9, 1),
      visibleSections: ["pricing_summary", "terms"],
    });
    expect(shared?.lineItems[1]).toMatchObject({
      description: "Service charge",
      amount: 200,
    });
  });
});
