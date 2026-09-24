/**
 * A change still opens when a chosen dish can no longer be offered.
 *
 * Retiring a dish after acceptance used to roll the whole change back.
 * The retired dish stays on the accepted proposal and is left off the draft.
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

async function selectDish(
  proof: Proof,
  actor: Actor,
  proposalId: string,
  menuId: string,
  name: string,
) {
  const dish = (await proof.executeCommand(
    actor,
    api.mutations.Dish_createViaIntroduce,
    { name, portionSize: 1, portionUnit: "serving" },
  )) as { docId: string };
  await proof.executeCommand(
    actor,
    api.mutations.ProposalDishSelection_createViaSelect,
    {
      proposalId,
      menuId,
      dishId: dish.docId,
      quantityServings: 40,
      course: "main",
    },
  );
  return dish.docId;
}

describe("accepted proposal → change leaves off an unavailable dish", () => {
  it("opens the draft and copies only dishes still on offer", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-left-off",
      role: "owner",
      tenantId: "tenant-left-off",
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Left-off client" },
    )) as { docId: string };
    const proposal = (await proof.executeCommand(
      owner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId: client.docId,
        title: "Left-off proposal",
        subtotal: 400,
        taxAmount: 0,
        discountAmount: 0,
        total: 400,
      },
    )) as { docId: string };
    const menu = (await proof.executeCommand(
      owner,
      api.mutations.Menu_createViaDraft,
      { name: "Service menu" },
    )) as { docId: string };
    await proof.executeCommand(owner, api.mutations.Menu_markPublished, {
      docId: menu.docId,
    });
    const keptId = await selectDish(
      proof,
      owner,
      proposal.docId,
      menu.docId,
      "Cedar salmon",
    );
    const retiredId = await selectDish(
      proof,
      owner,
      proposal.docId,
      menu.docId,
      "Retired tart",
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
    await proof.executeCommand(owner, api.mutations.Dish_retire, {
      docId: retiredId,
      reason: "Off the menu",
    });

    const started = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId: proposal.docId },
    )) as {
      docId: string;
      alreadyStarted: boolean;
      leftOffDishNames: string[];
    };

    expect(started.alreadyStarted).toBe(false);
    expect(started.leftOffDishNames).toEqual(["Retired tart"]);
    const accepted = (await owner.run(async (ctx) =>
      ctx.db.get(proposal.docId as never),
    )) as { status: string };
    expect(accepted.status).toBe("accepted");

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
    expect(liveFor(proposal.docId)).toHaveLength(2);
    const draftDishes = liveFor(started.docId).map(
      (row) => (row as { dishId: string }).dishId,
    );
    expect(draftDishes).toEqual([keptId]);

    const again = (await proof.executeCommand(
      owner,
      api.lib.proposalChangeDraft.startProposalChange,
      { proposalId: proposal.docId },
    )) as { alreadyStarted: boolean; leftOffDishNames: string[] };
    expect(again.alreadyStarted).toBe(true);
    expect(again.leftOffDishNames).toEqual([]);
    const after = await owner.run(async (ctx) =>
      ctx.db.query("proposalDishSelections").collect(),
    );
    const draftAfter = after.filter(
      (row) =>
        (row as { proposalId?: string }).proposalId === started.docId &&
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { removedAt?: number | null }).removedAt == null,
    );
    expect(draftAfter).toHaveLength(1);
  });
});
