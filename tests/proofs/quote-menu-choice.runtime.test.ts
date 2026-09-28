/**
 * Runtime proof (AC-241, CF-4-2-same-catalog-source): the quote form's menu
 * choice is priced from the same catalog rows and price rule as the public
 * menu and internal proposals. After conversion, the draft proposal's lines
 * and totals equal computeProposalPricing over the public menu's prices, the
 * catalog-linked lines pass the send check with no override, and a retried
 * conversion adds no second set of lines.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { computeProposalPricing } from "../../src/lib/pricing";
import { modules } from "./convex-test-modules";

const M = api.mutations;
const GUESTS = 60;

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
type ActionRunner = { action: (fn: unknown, args?: unknown) => Promise<any> };
const asActions = (actor: Actor) => actor as unknown as ActionRunner;

async function publishedMenu(
  proof: Proof,
  owner: Actor,
  name: string,
  pricing: { basePrice?: number; pricePerPerson?: number },
  dishes: Array<{ name: string; price?: number }>,
) {
  const menu = (await proof.executeCommand(owner, M.Menu_createViaDraft, {
    name,
    ...pricing,
  })) as { docId: string };
  for (const [sortOrder, d] of dishes.entries()) {
    const dish = (await proof.executeCommand(owner, M.Dish_createViaIntroduce, {
      name: d.name,
      portionSize: 1,
      portionUnit: "serving",
    })) as { docId: string };
    await proof.executeCommand(owner, M.MenuDish_createViaAdd, {
      menuId: menu.docId,
      dishId: dish.docId,
      sortOrder,
      sellingPrice: d.price,
    });
  }
  await proof.executeCommand(owner, M.Menu_markPublished, {
    docId: menu.docId,
  });
  return menu.docId;
}

async function quoteWithMenu(owner: Actor, menuId: string, email: string) {
  const submitted = await asActions(owner).action(
    api.quoteBuilder.submitQuote,
    {
      clientName: "Robin Prospect",
      email,
      eventDate: Date.UTC(2026, 10, 7, 17, 0),
      guestCount: GUESTS,
      consent: true,
      menuId,
    },
  );
  const converted = await asActions(owner).action(
    api.quoteBuilder.processQuoteSubmission,
    { submissionId: submitted.submissionId },
  );
  expect(converted.errors).toEqual([]);
  return converted.proposalId as string;
}

async function liveLines(owner: Actor, proposalId: string) {
  return (
    (await owner.query(api.queries.listProposalLineItemByProposalId, {
      proposalId,
    })) as any[]
  )
    .filter((row) => row.deletedAt == null)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

describe("quote menu choice uses the public menu's prices (AC-241)", () => {
  it("dish-priced menu: lines and totals equal the central calc on the public prices", async () => {
    const proof = harness();
    const tenantId = "tenant-quote-menu-a";
    const owner = proof.asRole({ subject: "o-qm-a", role: "owner", tenantId });
    await proof.executeCommand(owner, M.Organization_createViaRegister, {
      name: "Quote menu kitchen",
    });
    const menuId = await publishedMenu(proof, owner, "Garden party", {}, [
      { name: "Herb chicken", price: 18.5 },
      { name: "Summer salad", price: 6 },
      { name: "Chef's choice dessert" },
    ]);

    const [shown] = (await owner.query(
      api.publicMenu.getPublicMenu,
      {},
    )) as any[];
    const pricedDishes = shown.dishes.filter((d: any) => d.price != null);
    const proposalId = await quoteWithMenu(owner, menuId, "robin@example.com");

    const lines = await liveLines(owner, proposalId);
    expect(
      lines.map((l) => ({
        description: l.description,
        unitPrice: l.unitPrice,
        menuDishId: l.menuDishId,
      })),
    ).toEqual(
      pricedDishes.map((d: any) => ({
        description: d.name,
        unitPrice: d.price,
        menuDishId: d.menuDishId,
      })),
    );
    const expected = computeProposalPricing({
      lines: pricedDishes.map((d: any) => ({
        pricingBasis: "per_person" as const,
        unitPrice: d.price,
      })),
      guestCount: GUESTS,
    });
    const proposal = (await owner.query(api.queries.getProposal, {
      id: proposalId,
    })) as any;
    expect(proposal.subtotal).toBe(expected.subtotal);
    expect(proposal.total).toBe(expected.total);
    expect(lines.map((l) => l.amount)).toEqual(
      expected.lines.map((l) => l.amount),
    );

    // Catalog-linked at the catalog price: sends with no override.
    await owner.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposalId, version: proposal.version },
    );
    const [revision] = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId },
    )) as any[];
    const frozen = JSON.parse(revision.snapshot).lineItems;
    for (const line of frozen) expect(line.catalogPrice).toBe(line.unitPrice);
  });

  it("menu with its own price: quoted at that price; retry adds nothing", async () => {
    const proof = harness();
    const tenantId = "tenant-quote-menu-b";
    const owner = proof.asRole({ subject: "o-qm-b", role: "owner", tenantId });
    await proof.executeCommand(owner, M.Organization_createViaRegister, {
      name: "Quote menu kitchen B",
    });
    const menuId = await publishedMenu(
      proof,
      owner,
      "Wedding package",
      { basePrice: 400, pricePerPerson: 38 },
      [{ name: "Carved beef", price: 22 }],
    );
    const proposalId = await quoteWithMenu(owner, menuId, "wed@example.com");
    const lines = await liveLines(owner, proposalId);
    expect(
      lines.map((l) => [l.description, l.pricingBasis, l.unitPrice]),
    ).toEqual([
      ["Wedding package (per person)", "per_person", 38],
      ["Wedding package (base fee)", "flat", 400],
    ]);
    const proposal = (await owner.query(api.queries.getProposal, {
      id: proposalId,
    })) as any;
    expect(proposal.total).toBe(400 + 38 * GUESTS);

    // The chosen-menu lines are only added to a proposal with none.
    const again = (await owner.query(
      internal.lib.quoteMenuLines.chosenMenuLines as never,
      { proposalId, menuId } as never,
    )) as unknown[];
    expect(again).toEqual([]);
  });

  it("refuses a menu that is not published", async () => {
    const proof = harness();
    const tenantId = "tenant-quote-menu-c";
    const owner = proof.asRole({ subject: "o-qm-c", role: "owner", tenantId });
    await proof.executeCommand(owner, M.Organization_createViaRegister, {
      name: "Quote menu kitchen C",
    });
    const draft = (await proof.executeCommand(owner, M.Menu_createViaDraft, {
      name: "Not ready",
    })) as { docId: string };
    await expect(
      asActions(owner).action(api.quoteBuilder.submitQuote, {
        clientName: "Robin Prospect",
        email: "draft@example.com",
        eventDate: Date.UTC(2026, 10, 7, 17, 0),
        guestCount: GUESTS,
        consent: true,
        menuId: draft.docId,
      }),
    ).rejects.toThrow("That menu is no longer offered. Pick another.");
  });
});
