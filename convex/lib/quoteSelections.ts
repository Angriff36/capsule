// PL-QUOTE (spec CF-4-3, AC-095/AC-243/AC-244): the quote form's structured
// picks. One resolver checks every pick against the published catalog and the
// menu's season and guest limits, and prices it with the same price rule as
// the public menu and proposals. The form's estimate, the stored submission
// and the converted draft proposal all come from it.

import { ConvexError, v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  effectiveSellingPrice,
  menuIneligibleReasons,
} from "../../src/lib/catalogEligibility";
import {
  buildQuoteEstimate,
  parseQuoteSelections,
  quoteProposalPlan,
  type QuoteEnhancementOffer,
  type QuoteEstimate,
  type QuoteProposalLine,
  type QuoteSelectionLine,
  type QuoteSelections,
} from "../../src/lib/quoteSelections";
import { resolveCatalogPrice } from "./proposalPricing";

export const quotePickValidator = v.object({
  menuDishId: v.id("menuDishes"),
  quantity: v.optional(v.number()),
});

export type QuotePick = { menuDishId: Id<"menuDishes">; quantity?: number };

const MAX_PICKS = 200;
const MAX_PORTIONS = 100000;

async function liveMenuDish(
  ctx: { db: any },
  tenantId: string,
  menuDishId: Id<"menuDishes">,
): Promise<{ md: Doc<"menuDishes">; dish: Doc<"dishes">; menu: Doc<"menus"> } | null> {
  const md: Doc<"menuDishes"> | null = await ctx.db.get(menuDishId);
  if (!md || md.tenantId !== tenantId || md.deletedAt != null) return null;
  if (md.addedAt == null) return null;
  const menu: Doc<"menus"> | null = await ctx.db.get(md.menuId);
  if (!menu || menu.tenantId !== tenantId || menu.deletedAt != null) return null;
  if (menu.status !== "published") return null;
  const dish: Doc<"dishes"> | null = await ctx.db.get(md.dishId);
  if (!dish || dish.tenantId !== tenantId || dish.deletedAt != null) return null;
  if (dish.status !== "active") return null;
  return { md, dish, menu };
}

function checkQuantity(quantity: number | undefined): number | null {
  if (quantity === undefined) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PORTIONS) {
    throw new ConvexError("Portions must be a whole number of 1 or more.");
  }
  return quantity;
}

/**
 * Check and price the visitor's picks. Menu picks must come from the chosen
 * menu; with a menu chosen and no picks, every dish on it is picked (one
 * per guest). Extras come from other published menus. A menu or extra that
 * is out of season on the event date or does not fit the guest count is
 * refused with the reason the public menu shows.
 */
export async function resolveQuoteSelections(
  ctx: { db: any },
  tenantId: string,
  args: {
    menuId?: Id<"menus">;
    picks?: QuotePick[];
    extras?: QuotePick[];
    eventDate: number;
    guestCount: number;
  },
): Promise<QuoteSelections> {
  const picks = args.picks ?? [];
  const extras = args.extras ?? [];
  if (picks.length + extras.length > MAX_PICKS) {
    throw new ConvexError("That is too many dishes for one request.");
  }
  if (picks.length > 0 && !args.menuId) {
    throw new ConvexError("Pick a menu before picking its dishes.");
  }
  const now = Date.now();
  const refuseIneligible = (menu: Doc<"menus">) => {
    const reasons = menuIneligibleReasons(menu, {
      eventDate: args.eventDate,
      guestCount: args.guestCount,
    });
    if (reasons.length > 0) {
      throw new ConvexError(`${menu.name}: ${reasons.join("; ")}.`);
    }
  };

  let menu: Doc<"menus"> | null = null;
  if (args.menuId) {
    const found: Doc<"menus"> | null = await ctx.db.get(args.menuId);
    if (
      !found ||
      found.tenantId !== tenantId ||
      found.deletedAt != null ||
      found.status !== "published"
    ) {
      throw new ConvexError("That menu is no longer offered. Pick another.");
    }
    refuseIneligible(found);
    menu = found;
  }

  const lines: QuoteSelectionLine[] = [];
  const seen = new Set<string>();
  const addLine = async (
    kind: QuoteSelectionLine["kind"],
    pick: QuotePick,
  ) => {
    if (seen.has(pick.menuDishId)) return;
    seen.add(pick.menuDishId);
    const found = await liveMenuDish(ctx, tenantId, pick.menuDishId);
    if (!found) {
      throw new ConvexError("A dish you picked is no longer offered. Pick another.");
    }
    if (kind === "menu" && found.menu._id !== menu?._id) {
      throw new ConvexError(`${found.dish.name} is not on the menu you picked.`);
    }
    if (kind === "extra") {
      if (found.menu._id === menu?._id) {
        throw new ConvexError(`${found.dish.name} is already on your menu.`);
      }
      refuseIneligible(found.menu);
    }
    lines.push({
      kind,
      menuId: found.menu._id,
      menuDishId: found.md._id,
      dishId: found.dish._id,
      name: found.dish.name,
      quantity: checkQuantity(pick.quantity),
      unitPrice: effectiveSellingPrice(found.md, now),
    });
  };

  if (menu && picks.length === 0) {
    const onMenu: Doc<"menuDishes">[] = await ctx.db
      .query("menuDishes")
      .withIndex("by_menuId", (q: any) => q.eq("menuId", menu._id))
      .collect();
    for (const md of onMenu.sort((a, b) => a.sortOrder - b.sortOrder)) {
      if (await liveMenuDish(ctx, tenantId, md._id)) {
        await addLine("menu", { menuDishId: md._id });
      }
    }
  }
  for (const pick of picks) await addLine("menu", pick);
  for (const extra of extras) await addLine("extra", extra);

  return {
    menu: menu
      ? {
          menuId: menu._id,
          name: menu.name,
          basePrice: Number(menu.basePrice) || 0,
          pricePerPerson: Number(menu.pricePerPerson) || 0,
        }
      : null,
    lines,
  };
}

/**
 * Anonymous estimate for the public quote form: the same resolver and price
 * calculation the stored submission and the draft proposal use. Null until
 * there is something to price.
 */
export const estimateQuote = query({
  args: {
    eventDate: v.number(),
    guestCount: v.number(),
    menuId: v.optional(v.id("menus")),
    picks: v.optional(v.array(quotePickValidator)),
    extras: v.optional(v.array(quotePickValidator)),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; estimate: QuoteEstimate }
    | { ok: false; problem: string }
    | null
  > => {
    if (!args.menuId && !(args.extras?.length ?? 0)) return null;
    if (!Number.isFinite(args.guestCount) || args.guestCount < 1) return null;
    const org = await ctx.db
      .query("organizations")
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!org) return null;
    try {
      const selections = await resolveQuoteSelections(ctx, org.tenantId, args);
      return {
        ok: true,
        estimate: buildQuoteEstimate(selections, args.guestCount),
      };
    } catch (error) {
      if (error instanceof ConvexError) {
        return { ok: false, problem: String(error.data) };
      }
      throw error;
    }
  },
});

export type QuoteConversionPlan = {
  lines: Array<QuoteProposalLine & { menuDishId?: Id<"menuDishes"> }>;
  enhancements: QuoteEnhancementOffer[];
  dishSelections: Array<{
    menuId: Id<"menus">;
    dishId: Id<"dishes">;
    quantityServings: number;
  }>;
};

/**
 * What conversion adds to the draft proposal for a submission's picks,
 * priced at today's catalog price (the proposal is the formal price; the
 * stored estimate stays as what the visitor saw). Lines are empty once the
 * proposal has any; the caller keys each extra and dish pick to the
 * submission, so a retried conversion fills gaps and adds nothing twice.
 */
export const quoteConversionPlan = internalQuery({
  args: {
    proposalId: v.id("proposals"),
    submissionId: v.id("quoteSubmissions"),
  },
  handler: async (
    ctx,
    { proposalId, submissionId },
  ): Promise<QuoteConversionPlan> => {
    const empty: QuoteConversionPlan = {
      lines: [],
      enhancements: [],
      dishSelections: [],
    };
    const proposal = await ctx.db.get(proposalId);
    const submission = await ctx.db.get(submissionId);
    if (!proposal || !submission || proposal.tenantId !== submission.tenantId) {
      return empty;
    }
    const tenantId = proposal.tenantId;
    const guestCount = Number(submission.guestCount) || 0;
    const stored = parseQuoteSelections(submission.selectionsJson);
    // Older submissions stored only the menu: every dish on it, per guest.
    const picks: QuotePick[] = [];
    const extras: QuotePick[] = [];
    for (const line of stored?.lines ?? []) {
      const pick = {
        menuDishId: line.menuDishId as Id<"menuDishes">,
        ...(line.quantity != null ? { quantity: line.quantity } : {}),
      };
      (line.kind === "extra" ? extras : picks).push(pick);
    }
    const current: QuoteSelections = { menu: null, lines: [] };
    const menuId = (submission.menuId ?? undefined) as Id<"menus"> | undefined;
    // Re-read each pick at today's catalog; a pick that left the catalog
    // since submission is skipped (its name stays on the stored request).
    if (menuId) {
      const menu = await ctx.db.get(menuId);
      if (menu && menu.tenantId === tenantId && menu.status === "published" && menu.deletedAt == null) {
        current.menu = {
          menuId: menu._id,
          name: menu.name,
          basePrice: Number(menu.basePrice) || 0,
          pricePerPerson: Number(menu.pricePerPerson) || 0,
        };
        const menuPicks: QuotePick[] =
          stored != null
            ? picks
            : (
                await ctx.db
                  .query("menuDishes")
                  .withIndex("by_menuId", (q) => q.eq("menuId", menuId))
                  .collect()
              )
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((md) => ({ menuDishId: md._id }));
        for (const pick of menuPicks) {
          const found = await liveMenuDish(ctx, tenantId, pick.menuDishId);
          if (!found || found.menu._id !== menuId) continue;
          current.lines.push({
            kind: "menu",
            menuId: menuId,
            menuDishId: found.md._id,
            dishId: found.dish._id,
            name: found.dish.name,
            quantity: pick.quantity ?? null,
            unitPrice: await resolveCatalogPrice(ctx, found.md._id, tenantId),
          });
        }
      }
    }
    for (const extra of extras) {
      const found = await liveMenuDish(ctx, tenantId, extra.menuDishId);
      if (!found) continue;
      current.lines.push({
        kind: "extra",
        menuId: found.menu._id,
        menuDishId: found.md._id,
        dishId: found.dish._id,
        name: found.dish.name,
        quantity: extra.quantity ?? null,
        unitPrice: await resolveCatalogPrice(ctx, found.md._id, tenantId),
      });
    }

    const plan = quoteProposalPlan(current, guestCount);
    const live = <T extends { deletedAt?: number | null }>(rows: T[]) =>
      rows.filter((row) => row.deletedAt == null);
    // A retried conversion adds only the lines still missing: a line is
    // already there when a live line has the same place, text and dish.
    const saved = live(
      await ctx.db
        .query("proposalLineItems")
        .withIndex("by_proposalId", (q) => q.eq("proposalId", proposalId))
        .collect(),
    );
    const isSaved = (line: (typeof plan.lines)[number], sortOrder: number) =>
      saved.some(
        (row) =>
          row.sortOrder === sortOrder &&
          row.description === line.description &&
          (row.menuDishId ?? null) === (line.menuDishId ?? null),
      );

    return {
      lines: plan.lines
        .map((line, sortOrder) => ({ line, sortOrder }))
        .filter(({ line, sortOrder }) => !isSaved(line, sortOrder))
        .map(({ line, sortOrder }) => ({
          ...line,
          sortOrder,
          menuDishId: line.menuDishId as Id<"menuDishes"> | undefined,
        })),
      enhancements: plan.enhancements,
      dishSelections: current.lines
        .filter((line) => line.kind === "menu")
        .map((line) => ({
          menuId: line.menuId as Id<"menus">,
          dishId: line.dishId as Id<"dishes">,
          quantityServings: line.quantity ?? Math.max(guestCount, 1),
        })),
    };
  },
});
