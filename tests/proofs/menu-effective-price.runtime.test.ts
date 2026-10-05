/**
 * Runtime proof (AC-242 / AC-332, CF-4-2-done-when, CF-10.1-menu): changing a
 * menu dish's price changes new quotes from the right day on, while a proposal
 * revision already sent keeps the price it was sent with.
 *
 * - An immediate price change: the sent revision still reads the old price;
 *   a new proposal at the old price is now an unapproved override; a new
 *   proposal at the new price sends and freezes the new price.
 * - A dated price change: before its day, the current price stays in force;
 *   once its day has come, it is the price. Planning a later change first
 *   makes a due change the current price, so none is lost.
 *
 * Seed/harness follow proposal-publish-blocks.runtime.test.ts.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const M = api.mutations;
const DAY = 24 * 60 * 60 * 1000;
const OVERRIDE_MESSAGE =
  "One or more catalog-linked lines have an unapproved price override. Add an override reason to each before sending (spec §5.4).";

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

async function seed(proof: Proof, owner: Actor, price: number) {
  const client = (await proof.executeCommand(
    owner,
    M.Client_createViaRegister,
    { clientType: "company", companyName: "Price change client" },
  )) as { docId: string };
  const menu = (await proof.executeCommand(owner, M.Menu_createViaDraft, {
    name: "Harvest menu",
  })) as { docId: string };
  const dish = (await proof.executeCommand(owner, M.Dish_createViaIntroduce, {
    name: "Braised short rib",
    portionSize: 1,
    portionUnit: "serving",
  })) as { docId: string };
  const menuDish = (await proof.executeCommand(owner, M.MenuDish_createViaAdd, {
    menuId: menu.docId,
    dishId: dish.docId,
    sellingPrice: price,
  })) as { docId: string };
  await proof.executeCommand(owner, M.Menu_markPublished, {
    docId: menu.docId,
  });
  return { clientId: client.docId, menuDishId: menuDish.docId };
}

/** Draft one catalog-linked line at `unitPrice`, send it, return the result. */
async function draftAndSend(
  owner: Actor,
  s: { clientId: string; menuDishId: string },
  title: string,
  unitPrice: number,
) {
  await owner.mutation((api.lib as any).proposalDraft.draftProposalWithLines, {
    clientId: s.clientId,
    title,
    guestCount: 1,
    subtotal: unitPrice,
    taxAmount: 0,
    discountAmount: 0,
    total: unitPrice,
    lines: [
      {
        description: "Short rib",
        pricingBasis: "flat",
        unitPrice,
        quantity: 1,
        menuDishId: s.menuDishId,
      },
    ],
  });
  const proposal = (
    (await owner.query(api.queries.listProposal, {})) as any[]
  ).find((p) => p.title === title);
  return {
    proposal,
    send: () =>
      owner.mutation(
        (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
        { docId: proposal._id, version: proposal.version },
      ),
  };
}

async function frozenLine(owner: Actor, proposalId: string) {
  const revisions = (await owner.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId },
  )) as any[];
  expect(revisions).toHaveLength(1);
  return JSON.parse(revisions[0].snapshot).lineItems[0];
}

async function menuDishRow(owner: Actor, id: string) {
  return ((await owner.query(api.queries.listMenuDish, {})) as any[]).find(
    (row) => row._id === id,
  );
}

describe("menu price changes reach new quotes, never sent revisions (AC-242, AC-332)", () => {
  it("an immediate price change leaves the sent revision and prices new proposals", async () => {
    const proof = harness();
    const tenantId = "tenant-price-now";
    const owner = proof.asRole({ subject: "o-pn", role: "owner", tenantId });
    const s = await seed(proof, owner, 48);

    const first = await draftAndSend(owner, s, "Before the change", 48);
    await first.send();
    expect(await frozenLine(owner, first.proposal._id)).toMatchObject({
      unitPrice: 48,
      catalogPrice: 48,
    });

    const row = await menuDishRow(owner, s.menuDishId);
    await proof.executeCommand(owner, M.MenuDish_updateSellingPrice, {
      docId: s.menuDishId,
      version: row.version,
      sellingPrice: 55,
    });

    // The sent revision still reproduces the old price.
    expect(await frozenLine(owner, first.proposal._id)).toMatchObject({
      unitPrice: 48,
      catalogPrice: 48,
    });
    // A new proposal at the old price no longer matches the catalog.
    const stale = await draftAndSend(owner, s, "Old price", 48);
    await expect(stale.send()).rejects.toThrow(OVERRIDE_MESSAGE);
    // A new proposal at the new price sends and freezes the new price.
    const fresh = await draftAndSend(owner, s, "New price", 55);
    await fresh.send();
    expect(await frozenLine(owner, fresh.proposal._id)).toMatchObject({
      unitPrice: 55,
      catalogPrice: 55,
    });
  });

  it("a dated price change applies only from its day, and a due change is kept", async () => {
    const proof = harness();
    const tenantId = "tenant-price-dated";
    const owner = proof.asRole({ subject: "o-pd", role: "owner", tenantId });
    const s = await seed(proof, owner, 48);

    // Planned for tomorrow: today's quotes still use 48.
    let row = await menuDishRow(owner, s.menuDishId);
    await proof.executeCommand(owner, M.MenuDish_schedulePriceChange, {
      docId: s.menuDishId,
      version: row.version,
      sellingPrice: 70,
      effectiveAt: Date.now() + DAY,
    });
    const today = await draftAndSend(owner, s, "Before the day", 48);
    await today.send();
    expect(await frozenLine(owner, today.proposal._id)).toMatchObject({
      catalogPrice: 48,
    });

    // A change whose day has come is the price in force.
    row = await menuDishRow(owner, s.menuDishId);
    await proof.executeCommand(owner, M.MenuDish_schedulePriceChange, {
      docId: s.menuDishId,
      version: row.version,
      sellingPrice: 65,
      effectiveAt: Date.now() - DAY,
    });
    const due = await draftAndSend(owner, s, "On the day", 65);
    await due.send();
    expect(await frozenLine(owner, due.proposal._id)).toMatchObject({
      catalogPrice: 65,
    });

    // Planning the next change makes the due one the current price.
    row = await menuDishRow(owner, s.menuDishId);
    await proof.executeCommand(owner, M.MenuDish_schedulePriceChange, {
      docId: s.menuDishId,
      version: row.version,
      sellingPrice: 80,
      effectiveAt: Date.now() + 2 * DAY,
    });
    row = await menuDishRow(owner, s.menuDishId);
    expect(row).toMatchObject({
      sellingPrice: 65,
      scheduledSellingPrice: 80,
    });
    const next = await draftAndSend(owner, s, "After planning again", 65);
    await next.send();

    // Earlier sent revisions keep their prices.
    expect(await frozenLine(owner, today.proposal._id)).toMatchObject({
      catalogPrice: 48,
    });
  });
});
