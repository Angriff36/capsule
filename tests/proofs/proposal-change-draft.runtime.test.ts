/**
 * Starting a change from an accepted proposal.
 *
 * Exercises convex/lib/proposalChangeDraft.startProposalChange and
 * Proposal.confirmChangeSource (src/sales/proposal.manifest):
 *   - the accepted proposal keeps its status, total, and lines
 *   - a new draft stores replacesProposalId and copies live priced lines
 *   - live menu choices copy onto the draft; a removed choice does not
 *   - a removed line is not copied
 *   - a second click returns the same draft
 *   - a proposal that is not accepted is refused
 *   - a proposal from another account looks like it is missing
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

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;

async function acceptedProposal(proof: Proof, actor: Actor) {
  const client = (await proof.executeCommand(
    actor,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: "Change client" },
  )) as { docId: string };
  const proposal = (await proof.executeCommand(
    actor,
    api.mutations.Proposal_createViaDraft,
    {
      clientId: client.docId,
      title: "Autumn gala proposal",
      subtotal: 1200,
      taxAmount: 100,
      discountAmount: 0,
      total: 1300,
      guestCount: 80,
      venueName: "Riverside Hall",
    },
  )) as { docId: string };
  await proof.executeCommand(
    actor,
    api.mutations.ProposalLineItem_createViaAddLine,
    {
      proposalId: proposal.docId,
      description: "Plated dinner",
      pricingBasis: "flat",
      unitPrice: 1200,
      amount: 1200,
      quantity: 1,
      sortOrder: 1,
    },
  );
  const dropped = (await proof.executeCommand(
    actor,
    api.mutations.ProposalLineItem_createViaAddLine,
    {
      proposalId: proposal.docId,
      description: "Dropped dessert",
      pricingBasis: "flat",
      unitPrice: 200,
      amount: 200,
      quantity: 1,
      sortOrder: 2,
    },
  )) as { docId: string };
  await proof.executeCommand(actor, api.mutations.ProposalLineItem_removeLine, {
    docId: dropped.docId,
  });
  await proof.executeCommand(actor, api.mutations.Proposal_send, {
    docId: proposal.docId,
  });
  await proof.executeCommand(actor, api.mutations.Proposal_markViewed, {
    docId: proposal.docId,
  });
  await proof.executeCommand(actor, api.mutations.Proposal_accept, {
    docId: proposal.docId,
  });
  return proposal.docId;
}

async function liveLines(actor: Actor, proposalId: string) {
  const rows = await actor.run(async (ctx) =>
    ctx.db.query("proposalLineItems").collect(),
  );
  return rows.filter(
    (row) =>
      (row as { proposalId?: string }).proposalId === proposalId &&
      (row as { deletedAt?: number | null }).deletedAt == null &&
      (row as { removedAt?: number | null }).removedAt == null,
  );
}

describe("accepted proposal → start a change", () => {
  it("opens one linked draft and leaves the accepted proposal alone", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-change",
      role: "owner",
      tenantId: "tenant-change",
    });
    const proposalId = await acceptedProposal(proof, owner);

    const started = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId },
    )) as { docId: string; alreadyStarted: boolean };

    expect(started.alreadyStarted).toBe(false);
    expect(started.docId).not.toBe(proposalId);

    const accepted = (await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    )) as {
      status: string;
      total: number;
      replacesProposalId?: string | null;
    };
    expect(accepted.status).toBe("accepted");
    expect(accepted.total).toBe(1300);
    expect(accepted.replacesProposalId ?? null).toBeNull();

    const draft = (await owner.run(async (ctx) =>
      ctx.db.get(started.docId as never),
    )) as {
      status: string;
      total: number;
      title: string;
      replacesProposalId?: string | null;
      guestCount: number;
      venueName?: string | null;
    };
    expect(draft.status).toBe("draft");
    expect(draft.total).toBe(1300);
    expect(draft.title).toBe("Autumn gala proposal");
    expect(draft.replacesProposalId).toBe(proposalId);
    expect(draft.guestCount).toBe(80);
    expect(draft.venueName).toBe("Riverside Hall");

    const acceptedLines = await liveLines(owner, proposalId);
    const draftLines = await liveLines(owner, started.docId);
    expect(acceptedLines).toHaveLength(1);
    expect(draftLines).toHaveLength(1);
    expect((draftLines[0] as { description: string }).description).toBe(
      "Plated dinner",
    );
    expect((draftLines[0] as { amount: number }).amount).toBe(1200);

    const again = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId },
    )) as { docId: string; alreadyStarted: boolean };
    expect(again.alreadyStarted).toBe(true);
    expect(again.docId).toBe(started.docId);
    expect(await liveLines(owner, started.docId)).toHaveLength(1);
  });

  it("refuses a proposal that is not accepted and hides another account's proposal", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-change-b",
      role: "owner",
      tenantId: "tenant-change-b",
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Still drafting" },
    )) as { docId: string };
    const draft = (await proof.executeCommand(
      owner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId: client.docId,
        title: "Not accepted yet",
        subtotal: 100,
        taxAmount: 0,
        discountAmount: 0,
        total: 100,
      },
    )) as { docId: string };

    await expect(
      proof.executeCommand(
        owner,
        api.lib.proposalChangeDraft.startProposalChange,
        { proposalId: draft.docId },
      ),
    ).rejects.toThrow(/accepted/i);

    const outsider = proof.asRole({
      subject: "owner-other",
      role: "owner",
      tenantId: "tenant-other",
    });
    await expect(
      proof.executeCommand(
        outsider,
        api.lib.proposalChangeDraft.startProposalChange,
        { proposalId: draft.docId },
      ),
    ).rejects.toThrow(/not found/i);

    const rows = await owner.run(async (ctx) =>
      ctx.db.query("proposals").collect(),
    );
    expect(
      rows.filter(
        (row) => (row as { deletedAt?: number | null }).deletedAt == null,
      ),
    ).toHaveLength(1);
  });

  it("copies the dishes the client kept and leaves the accepted menu alone", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-menu",
      role: "owner",
      tenantId: "tenant-menu",
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Menu client" },
    )) as { docId: string };
    const proposal = (await proof.executeCommand(
      owner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId: client.docId,
        title: "Menu change proposal",
        subtotal: 500,
        taxAmount: 0,
        discountAmount: 0,
        total: 500,
      },
    )) as { docId: string };
    const menu = (await proof.executeCommand(
      owner,
      api.mutations.Menu_createViaDraft,
      { name: "Gala menu" },
    )) as { docId: string };
    await proof.executeCommand(owner, api.mutations.Menu_markPublished, {
      docId: menu.docId,
    });
    const kept = (await proof.executeCommand(
      owner,
      api.mutations.Dish_createViaIntroduce,
      { name: "Cedar salmon", portionSize: 1, portionUnit: "serving" },
    )) as { docId: string };
    const dropped = (await proof.executeCommand(
      owner,
      api.mutations.Dish_createViaIntroduce,
      { name: "Dropped side", portionSize: 1, portionUnit: "serving" },
    )) as { docId: string };
    await proof.executeCommand(
      owner,
      api.mutations.ProposalDishSelection_createViaSelect,
      {
        proposalId: proposal.docId,
        menuId: menu.docId,
        dishId: kept.docId,
        quantityServings: 80,
        course: "main",
      },
    );
    const removed = (await proof.executeCommand(
      owner,
      api.mutations.ProposalDishSelection_createViaSelect,
      {
        proposalId: proposal.docId,
        menuId: menu.docId,
        dishId: dropped.docId,
        quantityServings: 40,
        course: "side",
      },
    )) as { docId: string };
    await proof.executeCommand(
      owner,
      api.mutations.ProposalDishSelection_remove,
      { docId: removed.docId },
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

    const choices = await owner.run(async (ctx) =>
      ctx.db.query("proposalDishSelections").collect(),
    );
    const liveFor = (id: string) =>
      choices.filter(
        (row) =>
          (row as { proposalId?: string }).proposalId === id &&
          (row as { deletedAt?: number | null }).deletedAt == null &&
          (row as { removedAt?: number | null }).removedAt == null,
      );
    expect(liveFor(proposal.docId)).toHaveLength(1);
    expect((liveFor(proposal.docId)[0] as { dishId: string }).dishId).toBe(
      kept.docId,
    );
    const draftChoices = liveFor(started.docId);
    expect(draftChoices).toHaveLength(1);
    expect((draftChoices[0] as { dishId: string }).dishId).toBe(kept.docId);
    expect(
      (draftChoices[0] as { quantityServings: number }).quantityServings,
    ).toBe(80);
    expect((draftChoices[0] as { course?: string | null }).course).toBe("main");
    expect(started.alreadyStarted).toBe(false);

    const again = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId: proposal.docId },
    )) as { docId: string; alreadyStarted: boolean };
    expect(again.alreadyStarted).toBe(true);
    const after = await owner.run(async (ctx) =>
      ctx.db.query("proposalDishSelections").collect(),
    );
    expect(
      after.filter(
        (row) =>
          (row as { proposalId?: string }).proposalId === started.docId &&
          (row as { deletedAt?: number | null }).deletedAt == null,
      ),
    ).toHaveLength(1);
  });
});
