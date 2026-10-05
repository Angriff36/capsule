import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { deriveDishAllergens } from "../src/features/kitchen/dishAllergens";
import {
  effectiveSellingPrice,
  menuIneligibleReasons,
  menuPriceLabel,
  type MenuPriceLabel,
} from "../src/lib/catalogEligibility";
import { clockNow } from "./lib/clockNow";

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
    clock: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { eventDate, guestCount, clock },
  ): Promise<PublicMenu[]> => {
    const org = await ctx.db
      .query("organizations")
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!org) return [];
    const tenantId = org.tenantId;
    const now = clockNow(clock);

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

    // Allergens from each listed dish's recipe (ingredients and recipe marks)
    // plus the ones typed on the dish: a guest must never see fewer.
    const allergensByDish = new Map<string, string[]>();
    for (const menu of menus)
      for (const md of lines) {
        const dish = md.menuId === menu._id && dishes.get(md.dishId as string);
        if (dish && !allergensByDish.has(dish._id))
          allergensByDish.set(
            dish._id,
            await recipeAllergens(ctx, tenantId, dish),
          );
      }

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
                allergens: allergensByDish.get(dish._id) ?? [],
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

export type PublicMenuCompany = {
  name: string;
  address: string | null;
  logoUrl: string | null;
};

/**
 * The company head and foot of the printed menu: the Branding name, address
 * and logo of the same organization getPublicMenu serves. Nothing else.
 */
export const getPublicMenuCompany = query({
  args: {},
  handler: async (ctx): Promise<PublicMenuCompany | null> => {
    const org = await ctx.db
      .query("organizations")
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!org) return null;
    const logoId =
      typeof org.brandLogoStorageId === "string"
        ? ctx.db.system.normalizeId("_storage", org.brandLogoStorageId)
        : null;
    return {
      name: org.brandDisplayName?.trim() || org.name,
      address: org.brandAddress?.trim() || null,
      logoUrl: logoId ? await ctx.storage.getUrl(logoId) : null,
    };
  },
});

/** One dish's allergen codes from its recipe, read through indexes. */
async function recipeAllergens(
  ctx: QueryCtx,
  tenantId: string,
  dish: Doc<"dishes">,
): Promise<string[]> {
  const recipeId = ctx.db.normalizeId(
    "dishes",
    String(dish.recipeDishId ?? dish._id),
  );
  if (!recipeId) return (dish.allergenSummary ?? []).map(String);
  const mine = <T extends { tenantId: string; deletedAt?: number | null }>(
    rows: T[],
  ) => rows.filter((row) => row.tenantId === tenantId && row.deletedAt == null);
  const withIngredient = async <T extends { ingredientId: Id<"ingredients"> }>(
    rows: T[],
  ) => {
    const out: (T & { ingredient: Doc<"ingredients"> | null })[] = [];
    for (const row of rows) {
      const ingredient = await ctx.db.get(row.ingredientId);
      out.push({
        ...row,
        ingredient: ingredient?.tenantId === tenantId ? ingredient : null,
      });
    }
    return out;
  };
  const dishIngredients = await withIngredient(
    mine(
      await ctx.db
        .query("dishIngredients")
        .withIndex("by_dishId", (q) => q.eq("dishId", recipeId))
        .collect(),
    ),
  );
  const dishComponents = mine(
    await ctx.db
      .query("dishComponents")
      .withIndex("by_dishId", (q) => q.eq("dishId", recipeId))
      .collect(),
  );
  const components: Doc<"components">[] = [];
  const componentIngredients: Doc<"componentIngredients">[] = [];
  for (const link of dishComponents) {
    const component = await ctx.db.get(link.componentId);
    if (component?.tenantId === tenantId) components.push(component);
    componentIngredients.push(
      ...(await withIngredient(
        mine(
          await ctx.db
            .query("componentIngredients")
            .withIndex("by_componentId", (q) =>
              q.eq("componentId", link.componentId),
            )
            .collect(),
        ),
      )),
    );
  }
  return deriveDishAllergens(dish, {
    dishIngredients,
    dishComponents,
    componentIngredients,
    ingredients: [],
    components,
  }).codes;
}
