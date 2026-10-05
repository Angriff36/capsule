/**
 * Runtime proof (AC-265 / CF-5-4-publish-blocks): publication blocks an
 * unapproved catalog price override, an override reason lets it through and
 * freezes the reason + catalog price into the revision, and ProposalLineItem
 * addLine refuses a negative quantity without writing a row.
 *
 * Harness/seed follow proposal-template-publication.runtime.test.ts and the
 * booking-identity seedCatalog pattern; menu publish order matters because
 * MenuDish_createViaAdd is only allowed while the menu is still draft.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const M = api.mutations;

const OVERRIDE_MESSAGE =
  "One or more catalog-linked lines have an unapproved price override. Add an override reason to each before sending (spec §5.4).";
const NEGATIVE_QUANTITY_MESSAGE =
  "This line's quantity can't be negative. Use zero or more.";

const CATALOG_PRICE = 48;
const DIVERGENT_PRICE = 60;
const OVERRIDE_REASON = "Client asked for plated upgrade";

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

/** Client + published menu + one priced MenuDish at the catalog price. */
async function seedCatalogWithPricedDish(
  proof: Proof,
  owner: Actor,
  tenantId: string,
): Promise<{ clientId: string; menuDishId: string }> {
  const client = (await proof.executeCommand(
    owner,
    M.Client_createViaRegister,
    { clientType: "company", companyName: `AC-265 client ${tenantId}` },
  )) as { docId: string };
  const menu = (await proof.executeCommand(owner, M.Menu_createViaDraft, {
    name: `AC-265 tasting menu ${tenantId}`,
  })) as { docId: string };
  const dish = (await proof.executeCommand(owner, M.Dish_createViaIntroduce, {
    name: "Maple duck",
    portionSize: 1,
    portionUnit: "serving",
  })) as { docId: string };
  // MenuDish.add only works while the menu is still a draft — price it here,
  // then publish the menu so resolveCatalogPrice can see the sell price.
  const menuDish = (await proof.executeCommand(owner, M.MenuDish_createViaAdd, {
    menuId: menu.docId,
    dishId: dish.docId,
    sellingPrice: CATALOG_PRICE,
  })) as { docId: string };
  await proof.executeCommand(owner, M.Menu_markPublished, {
    docId: menu.docId,
  });
  return { clientId: client.docId, menuDishId: menuDish.docId };
}

/** Draft proposal with one catalog-linked line (optionally overridden). */
async function draftWithCatalogLine(
  owner: Actor,
  seed: { clientId: string; menuDishId: string },
  options: { overrideReason?: string },
): Promise<void> {
  await owner.mutation((api.lib as any).proposalDraft.draftProposalWithLines, {
    clientId: seed.clientId,
    title: "AC-265 plated dinner",
    guestCount: 10,
    subtotal: 600,
    taxAmount: 0,
    discountAmount: 0,
    total: 600,
    lines: [
      {
        description: "Maple duck plated",
        pricingBasis: "flat",
        unitPrice: DIVERGENT_PRICE,
        quantity: 1,
        menuDishId: seed.menuDishId,
        overrideReason: options.overrideReason,
      },
    ],
  });
}

describe("publication blocks unapproved catalog overrides (AC-265)", () => {
  it("refuses send when a catalog price diverges and has no override reason", async () => {
    const proof = harness();
    const tenantId = "tenant-ac265-a";
    const owner = proof.asRole({ subject: "o-a265a", role: "owner", tenantId });
    const seed = await seedCatalogWithPricedDish(proof, owner, tenantId);
    await draftWithCatalogLine(owner, seed, {});

    let proposals = (await owner.query(api.queries.listProposal, {})) as any[];
    expect(proposals).toHaveLength(1);
    expect(proposals[0].status).toBe("draft");

    await expect(
      owner.mutation(
        (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
        { docId: proposals[0]._id, version: proposals[0].version },
      ),
    ).rejects.toThrow(OVERRIDE_MESSAGE);

    proposals = (await owner.query(api.queries.listProposal, {})) as any[];
    expect(proposals).toHaveLength(1);
    expect(proposals[0].status).toBe("draft");
    const revisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: proposals[0]._id },
    )) as any[];
    expect(revisions).toEqual([]);
  });

  it("sends when the same divergent price has an override reason and freezes that reason", async () => {
    const proof = harness();
    const tenantId = "tenant-ac265-b";
    const owner = proof.asRole({ subject: "o-a265b", role: "owner", tenantId });
    const seed = await seedCatalogWithPricedDish(proof, owner, tenantId);
    await draftWithCatalogLine(owner, seed, {
      overrideReason: OVERRIDE_REASON,
    });

    const proposals = (await owner.query(
      api.queries.listProposal,
      {},
    )) as any[];
    expect(proposals).toHaveLength(1);
    await owner.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposals[0]._id, version: proposals[0].version },
    );

    const revisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: proposals[0]._id },
    )) as any[];
    expect(revisions).toHaveLength(1);
    const snapshot = JSON.parse(revisions[0].snapshot);
    expect(snapshot.lineItems[0]).toMatchObject({
      unitPrice: DIVERGENT_PRICE,
      catalogPrice: CATALOG_PRICE,
      overrideReason: OVERRIDE_REASON,
      menuDishId: seed.menuDishId,
    });

    const after = (await owner.query(api.queries.listProposal, {})) as any[];
    expect(after[0].status).toBe("sent");
  });

  it("rejects a negative quantity at addLine and writes no line", async () => {
    const proof = harness();
    const tenantId = "tenant-ac265-c";
    const owner = proof.asRole({ subject: "o-a265c", role: "owner", tenantId });
    const client = (await proof.executeCommand(
      owner,
      M.Client_createViaRegister,
      { clientType: "company", companyName: "AC-265 negative qty client" },
    )) as { docId: string };
    const proposal = (await proof.executeCommand(
      owner,
      M.Proposal_createViaDraft,
      {
        clientId: client.docId,
        title: "AC-265 negative qty",
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
      },
    )) as { docId: string };

    await expect(
      proof.executeCommand(owner, M.ProposalLineItem_createViaAddLine, {
        proposalId: proposal.docId,
        description: "Bad qty",
        pricingBasis: "flat",
        unitPrice: 10,
        amount: 10,
        quantity: -1,
      }),
    ).rejects.toThrow(NEGATIVE_QUANTITY_MESSAGE);

    const rows = (await owner.query(
      api.queries.listProposalLineItemByProposalId,
      { proposalId: proposal.docId },
    )) as any[];
    expect(rows.filter((row) => row.deletedAt == null)).toHaveLength(0);
  });
});
