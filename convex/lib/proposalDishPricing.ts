// Proposal dish picks with their price, in one server step.
//
// Picking a catalog dish on a proposal added it to the menu but no price line,
// so the client got it free. A browser-side fix (0e6c106f, reverted ae543e81)
// priced picks from whatever lines the page had loaded: it could charge a dish
// twice (a mixed menu, or picks made before the lines loaded) and a failed
// second save left a dish and its price out of step. Here the pick and its
// price line commit in ONE transaction (nested runMutation = subtransactions;
// a throw rolls back both), and coverage is read from the stored lines.
//
// Rules (draft proposals only - the line commands accept no other status; a
// sent/viewed proposal keeps the "Not in the price yet" warning):
//   - a dish no line covers gets its own per-serving line at its catalog price;
//   - a menu priced per guest (no dish of it has its own price) gets its
//     per-guest line (and base price line) once every dish of it is picked;
//   - servings follow onto the dish's own line; removing a pick removes only
//     the dish's own line. A per-guest menu line stays: it is the menu's price,
//     and one dish less does not make the rest free.

import { mutation } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { effectiveSellingPrice } from "../../src/lib/catalogEligibility";
import { getAuthContext } from "./authContext";

async function activeLines(
  ctx: { db: any },
  proposalId: Id<"proposals">,
): Promise<Doc<"proposalLineItems">[]> {
  return (
    await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q: any) => q.eq("proposalId", proposalId))
      .collect()
  ).filter((row: any) => row.deletedAt == null);
}

// Published, non-removed catalog dishes of one menu whose dish is active -
// the lines the proposal page offers as picks.
async function catalogLines(
  ctx: { db: any },
  menuId: Id<"menus">,
): Promise<Doc<"menuDishes">[]> {
  const rows: Doc<"menuDishes">[] = await ctx.db
    .query("menuDishes")
    .withIndex("by_menuId", (q: any) => q.eq("menuId", menuId))
    .collect();
  const live: Doc<"menuDishes">[] = [];
  for (const row of rows) {
    if (row.deletedAt != null || row.addedAt == null) continue;
    const dish = await ctx.db.get(row.dishId);
    if (dish && String(dish.status) === "active") live.push(row);
  }
  return live;
}

// The dish's own price line: a line linked to a catalog row of this menu and
// dish.
async function ownLine(
  ctx: { db: any },
  lines: Doc<"proposalLineItems">[],
  menuId: string,
  dishId: string,
): Promise<Doc<"proposalLineItems"> | undefined> {
  for (const line of lines) {
    if (!line.menuDishId) continue;
    const menuDish = await ctx.db.get(line.menuDishId);
    if (
      menuDish &&
      String(menuDish.menuId) === menuId &&
      String(menuDish.dishId) === dishId
    )
      return line;
  }
  return undefined;
}

async function proposalOf(ctx: any, proposalId: Id<"proposals">) {
  const auth = await getAuthContext(ctx);
  const proposal = await ctx.db.get(proposalId);
  if (!proposal || !auth.tenantId || proposal.tenantId !== auth.tenantId) {
    throw new Error("Proposal not found");
  }
  return proposal as Doc<"proposals">;
}

async function selectionOf(ctx: any, docId: Id<"proposalDishSelections">) {
  const auth = await getAuthContext(ctx);
  const selection = await ctx.db.get(docId);
  if (!selection || !auth.tenantId || selection.tenantId !== auth.tenantId) {
    throw new Error("Dish pick not found");
  }
  return selection as Doc<"proposalDishSelections">;
}

export const pickProposalDish = mutation({
  args: {
    proposalId: v.id("proposals"),
    menuDishId: v.id("menuDishes"),
    quantityServings: v.number(),
  },
  handler: async (ctx, args) => {
    const proposal = await proposalOf(ctx, args.proposalId);
    const menuDish = await ctx.db.get(args.menuDishId);
    if (!menuDish || menuDish.tenantId !== proposal.tenantId) {
      throw new Error("That dish is not in your menu catalog.");
    }
    await ctx.runMutation(api.mutations.ProposalDishSelection_createViaSelect, {
      proposalId: args.proposalId,
      menuId: menuDish.menuId,
      dishId: menuDish.dishId,
      quantityServings: args.quantityServings,
      course: menuDish.course ?? undefined,
      serviceStyle: menuDish.serviceStyle ?? undefined,
    });
    if (proposal.status !== "draft") return;

    const menu = await ctx.db.get(menuDish.menuId);
    const dish = await ctx.db.get(menuDish.dishId);
    if (!menu || !dish) return;
    const lines = await activeLines(ctx, args.proposalId);
    // Covered already: its own line, the menu's per-guest line, or a custom
    // line named after the dish.
    if (
      (await ownLine(ctx, lines, String(menu._id), String(dish._id))) ||
      lines.some(
        (line) =>
          (String(line.pricingBasis) === "per_person" &&
            line.description.startsWith(`${menu.name} (per `)) ||
          line.description.trim().toLowerCase() ===
            dish.name.trim().toLowerCase(),
      )
    )
      return;

    let sortOrder =
      lines.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), -1) +
      1;
    const now = Date.now();
    const price = effectiveSellingPrice(menuDish, now);
    if (price != null && price > 0) {
      await ctx.runMutation(api.lib.proposalPricing.addProposalLineAndRecompute, {
        proposalId: args.proposalId,
        description: dish.name,
        pricingBasis: "per_unit",
        unitPrice: price,
        quantity: args.quantityServings,
        unit: "servings",
        sortOrder,
        menuDishId: args.menuDishId,
      });
      return;
    }

    // A menu priced per guest: its price line comes when the whole menu is
    // picked. A menu whose dishes carry their own prices never gets one, so a
    // dish is never charged twice.
    if (Number(menu.pricePerPerson) <= 0) return;
    const offered = await catalogLines(ctx, menu._id);
    if (
      offered.some((row) => (effectiveSellingPrice(row, now) ?? 0) > 0)
    )
      return;
    const picked = new Set(
      (
        await ctx.db
          .query("proposalDishSelections")
          .withIndex("by_proposalId", (q) =>
            q.eq("proposalId", args.proposalId),
          )
          .collect()
      )
        .filter((row) => row.deletedAt == null && row.selectedAt != null)
        .map((row) => `${row.menuId}:${row.dishId}`),
    );
    if (!offered.every((row) => picked.has(`${row.menuId}:${row.dishId}`)))
      return;
    await ctx.runMutation(api.lib.proposalPricing.addProposalLineAndRecompute, {
      proposalId: args.proposalId,
      description: `${menu.name} (per guest)`,
      pricingBasis: "per_person",
      unitPrice: Number(menu.pricePerPerson),
      sortOrder: sortOrder++,
    });
    if (Number(menu.basePrice) > 0)
      await ctx.runMutation(
        api.lib.proposalPricing.addProposalLineAndRecompute,
        {
          proposalId: args.proposalId,
          description: `${menu.name} (base price)`,
          pricingBasis: "flat",
          unitPrice: Number(menu.basePrice),
          sortOrder,
        },
      );
  },
});

export const adjustProposalDishServings = mutation({
  args: {
    docId: v.id("proposalDishSelections"),
    version: v.optional(v.number()),
    quantityServings: v.number(),
  },
  handler: async (ctx, args) => {
    const selection = await selectionOf(ctx, args.docId);
    await ctx.runMutation(api.mutations.ProposalDishSelection_adjustServings, {
      docId: args.docId,
      version: args.version,
      quantityServings: args.quantityServings,
    });
    const proposal = await ctx.db.get(selection.proposalId);
    if (!proposal || proposal.status !== "draft") return;
    const line = await ownLine(
      ctx,
      await activeLines(ctx, selection.proposalId),
      String(selection.menuId),
      String(selection.dishId),
    );
    if (!line || String(line.pricingBasis) !== "per_unit") return;
    await ctx.runMutation(
      api.lib.proposalPricing.reviseProposalLineAndRecompute,
      {
        docId: line._id,
        version: Number(line.version),
        description: line.description,
        pricingBasis: "per_unit",
        unitPrice: Number(line.unitPrice),
        quantity: args.quantityServings,
        unit: line.unit ?? undefined,
        sortOrder: line.sortOrder ?? undefined,
        notes: line.notes ?? undefined,
        menuDishId: (line.menuDishId ?? undefined) as
          | Id<"menuDishes">
          | undefined,
        overrideReason: line.overrideReason ?? undefined,
      },
    );
  },
});

export const removeProposalDish = mutation({
  args: {
    docId: v.id("proposalDishSelections"),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const selection = await selectionOf(ctx, args.docId);
    await ctx.runMutation(api.mutations.ProposalDishSelection_remove, {
      docId: args.docId,
      version: args.version,
    });
    const proposal = await ctx.db.get(selection.proposalId);
    if (!proposal || proposal.status !== "draft") return;
    const line = await ownLine(
      ctx,
      await activeLines(ctx, selection.proposalId),
      String(selection.menuId),
      String(selection.dishId),
    );
    if (!line) return;
    await ctx.runMutation(
      api.lib.proposalPricing.removeProposalLineAndRecompute,
      { docId: line._id, version: Number(line.version) },
    );
  },
});
