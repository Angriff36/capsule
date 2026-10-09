// PL-REPLACEMENT-PROOF (Event Food MUDA): the plate cost of each dish on an
// event's menu, so the closeout can say what the food left over cost to
// make. Same arithmetic as the dish page and the event Menu tab
// (buildEventMenuCost, one serving per dish). Rows come through indexes from
// the event's own menu lines; callers are closeout readers, who already see
// the event's food cost.
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { buildEventMenuCost } from "../../src/features/events/eventMenuCost";
import { latestPriceByIngredient } from "../../src/features/kitchen/IngredientPriceHistory";
import { RecordedUnitMappings } from "../../src/lib/recordedUnitMappings";
import type { ProjectionLeftoverDishCost } from "../../src/lib/closeoutSourceProjection";
import { newestPriceRows } from "./newestPrices";

const live = <T extends { tenantId: string; deletedAt?: number | null }>(
  rows: T[],
  tenantId: string,
) => rows.filter((row) => row.tenantId === tenantId && row.deletedAt == null);

export async function loadLeftoverDishCosts(
  ctx: QueryCtx,
  tenantId: string,
  eventId: Id<"events">,
): Promise<ProjectionLeftoverDishCost[]> {
  const lines = live(
    await ctx.db
      .query("eventDishes")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
    tenantId,
  );
  // Each menu line: the dish the staff named, costed from the recipe it cooks.
  const menu: { name: string; recipe: Doc<"dishes">; shown: Doc<"dishes"> }[] =
    [];
  for (const line of lines) {
    const shown = await ctx.db.get(line.dishId);
    const recipe = line.recipeDishId ? await ctx.db.get(line.recipeDishId) : shown;
    if (!shown || shown.tenantId !== tenantId) continue;
    if (!recipe || recipe.tenantId !== tenantId) continue;
    menu.push({ name: shown.name, recipe, shown });
  }
  if (menu.length === 0) return [];

  const recipeIds = [...new Set(menu.map((m) => m.recipe._id))];
  const dishIngredients: Doc<"dishIngredients">[] = [];
  const dishComponents: Doc<"dishComponents">[] = [];
  for (const dishId of recipeIds) {
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
  }
  const components: Doc<"components">[] = [];
  const componentIngredients: Doc<"componentIngredients">[] = [];
  for (const componentId of new Set(dishComponents.map((r) => r.componentId))) {
    const component = await ctx.db.get(componentId);
    if (component && component.tenantId === tenantId && component.deletedAt == null)
      components.push(component);
    componentIngredients.push(
      ...live(
        await ctx.db
          .query("componentIngredients")
          .withIndex("by_componentId", (q) => q.eq("componentId", componentId))
          .collect(),
        tenantId,
      ),
    );
  }
  const ingredientIds = new Set<Id<"ingredients">>([
    ...dishIngredients.map((r) => r.ingredientId),
    ...componentIngredients.map((r) => r.ingredientId),
  ]);
  const ingredients: Doc<"ingredients">[] = [];
  const priceObservations: Doc<"ingredientPriceObservations">[] = [];
  const unitMappings: Doc<"itemUnitMappings">[] = [];
  for (const ingredientId of ingredientIds) {
    const ingredient = await ctx.db.get(ingredientId);
    if (!ingredient || ingredient.tenantId !== tenantId) continue;
    if (ingredient.deletedAt != null) continue;
    ingredients.push(ingredient);
    const rows = live(await newestPriceRows(ctx, ingredientId), tenantId);
    const latest = latestPriceByIngredient(rows).get(ingredientId);
    const row = latest && rows.find((entry) => entry._id === latest._id);
    if (row) priceObservations.push(row);
    unitMappings.push(
      ...live(
        await ctx.db
          .query("itemUnitMappings")
          .withIndex("by_ingredientId", (q) => q.eq("ingredientId", ingredientId))
          .collect(),
        tenantId,
      ),
    );
  }
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

  const rollup = buildEventMenuCost({
    eventId: String(eventId),
    expectedHeadcount: 1,
    eventDishes: recipeIds.map((id) => ({
      id: String(id),
      eventId: String(eventId),
      dishId: String(id),
      quantityServings: 1,
    })),
    dishIngredients: dishIngredients.map((row) => ({
      id: row._id,
      dishId: row.dishId,
      ingredientId: row.ingredientId,
      quantity: Number(row.quantity),
      unit: String(row.unit),
      wasteFactor: row.wasteFactor,
      addedAt: row.addedAt,
    })),
    dishComponents: dishComponents.map((row) => ({
      id: row._id,
      dishId: row.dishId,
      componentId: row.componentId,
      yieldQuantity: Number(row.yieldQuantity),
      batchMultiplier: Number(row.batchMultiplier),
    })),
    components: components.map((row) => ({
      id: row._id,
      yieldQuantity: Number(row.yieldQuantity),
    })),
    componentIngredients: componentIngredients.map((row) => ({
      id: row._id,
      componentId: row.componentId,
      ingredientId: row.ingredientId,
      quantity: Number(row.quantity),
      unit: String(row.unit),
    })),
    ingredients: ingredients.map((row) => ({
      id: row._id,
      name: row.name,
      unit: String(row.unit),
      costPerUnit: Number(row.costPerUnit),
    })),
    priceObservations,
    unitMappings: RecordedUnitMappings.fromRows(unitMappings),
  });
  const perServing = new Map(
    rollup.dishes.map((d) => [
      d.dishId,
      d.pricedLineCount > 0 ? d.costPerServing : null,
    ]),
  );
  return menu.map((m) => ({
    name: m.name,
    costPerServing: perServing.get(String(m.recipe._id)) ?? null,
    portionSize: Number(m.shown.portionSize ?? 0),
    portionUnit: String(m.shown.portionUnit ?? "portion"),
  }));
}
