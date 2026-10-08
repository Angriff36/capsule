/**
 * A dish picked on a draft proposal carries its price in the same server step.
 *
 *   - a priced catalog dish gets its own per-serving line; servings follow it;
 *     removing the pick removes the line; totals follow every step
 *   - a menu priced per guest gets its per-guest and base lines once every
 *     dish of it is picked
 *   - a menu whose dishes carry their own prices never gets a per-guest line,
 *     so no dish is charged twice
 *   - a dish another line already covers gets no second line
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { linkStaffProfile } from "./reconciliation-failure-isolation.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-dish-pick-pricing";
type Actor = {
  run: (fn: (ctx: any) => Promise<unknown>) => Promise<unknown>;
  query: (fn: any, args: any) => Promise<unknown>;
  mutation: (fn: any, args: any) => Promise<unknown>;
};

async function menu(
  actor: Actor,
  name: string,
  pricePerPerson: number,
  basePrice: number,
  dishes: Array<{ name: string; sellingPrice?: number }>,
) {
  return (await actor.run(async (ctx) => {
    const menuId = await ctx.db.insert("menus", {
      tenantId: TENANT,
      deletedAt: null,
      name,
      isTemplate: false,
      basePrice,
      pricePerPerson,
      minGuests: 1,
      maxGuests: 500,
      status: "published",
      publishedAt: 1,
      version: 1,
    });
    const rows: string[] = [];
    for (const [i, dish] of dishes.entries()) {
      const dishId = await ctx.db.insert("dishes", {
        tenantId: TENANT,
        deletedAt: null,
        name: dish.name,
        portionSize: 1,
        portionUnit: "each",
        status: "active",
        version: 1,
      });
      rows.push(
        await ctx.db.insert("menuDishes", {
          tenantId: TENANT,
          deletedAt: null,
          menuId,
          dishId,
          sortOrder: i,
          sellingPrice: dish.sellingPrice ?? null,
          addedAt: 1,
          version: 1,
        }),
      );
    }
    return rows;
  })) as string[];
}

describe("runtime proof: proposal dish picks carry their price", () => {
  it("prices picks on a draft in one server step", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "pick-sales",
      role: "sales_manager",
      tenantId: TENANT,
    }) as unknown as Actor;
    await linkStaffProfile(proof, TENANT, "pick-sales", "sales_manager");

    const [salmon] = await menu(sales, "A la carte", 0, 0, [
      { name: "Grilled salmon", sellingPrice: 18 },
    ]);
    const [soup, bread] = await menu(sales, "Harvest dinner", 40, 100, [
      { name: "Squash soup" },
      { name: "Bread basket" },
    ]);
    const [, tart] = await menu(sales, "Mixed menu", 30, 0, [
      { name: "Beef slider", sellingPrice: 6 },
      { name: "Lemon tart" },
    ]);

    const client = (await proof.executeCommand(
      sales as never,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Pick client" },
    )) as { docId: string };
    await sales.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      {
        clientId: client.docId,
        title: "Fall party",
        guestCount: 10,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        lines: [],
      },
    );
    const proposal = async () =>
      ((await sales.query(api.queries.listProposal, {})) as any[])[0];
    const proposalId = (await proposal())._id;
    const lines = async () =>
      ((await sales.query(api.queries.listProposalLineItem, {})) as any[])
        .filter((row) => row.proposalId === proposalId && row.deletedAt == null)
        .map((row) => ({
          description: row.description,
          pricingBasis: row.pricingBasis,
          amount: row.amount,
        }));
    const picks = async () =>
      (
        (await sales.query(api.queries.listProposalDishSelection, {})) as any[]
      ).filter((row) => row.deletedAt == null && row.selectedAt != null);
    const pick = (menuDishId: string) =>
      sales.mutation((api.lib as any).proposalDishPricing.pickProposalDish, {
        proposalId,
        menuDishId,
        quantityServings: 10,
      });

    // A priced dish: its own line, 10 x 18.
    await pick(salmon);
    expect(await lines()).toEqual([
      { description: "Grilled salmon", pricingBasis: "per_unit", amount: 180 },
    ]);
    expect(await proposal()).toMatchObject({ subtotal: 180, total: 180 });

    // Servings follow onto the line.
    const salmonPick = (await picks())[0];
    await sales.mutation(
      (api.lib as any).proposalDishPricing.adjustProposalDishServings,
      {
        docId: salmonPick._id,
        version: salmonPick.version,
        quantityServings: 4,
      },
    );
    expect(await lines()).toEqual([
      { description: "Grilled salmon", pricingBasis: "per_unit", amount: 72 },
    ]);

    // Removing the pick removes its line.
    const adjusted = (await picks())[0];
    await sales.mutation(
      (api.lib as any).proposalDishPricing.removeProposalDish,
      { docId: adjusted._id, version: adjusted.version },
    );
    expect(await lines()).toEqual([]);
    expect(await proposal()).toMatchObject({ subtotal: 0, total: 0 });

    // A per-guest menu: no line until the whole menu is picked.
    await pick(soup);
    expect(await lines()).toEqual([]);
    await pick(bread);
    expect(await lines()).toEqual([
      {
        description: "Harvest dinner (per guest)",
        pricingBasis: "per_person",
        amount: 400,
      },
      {
        description: "Harvest dinner (base price)",
        pricingBasis: "flat",
        amount: 100,
      },
    ]);

    // A mixed menu: its unpriced dish gets no per-guest line (that would
    // charge the priced dishes twice); the screen warns about it instead.
    await pick(tart);
    expect(await lines()).toHaveLength(2);
    expect(await proposal()).toMatchObject({ subtotal: 500, total: 500 });
  });

  it("adds no second line for a dish a line already covers", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "pick-sales-2",
      role: "sales_manager",
      tenantId: TENANT,
    }) as unknown as Actor;
    await linkStaffProfile(proof, TENANT, "pick-sales-2", "sales_manager");
    const [salmon] = await menu(sales, "A la carte", 0, 0, [
      { name: "Grilled salmon", sellingPrice: 18 },
    ]);
    const client = (await proof.executeCommand(
      sales as never,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Covered client" },
    )) as { docId: string };
    await sales.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      {
        clientId: client.docId,
        title: "Lunch",
        guestCount: 10,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        lines: [
          {
            description: "Grilled salmon",
            pricingBasis: "flat",
            unitPrice: 150,
          },
        ],
      },
    );
    const proposalId = (
      (await sales.query(api.queries.listProposal, {})) as any[]
    )[0]._id;
    await sales.mutation(
      (api.lib as any).proposalDishPricing.pickProposalDish,
      {
        proposalId,
        menuDishId: salmon,
        quantityServings: 10,
      },
    );
    const lines = (
      (await sales.query(api.queries.listProposalLineItem, {})) as any[]
    ).filter((row) => row.proposalId === proposalId && row.deletedAt == null);
    expect(lines.map((row) => row.amount)).toEqual([150]);
  });
});
