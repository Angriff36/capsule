// PL-SCALE (AC-172): the recipe, price and stock rows behind the dishes on
// one event menu. The event Menu tab read ten whole-company lists (every
// dish ingredient, recipe, recipe line, ingredient, price, unit mapping,
// pan, stock item and hold) to cost and check a menu of a few dishes. Here
// each row comes through an index from the menu's dishes. Each kind keeps
// the read rule of its generated list; a kind the caller may not read is [].
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";
import { DISH_IDS_CAP } from "./dishLookup";
import { latestPriceByIngredient } from "../src/features/kitchen/IngredientPriceHistory";

export type MenuRecipeRows = {
  dishIngredients: Doc<"dishIngredients">[];
  dishComponents: Doc<"dishComponents">[];
  components: Doc<"components">[];
  componentIngredients: Doc<"componentIngredients">[];
  ingredients: Doc<"ingredients">[];
  priceObservations: Doc<"ingredientPriceObservations">[];
  unitMappings: Doc<"itemUnitMappings">[];
  containers: Doc<"dishContainers">[];
  inventoryItems: Doc<"inventoryItems">[];
  inventoryReservations: Doc<"inventoryReservations">[];
};

const live = <T extends { tenantId: string; deletedAt?: number | null }>(
  rows: T[],
  tenantId: string,
) => rows.filter((row) => row.tenantId === tenantId && row.deletedAt == null);

/** Rows for these dishes (ids past DISH_IDS_CAP are ignored). */
export const forDishes = query({
  args: { dishIds: v.array(v.string()) },
  handler: async (ctx, { dishIds }): Promise<MenuRecipeRows | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return null;
    const tenantId = auth.tenantId;
    const kitchen = canRead(auth, ["kitchenAccess"]);
    const ingredientRead = canRead(auth, [
      "kitchenAccess",
      "inventoryAccess",
      "manageAccess",
    ]);
    const priceRead = canRead(auth, [
      "kitchenAccess",
      "procurementAccess",
      "manageAccess",
    ]);
    const stockRead = canRead(auth, ["inventoryAccess", "manageAccess"]);
    const holdRead = canRead(auth, ["inventoryAccess", "eventManageAccess"]);

    const dishes: Id<"dishes">[] = [];
    for (const raw of [...new Set(dishIds)].slice(0, DISH_IDS_CAP)) {
      const id = ctx.db.normalizeId("dishes", raw);
      if (id) dishes.push(id);
    }

    // The recipe tree is read for every kind below, even when the caller
    // may not see it, so ingredient, price and stock rows follow the menu.
    const dishIngredients: Doc<"dishIngredients">[] = [];
    const dishComponents: Doc<"dishComponents">[] = [];
    const containers: Doc<"dishContainers">[] = [];
    for (const dishId of dishes) {
      dishIngredients.push(
        ...live(
          await ctx.db
            .query("dishIngredients")
            .withIndex("by_dishId", (q) => q.eq("dishId", dishId))
            .collect(),
          tenantId,
        ),
      );
      dishComponents.push(
        ...live(
          await ctx.db
            .query("dishComponents")
            .withIndex("by_dishId", (q) => q.eq("dishId", dishId))
            .collect(),
          tenantId,
        ),
      );
      if (kitchen)
        containers.push(
          ...live(
            await ctx.db
              .query("dishContainers")
              .withIndex("by_dishId", (q) => q.eq("dishId", dishId))
              .collect(),
            tenantId,
          ),
        );
    }
    const componentIds = [
      ...new Set(dishComponents.map((row) => row.componentId)),
    ];
    const components: Doc<"components">[] = [];
    const componentIngredients: Doc<"componentIngredients">[] = [];
    for (const componentId of componentIds) {
      const component = await ctx.db.get(componentId);
      if (
        component &&
        component.tenantId === tenantId &&
        component.deletedAt == null
      )
        components.push(component);
      componentIngredients.push(
        ...live(
          await ctx.db
            .query("componentIngredients")
            .withIndex("by_componentId", (q) =>
              q.eq("componentId", componentId),
            )
            .collect(),
          tenantId,
        ),
      );
    }

    // Menu ingredients, then their saved substitutes (the stock shortage
    // card ranks those).
    const ingredients = await readIngredients(
      ctx,
      tenantId,
      new Set<string>([
        ...dishIngredients.map((row) => String(row.ingredientId)),
        ...componentIngredients.map((row) => String(row.ingredientId)),
      ]),
    );
    const substituteIds = new Set<string>();
    for (const ingredient of ingredients)
      for (const id of ingredient.substituteIngredientIds ?? [])
        substituteIds.add(String(id));
    for (const ingredient of ingredients) substituteIds.delete(ingredient._id);
    const allIngredients = [
      ...ingredients,
      ...(await readIngredients(ctx, tenantId, substituteIds)),
    ];
    const menuIngredientIds = ingredients.map((row) => row._id);

    const priceObservations: Doc<"ingredientPriceObservations">[] = [];
    const unitMappings: Doc<"itemUnitMappings">[] = [];
    // Only the latest price of each ingredient, the one a cost uses; older
    // prices stay on the server.
    if (priceRead)
      for (const ingredientId of menuIngredientIds) {
        const rows = live(
          await ctx.db
            .query("ingredientPriceObservations")
            .withIndex("by_ingredientId", (q) =>
              q.eq("ingredientId", ingredientId),
            )
            .collect(),
          tenantId,
        );
        const latest = latestPriceByIngredient(rows).get(ingredientId);
        const row = latest && rows.find((entry) => entry._id === latest._id);
        if (row) priceObservations.push(row);
      }
    if (ingredientRead) {
      for (const ingredientId of menuIngredientIds)
        unitMappings.push(
          ...live(
            await ctx.db
              .query("itemUnitMappings")
              .withIndex("by_ingredientId", (q) =>
                q.eq("ingredientId", ingredientId),
              )
              .collect(),
            tenantId,
          ),
        );
      // Mappings with no ingredient apply to every line.
      for (const none of [null, undefined])
        unitMappings.push(
          ...live(
            await ctx.db
              .query("itemUnitMappings")
              .withIndex("by_ingredientId", (q) => q.eq("ingredientId", none))
              .collect(),
            tenantId,
          ),
        );
    }

    const inventoryItems: Doc<"inventoryItems">[] = [];
    const inventoryReservations: Doc<"inventoryReservations">[] = [];
    if (stockRead || holdRead)
      for (const ingredient of allIngredients) {
        const items = live(
          await ctx.db
            .query("inventoryItems")
            .withIndex("by_ingredientId", (q) =>
              q.eq("ingredientId", ingredient._id),
            )
            .collect(),
          tenantId,
        );
        if (stockRead) inventoryItems.push(...items);
        if (holdRead)
          for (const item of items)
            inventoryReservations.push(
              ...live(
                await ctx.db
                  .query("inventoryReservations")
                  .withIndex("by_inventoryItemId", (q) =>
                    q.eq("inventoryItemId", item._id),
                  )
                  .collect(),
                tenantId,
              ),
            );
      }

    return {
      dishIngredients: kitchen ? dishIngredients : [],
      dishComponents: kitchen ? dishComponents : [],
      components: kitchen ? components : [],
      componentIngredients: kitchen ? componentIngredients : [],
      ingredients: ingredientRead ? allIngredients : [],
      priceObservations,
      unitMappings,
      containers,
      inventoryItems,
      inventoryReservations,
    };
  },
});

async function readIngredients(
  ctx: QueryCtx,
  tenantId: string,
  ids: Set<string>,
): Promise<Doc<"ingredients">[]> {
  const rows: Doc<"ingredients">[] = [];
  for (const raw of ids) {
    const id = ctx.db.normalizeId("ingredients", raw);
    const row = id ? await ctx.db.get(id) : null;
    if (row && row.tenantId === tenantId && row.deletedAt == null)
      rows.push(row);
  }
  return rows;
}
