/**
 * Optional extras on a change from an accepted proposal.
 *
 * Exercises copyLiveExtras inside startProposalChange: a kept extra is
 * offered again on the new draft, a withdrawn extra is not, and the accepted
 * proposal's extras stay put.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

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

type Row = {
  proposalId?: string;
  deletedAt?: number | null;
  removedAt?: number | null;
  name?: string;
  price?: number;
  description?: string | null;
};

function liveExtras(rows: Row[], proposalId: string) {
  return rows.filter(
    (row) =>
      row.proposalId === proposalId &&
      row.deletedAt == null &&
      row.removedAt == null,
  );
}

describe("accepted proposal → change draft keeps extras", () => {
  it("copies extras still on offer and leaves the accepted proposal alone", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-extra",
      role: "owner",
      tenantId: "tenant-extra",
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Extras client" },
    )) as { docId: string };
    const proposal = (await proof.executeCommand(
      owner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId: client.docId,
        title: "Extras proposal",
        subtotal: 800,
        taxAmount: 0,
        discountAmount: 0,
        total: 800,
      },
    )) as { docId: string };
    await proof.executeCommand(
      owner,
      api.mutations.ProposalEnhancement_createViaOffer,
      {
        proposalId: proposal.docId,
        name: "Carving station",
        price: 250,
        description: "Chef on site",
        sortOrder: 1,
      },
    );
    const dropped = (await proof.executeCommand(
      owner,
      api.mutations.ProposalEnhancement_createViaOffer,
      {
        proposalId: proposal.docId,
        name: "Dropped lighting",
        price: 100,
        sortOrder: 2,
      },
    )) as { docId: string };
    await proof.executeCommand(
      owner,
      api.mutations.ProposalEnhancement_withdraw,
      { docId: dropped.docId },
    );
    await proof.executeCommand(owner, api.mutations.Proposal_send, {
      docId: proposal.docId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
      docId: proposal.docId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: proposal.docId,
    });

    const started = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId: proposal.docId },
    )) as { docId: string; alreadyStarted: boolean };
    expect(started.alreadyStarted).toBe(false);

    const accepted = (await owner.run(async (ctx) =>
      ctx.db.get(proposal.docId as never),
    )) as { status: string; total: number };
    expect(accepted.status).toBe("accepted");
    expect(accepted.total).toBe(800);

    const rows = (await owner.run(async (ctx) =>
      ctx.db.query("proposalEnhancements").collect(),
    )) as Row[];
    const kept = liveExtras(rows, proposal.docId);
    const copied = liveExtras(rows, started.docId);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.name).toBe("Carving station");
    expect(copied).toHaveLength(1);
    expect(copied[0]?.name).toBe("Carving station");
    expect(copied[0]?.price).toBe(250);
    expect(copied[0]?.description).toBe("Chef on site");

    const again = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId: proposal.docId },
    )) as { alreadyStarted: boolean };
    expect(again.alreadyStarted).toBe(true);
    const after = (await owner.run(async (ctx) =>
      ctx.db.query("proposalEnhancements").collect(),
    )) as Row[];
    expect(liveExtras(after, started.docId)).toHaveLength(1);
  });
});
