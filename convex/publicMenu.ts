import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  effectiveSellingPrice,
  menuIneligibleReasons,
  menuPriceLabel,
  type MenuPriceLabel,
} from "../src/lib/catalogEligibility";

// Anonymous public menu (spec CF-4-2). It reads the SAME catalog the proposal
// builder prices from — published menus and their active dishes — through the
// same price rule (src/lib/catalogEligibility), so the web menu, the quote
// form and proposals never disagree. Only client-facing fields leave here:
// no food cost, vendor cost, margin, recipes, staff or client data.
//
// Tenant: the active organization this deployment serves, the same rule the
// public /quote form uses (quoteBuilder.getQuoteFormOptions).

export type PublicMenuDish = {
  menuDishId: Doc<"menuDishes">["_id"];
  name: string;
  description: string | null;
  course: string | null;
  serviceStyle: string | null;
  dietaryTags: string[];
  allergens: string[];
  /** Sell price in force today; null = priced with the quote. */
  price: number | null;
};

export type PublicMenu = {
  menuId: Doc<"menus">["_id"];
  name: string;
  description: string | null;
  category: string | null;
  price: MenuPriceLabel;
  minGuests: number;
  maxGuests: number;
  availableFrom: number | null;
  availableUntil: number | null;
  /** Why this menu does not fit the given event; empty when it does. */
  notAvailableBecause: string[];
  dishes: PublicMenuDish[];
};

export const getPublicMenu = query({
  args: {
    eventDate: v.optional(v.number()),
    guestCount: v.optional(v.number()),
  },
  handler: async (ctx, { eventDate, guestCount }): Promise<PublicMenu[]> => {
    const org = await ctx.db
      .query("organizations")
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!org) return [];
    const tenantId = org.tenantId;
    const now = Date.now();

    const menus = (
      await ctx.db
        .query("menus")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    ).filter((m) => m.deletedAt == null && m.status === "published");
    if (menus.length === 0) return [];

    const lines = (
      await ctx.db
        .query("menuDishes")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    ).filter((md) => md.deletedAt == null && md.addedAt != null);
    const dishes = new Map(
      (
        await ctx.db
          .query("dishes")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .collect()
      )
        .filter((d) => d.deletedAt == null && d.status === "active")
        .map((d) => [d._id as string, d]),
    );

    return menus
      .map((menu): PublicMenu => {
        const menuDishes = lines
          .filter((md) => md.menuId === menu._id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .flatMap((md): PublicMenuDish[] => {
            const dish = dishes.get(md.dishId as string);
            if (!dish) return [];
            return [
              {
                menuDishId: md._id,
                name: dish.name,
                description: dish.description ?? null,
                course: md.course ?? dish.course ?? null,
                serviceStyle: md.serviceStyle ?? dish.serviceStyle ?? null,
                dietaryTags: dish.dietaryTags ?? [],
                allergens: (dish.allergenSummary ?? []).map(String),
                price: effectiveSellingPrice(md, now),
              },
            ];
          });
        return {
          menuId: menu._id,
          name: menu.name,
          description: menu.description ?? null,
          category: menu.category ?? null,
          price: menuPriceLabel(menu),
          minGuests: menu.minGuests,
          maxGuests: menu.maxGuests,
          availableFrom: menu.availableFrom ?? null,
          availableUntil: menu.availableUntil ?? null,
          notAvailableBecause: menuIneligibleReasons(menu, {
            eventDate,
            guestCount,
          }),
          dishes: menuDishes,
        };
      })
      .sort(
        (a, b) =>
          (a.category ?? "").localeCompare(b.category ?? "") ||
          a.name.localeCompare(b.name),
      );
  },
});
