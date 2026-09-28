// PL-PUBLIC-MENU (AC-241): a quote request can name a menu from the public
// menu. These helpers check that choice and turn it into draft proposal lines
// priced from the SAME catalog and price rule as the public menu and every
// proposal (resolveCatalogPrice → src/lib/catalogEligibility), so the client
// is quoted the price they saw.

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { resolveCatalogPrice } from "./proposalPricing";

/** The menu, when it is a live published menu of this company; else null. */
export async function publishedMenu(
  ctx: { db: any },
  tenantId: string,
  menuId: Id<"menus">,
): Promise<Doc<"menus"> | null> {
  const menu: Doc<"menus"> | null = await ctx.db.get(menuId);
  return menu &&
    menu.tenantId === tenantId &&
    menu.deletedAt == null &&
    menu.status === "published"
    ? menu
    : null;
}

export type ChosenMenuLine = {
  description: string;
  pricingBasis: "per_person" | "flat";
  unitPrice: number;
  menuDishId?: Id<"menuDishes">;
};

/**
 * Lines for the chosen menu, or none when the proposal already has lines (a
 * retried conversion never adds them twice) or the menu is no longer
 * published. A menu with its own price (per person and/or a base fee) is
 * quoted at that price; otherwise each dish with a price in force today is a
 * per-person line linked to its catalog row.
 */
export const chosenMenuLines = internalQuery({
  args: { proposalId: v.id("proposals"), menuId: v.id("menus") },
  handler: async (ctx, { proposalId, menuId }): Promise<ChosenMenuLine[]> => {
    const proposal = await ctx.db.get(proposalId);
    if (!proposal) return [];
    const existing = (
      await ctx.db
        .query("proposalLineItems")
        .withIndex("by_proposalId", (q) => q.eq("proposalId", proposalId))
        .collect()
    ).filter((row) => row.deletedAt == null);
    if (existing.length > 0) return [];
    const menu = await publishedMenu(ctx, proposal.tenantId, menuId);
    if (!menu) return [];

    const basePrice = Number(menu.basePrice) || 0;
    const perPerson = Number(menu.pricePerPerson) || 0;
    if (basePrice > 0 || perPerson > 0) {
      const lines: ChosenMenuLine[] = [];
      if (perPerson > 0) {
        lines.push({
          description: `${menu.name} (per person)`,
          pricingBasis: "per_person",
          unitPrice: perPerson,
        });
      }
      if (basePrice > 0) {
        lines.push({
          description: `${menu.name} (base fee)`,
          pricingBasis: "flat",
          unitPrice: basePrice,
        });
      }
      return lines;
    }

    const menuDishes = (
      await ctx.db
        .query("menuDishes")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", proposal.tenantId))
        .collect()
    )
      .filter((md) => md.menuId === menuId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const lines: ChosenMenuLine[] = [];
    for (const md of menuDishes) {
      const price = await resolveCatalogPrice(ctx, md._id, proposal.tenantId);
      if (price == null) continue;
      const dish = await ctx.db.get(md.dishId);
      lines.push({
        description: dish?.name ?? "Dish",
        pricingBasis: "per_person",
        unitPrice: price,
        menuDishId: md._id,
      });
    }
    return lines;
  },
});
