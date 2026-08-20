/**
 * Encode TPP Mendenhall / Jarvis recipes + containers + prep + sell
 * onto matching named records. Lookup is by name only — no prod IDs.
 *
 *   bun scripts/seed-tpp-mendenhall-jarvis.ts
 *
 * Does not delete E2E/QA data. Does not import product helpers.
 * Cost dollars are not invented: new ingredients seed at costPerUnit 0.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { CapsuleAgentAuthManager } from "../src/agent/CapsuleAgentAuthManager";
import { formatSellPriceInstruction } from "../src/features/events/eventMenuSellPrice";
import {
  TPP_DISHES,
  TPP_EVENT,
  tppPerServingQty,
  type TppUnit,
} from "./tpp-mendenhall-jarvis-catalog";

type Named = { _id: string; name?: string; deletedAt?: unknown };
type EventRow = Named & { title?: string };
type EventDishRow = {
  _id: string;
  eventId: string;
  dishId: string;
  version: number;
  deletedAt?: unknown;
};
type DishIngredientRow = {
  _id: string;
  dishId: string;
  ingredientId: string;
  deletedAt?: unknown;
};
type DishContainerRow = {
  _id: string;
  dishId: string;
  name: string;
  deletedAt?: unknown;
};
type DishTaskRow = {
  _id: string;
  dishId: string;
  name: string;
  deletedAt?: unknown;
};

function byName(rows: Named[], name: string): Named | undefined {
  const needle = name.trim().toLowerCase();
  return rows.find(
    (row) =>
      row.deletedAt == null &&
      String(row.name ?? "")
        .trim()
        .toLowerCase() === needle,
  );
}

async function main(): Promise<void> {
  const auth = new CapsuleAgentAuthManager();
  const url = auth.resolveConvexUrl();
  const client = new ConvexHttpClient(url);
  client.setAuth(await auth.resolveJwt());
  console.log(`Seeding TPP ${TPP_EVENT.name} → ${url}`);

  const ingredients = (await client.query(
    api.queries.listIngredient,
    {},
  )) as Named[];
  const dishes = (await client.query(api.queries.listDish, {})) as Named[];
  const events = (await client.query(api.queries.listEvent, {})) as EventRow[];
  const eventDishes = (await client.query(
    api.queries.listEventDish,
    {},
  )) as EventDishRow[];
  const dishIngredients = (await client.query(
    api.queries.listDishIngredient,
    {},
  )) as DishIngredientRow[];
  const dishContainers = (await client.query(
    api.queries.listDishContainer,
    {},
  )) as DishContainerRow[];
  const dishTasks = (await client.query(
    api.queries.listDishTask,
    {},
  )) as DishTaskRow[];

  const ingredientIds = new Map<string, string>();
  for (const row of ingredients) {
    if (row.deletedAt == null && row.name) {
      ingredientIds.set(row.name.trim().toLowerCase(), row._id);
    }
  }
  const dishIds = new Map<string, string>();
  for (const row of dishes) {
    if (row.deletedAt == null && row.name) {
      dishIds.set(row.name.trim().toLowerCase(), row._id);
    }
  }

  for (const dish of TPP_DISHES) {
    client.setAuth(await auth.resolveJwt());
    let dishId = dishIds.get(dish.name.toLowerCase());
    if (!dishId) {
      const created = (await client.mutation(
        api.mutations.Dish_createViaIntroduce,
        {
          name: dish.name,
          portionSize: 1,
          portionUnit: "portion",
          course: dish.course,
          description: `${TPP_EVENT.name} ${dish.course}`,
        },
      )) as { docId?: string };
      dishId = created.docId;
      if (!dishId) {
        console.warn(`  ! could not create dish ${dish.name}`);
        continue;
      }
      dishIds.set(dish.name.toLowerCase(), dishId);
      console.log(`  + dish ${dish.name}`);
    }

    for (const [index, recipe] of dish.recipes.entries()) {
      client.setAuth(await auth.resolveJwt());
      let ingredientId = ingredientIds.get(recipe.ingredient.toLowerCase());
      if (!ingredientId) {
        const created = (await client.mutation(
          api.mutations.Ingredient_createViaIntroduce,
          {
            name: recipe.ingredient,
            unit: recipe.unit,
            costPerUnit: 0,
            category: recipe.vendor,
          },
        )) as { docId?: string };
        ingredientId = created.docId;
        if (!ingredientId) {
          console.warn(`  ! could not create ingredient ${recipe.ingredient}`);
          continue;
        }
        ingredientIds.set(recipe.ingredient.toLowerCase(), ingredientId);
        console.log(`  + ingredient ${recipe.ingredient}`);
      }
      const already = dishIngredients.some(
        (row) =>
          row.deletedAt == null &&
          row.dishId === dishId &&
          row.ingredientId === ingredientId,
      );
      if (already) continue;
      const qty = tppPerServingQty(recipe.productionQty, dish.servings);
      if (!(qty > 0)) continue;
      await client.mutation(api.mutations.DishIngredient_createViaAdd, {
        dishId,
        ingredientId,
        quantity: qty,
        unit: recipe.unit as TppUnit,
        sortOrder: index,
        prepNotes: recipe.suspect
          ? "TPP unit looks wrong — keep 196 lb sliced radish; do not convert."
          : undefined,
      });
      console.log(`  + recipe ${dish.name} / ${recipe.ingredient}`);
    }

    for (const container of dish.containers) {
      client.setAuth(await auth.resolveJwt());
      const already = dishContainers.some(
        (row) =>
          row.deletedAt == null &&
          row.dishId === dishId &&
          row.name === container.name,
      );
      if (already) continue;
      await client.mutation(api.mutations.DishContainer_createViaDefine, {
        dishId,
        name: container.name,
        serviceMethod: "brought_hot",
        servingsPerContainer: container.servingsPerContainer,
        baseQuantity: container.baseQuantity ?? 0,
        handlingNotes: container.notes,
      });
      console.log(`  + container ${dish.name} / ${container.name}`);
    }

    for (const [index, step] of dish.prep.entries()) {
      client.setAuth(await auth.resolveJwt());
      const already = dishTasks.some(
        (row) =>
          row.deletedAt == null &&
          row.dishId === dishId &&
          row.name === step.name,
      );
      if (already) continue;
      const defaultQuantity = tppPerServingQty(
        step.productionQty,
        dish.servings,
      );
      await client.mutation(api.mutations.DishTask_createViaAdd, {
        dishId,
        name: step.name,
        category:
          dish.finishAt === "event" ? "finish_at_event" : "finish_at_kitchen",
        taskType: "manual",
        defaultQuantity: defaultQuantity > 0 ? defaultQuantity : undefined,
        defaultUnit: step.unit,
        sortOrder: index,
        instructions: step.instructions,
      });
      console.log(`  + prep ${dish.name} / ${step.name}`);
    }
  }

  const event = events.find(
    (row) =>
      row.deletedAt == null &&
      String(row.title ?? row.name ?? "")
        .toLowerCase()
        .includes("mendenhall") &&
      String(row.title ?? row.name ?? "")
        .toLowerCase()
        .includes("jarvis"),
  );
  if (!event) {
    console.log(
      "No existing Mendenhall / Jarvis event found; recipes were encoded on dishes. Event attach skipped (will not create a new event).",
    );
    return;
  }

  for (const dish of TPP_DISHES) {
    const dishId = dishIds.get(dish.name.toLowerCase());
    if (!dishId) continue;
    const existing = eventDishes.find(
      (row) =>
        row.deletedAt == null &&
        row.eventId === event._id &&
        row.dishId === dishId,
    );
    client.setAuth(await auth.resolveJwt());
    const sell = formatSellPriceInstruction(
      dish.unitSell ?? 0,
      existing ? undefined : `${TPP_EVENT.invoiceNumber}`,
    );
    if (existing) {
      if (dish.unitSell == null) continue;
      await client.mutation(api.mutations.EventDish_updateInstructions, {
        docId: existing._id,
        version: existing.version,
        specialInstructions: sell,
      });
      console.log(`  ~ sell ${dish.name}`);
      continue;
    }
    await client.mutation(api.mutations.EventDish_createViaAddToEvent, {
      eventId: event._id,
      dishId,
      quantityServings: dish.servings,
      headcountOverride: 0,
      course: dish.course,
      specialInstructions: sell,
    });
    console.log(`  + event dish ${dish.name} @ ${dish.servings}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed-tpp-mendenhall-jarvis] ${message}`);
  process.exit(1);
});
