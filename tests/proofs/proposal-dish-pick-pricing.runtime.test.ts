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

    // Both lines name their menu, so the menu panel can flag them once every
    // dish of that menu is taken off.
    // Only the two Harvest dinner picks are left at this point.
    const harvestMenuId = (await picks())[0].menuId;
    const linked = (
      (await sales.query(api.queries.listProposalLineItem, {})) as any[]
    ).filter((row) => row.proposalId === proposalId && row.deletedAt == null);
    expect(linked.map((row) => row.menuId)).toEqual([
      harvestMenuId,
      harvestMenuId,
    ]);

    // A mixed menu: its unpriced dish gets no per-guest line (that would
    // charge the priced dishes twice); the screen warns about it instead.
    await pick(tart);
    expect(await lines()).toHaveLength(2);
    expect(await proposal()).toMatchObject({ subtotal: 500, total: 500 });
  });

  it("keeps a picked menu's price in step when picks are removed", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "pick-sales-3",
      role: "sales_manager",
      tenantId: TENANT,
    }) as unknown as Actor;
    await linkStaffProfile(proof, TENANT, "pick-sales-3", "sales_manager");
    const [chicken, steak] = await menu(sales, "Plated", 40, 0, [
      { name: "Roast chicken" },
      { name: "Filet steak" },
    ]);
    await sales.run(async (ctx) => {
      const steakRow = await ctx.db.get(steak);
      await ctx.db.patch(steakRow.menuId, {
        pricingOptionsJson: JSON.stringify({
          choices: [
            {
              label: "Steak tier",
              pricePerPerson: 60,
              dishIds: [String(steakRow.dishId)],
            },
            { label: "Family style", pricePerPerson: 55 },
          ],
        }),
      });
    });
    const client = (await proof.executeCommand(
      sales as never,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Plated client" },
    )) as { docId: string };
    await sales.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      {
        clientId: client.docId,
        title: "Gala",
        guestCount: 10,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        lines: [],
      },
    );
    const proposalId = (
      (await sales.query(api.queries.listProposal, {})) as any[]
    )[0]._id;
    const rows = async () =>
      (
        (await sales.query(api.queries.listProposalLineItem, {})) as any[]
      ).filter((row) => row.proposalId === proposalId && row.deletedAt == null);
    const lines = async () =>
      (await rows()).map((row) => ({
        description: row.description,
        unitPrice: row.unitPrice,
      }));
    const pickOf = async (menuDishId: string) => {
      const dishId = ((await sales.run((ctx) => ctx.db.get(menuDishId))) as any)
        .dishId;
      return (
        (await sales.query(api.queries.listProposalDishSelection, {})) as any[]
      ).find(
        (row) =>
          row.deletedAt == null &&
          row.selectedAt != null &&
          String(row.dishId) === String(dishId),
      );
    };
    const pick = (menuDishId: string) =>
      sales.mutation((api.lib as any).proposalDishPricing.pickProposalDish, {
        proposalId,
        menuDishId,
        quantityServings: 10,
      });
    const unpick = async (menuDishId: string) => {
      const row = await pickOf(menuDishId);
      await sales.mutation(
        (api.lib as any).proposalDishPricing.removeProposalDish,
        { docId: row._id, version: row.version },
      );
    };

    await pick(chicken);
    expect(await lines()).toEqual([
      { description: "Plated (per guest)", unitPrice: 40 },
    ]);
    await pick(steak);
    expect(await lines()).toEqual([
      { description: "Plated (per guest) — Steak tier", unitPrice: 60 },
    ]);

    // The steak pick goes: back to the menu's own price.
    await unpick(steak);
    expect(await lines()).toEqual([
      { description: "Plated (per guest)", unitPrice: 40 },
    ]);

    // The last pick goes: the line that came with the picks goes too.
    await unpick(chicken);
    expect(await lines()).toEqual([]);

    // A choice staff set by hand stays when the picks change.
    await pick(chicken);
    await pick(steak);
    const line = (await rows())[0];
    await sales.mutation(
      (api.lib as any).proposalPricing.reviseProposalLineAndRecompute,
      {
        docId: line._id,
        version: line.version,
        description: "Plated (per guest) — Family style",
        pricingBasis: "per_person",
        unitPrice: 55,
        quantity: line.quantity,
      },
    );
    await unpick(steak);
    await unpick(chicken);
    expect(await lines()).toEqual([
      { description: "Plated (per guest) — Family style", unitPrice: 55 },
    ]);
  });

  it("prices course-pick menus as a package only when no dish has its own price", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "pick-sales-4",
      role: "sales_manager",
      tenantId: TENANT,
    }) as unknown as Actor;
    await linkStaffProfile(proof, TENANT, "pick-sales-4", "sales_manager");
    const rules = JSON.stringify([{ course: "Salad", min: 1, max: 1 }]);
    const [caesar, garden] = await menu(sales, "Buffet", 30, 0, [
      { name: "Caesar salad" },
      { name: "Garden salad" },
    ]);
    const [wings] = await menu(sales, "Bar snacks", 0, 0, [
      { name: "Wings", sellingPrice: 4 },
    ]);
    await sales.run(async (ctx) => {
      for (const row of [caesar, wings]) {
        const menuDish = await ctx.db.get(row);
        await ctx.db.patch(menuDish.menuId, { coursePicksJson: rules });
      }
    });
    const client = (await proof.executeCommand(
      sales as never,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Course client" },
    )) as { docId: string };
    await sales.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      {
        clientId: client.docId,
        title: "Picnic",
        guestCount: 10,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        lines: [],
      },
    );
    const proposalId = (
      (await sales.query(api.queries.listProposal, {})) as any[]
    )[0]._id;
    const lines = async () =>
      ((await sales.query(api.queries.listProposalLineItem, {})) as any[])
        .filter((row) => row.proposalId === proposalId && row.deletedAt == null)
        .map((row) => ({
          description: row.description,
          unitPrice: row.unitPrice,
        }));
    const pick = (menuDishId: string) =>
      sales.mutation((api.lib as any).proposalDishPricing.pickProposalDish, {
        proposalId,
        menuDishId,
        quantityServings: 10,
      });
    const unpick = async (menuDishId: string) => {
      const dishId = ((await sales.run((ctx) => ctx.db.get(menuDishId))) as any)
        .dishId;
      const row = (
        (await sales.query(api.queries.listProposalDishSelection, {})) as any[]
      ).find(
        (item) =>
          item.deletedAt == null &&
          item.selectedAt != null &&
          String(item.dishId) === String(dishId),
      );
      await sales.mutation(
        (api.lib as any).proposalDishPricing.removeProposalDish,
        { docId: row._id, version: row.version },
      );
    };

    // A course-pick menu with no dish prices: the per-guest line comes with
    // the first pick and goes with the last.
    await pick(caesar);
    await pick(garden);
    expect(await lines()).toEqual([
      { description: "Buffet (per guest)", unitPrice: 30 },
    ]);
    await unpick(caesar);
    expect(await lines()).toEqual([
      { description: "Buffet (per guest)", unitPrice: 30 },
    ]);
    await unpick(garden);
    expect(await lines()).toEqual([]);

    // Course rules on a menu whose dishes carry their own prices: priced
    // dish by dish, and the dish line goes with its pick.
    await pick(wings);
    expect(await lines()).toEqual([{ description: "Wings", unitPrice: 4 }]);
    await unpick(wings);
    expect(await lines()).toEqual([]);
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
