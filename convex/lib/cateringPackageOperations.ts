import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import {
  cateringNameKey,
  cateringRecipeNameKeys,
  cateringPackages,
  cateringRecipes,
  cateringSource,
  type CateringSelection,
} from "../../src/data/cateringPackages";
import {
  readMaterializationReceipt,
  writeMaterializationReceipt,
} from "./materializationReceipt";

export type CateringPackageResult = {
  packageName: string;
  savedDishIds: string[];
  savedDemandVersions: Record<string, number>;
  createdRecipes: number;
  reusedRecipes: number;
  prepTasks: number;
  packingLists: number;
  serviceActivities: number;
  recipesWithoutQuantities: string[];
  recovered: boolean;
};

type Input = {
  eventId: Id<"events">;
  packageId: string;
  operationKey: string;
  selections: CateringSelection[];
  serviceStartsAt?: number;
};

/** The caller authorizes event menu management. All writes use domain commands. */
export async function materializeCateringPackage(
  ctx: MutationCtx,
  tenantId: string,
  args: Input,
): Promise<CateringPackageResult> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.tenantId !== tenantId || event.deletedAt != null)
    throw new Error("Event not found");
  const pack = cateringPackages.find((entry) => entry.id === args.packageId);
  if (!pack) throw new Error("Catering package not found");
  const prior = await readMaterializationReceipt<CateringPackageResult>(
    ctx, tenantId, "cateringPackage", args.operationKey, args,
  );
  if (prior) return { ...prior, recovered: true };

  const allowed = new Set(pack.groups.flatMap((group) => group.recipeIds));
  const selected = new Set<string>();
  for (const line of args.selections) {
    if (!allowed.has(line.recipeId) || !cateringRecipes.has(line.recipeId))
      throw new Error("A selected dish is not in this package");
    if (selected.has(line.recipeId)) throw new Error("A dish is selected twice");
    selected.add(line.recipeId);
    if (!Number.isSafeInteger(line.servings) || line.servings <= 0)
      throw new Error("Enter a positive whole number of servings for each dish");
  }
  if (!args.selections.length && !pack.serviceTasks?.length)
    throw new Error("Choose at least one dish to add");
  const startsAt = args.serviceStartsAt ?? event.startsAt;
  if (pack.serviceTasks?.length && (!startsAt || !Number.isFinite(startsAt)))
    throw new Error("Set the bar service start time");

  const result: CateringPackageResult = {
    packageName: pack.name, savedDishIds: [], savedDemandVersions: {},
    createdRecipes: 0, reusedRecipes: 0, prepTasks: 0,
    packingLists: 0, serviceActivities: 0, recipesWithoutQuantities: [], recovered: false,
  };
  const dishes = await ctx.db.query("dishes")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId)).collect();
  const liveDishes = dishes.filter((dish) => dish.deletedAt == null &&
    dish.status === "active" && !dish.mergedIntoDishId);
  const source = cateringSource(pack);

  for (const line of args.selections) {
    const recipe = cateringRecipes.get(line.recipeId)!;
    const marker = `[catering-recipe:${recipe.id}]`;
    let dish: Doc<"dishes"> | undefined = liveDishes.find((row) => row.description?.includes(marker));
    if (!dish) {
      const matches = liveDishes.filter((row) =>
        cateringRecipeNameKeys(recipe).includes(cateringNameKey(row.name)) &&
        (!row.description?.includes("[catering-recipe:") ||
          row.description.startsWith(`${recipe.description || recipe.name}\n\nSource:`)));
      // Prefer the restored house recipe. Duplicate imported service variants
      // must not cause another empty dish to be created.
      matches.sort((a,b)=>Number(Boolean(b.recipeSourceFingerprint))-Number(Boolean(a.recipeSourceFingerprint)) ||
        Number(b.serviceStyle===pack.serviceStyle)-Number(a.serviceStyle===pack.serviceStyle) ||
        a._creationTime-b._creationTime);
      dish = matches[0];
    }
    if (!dish) {
      const created: { docId: Id<"dishes"> } = await ctx.runMutation(api.mutations.Dish_createViaIntroduce, {
        name: recipe.name,
        description: `${recipe.description || recipe.name}\n\nSource: ${cateringSource(recipe)}\n${marker}`,
        category: "Catering books", course: recipe.course,
        serviceStyle: pack.serviceStyle, portionSize: 1, portionUnit: "portion",
      });
      const row = await ctx.db.get(created.docId);
      if (!row || row.tenantId !== tenantId) throw new Error("Dish could not be created");
      dish = row;
      liveDishes.push(dish);
      result.createdRecipes++;
    } else result.reusedRecipes++;

    const tasks = await ctx.db.query("dishTasks")
      .withIndex("by_dishId", (q) => q.eq("dishId", dish!._id)).collect();
    if (!tasks.some((task) => task.tenantId === tenantId && task.deletedAt == null && task.status === "active")) {
      await ctx.runMutation(api.mutations.DishTask_createViaAdd, {
        dishId: dish._id, name: `Prepare ${dish.name}`, category: "Finish at Event",
        taskType: "manual", defaultUnit: "portion", defaultQuantity: 1,
        instructions: `${recipe.description || recipe.name}\nSource: ${cateringSource(recipe)}`,
      });
    }
    const direct = await ctx.db.query("dishIngredients")
      .withIndex("by_dishId", (q) => q.eq("dishId", dish!._id)).collect();
    const components = await ctx.db.query("dishComponents")
      .withIndex("by_dishId", (q) => q.eq("dishId", dish!._id)).collect();
    let hasQuantities = direct.some((row) => row.tenantId === tenantId && row.deletedAt == null && row.quantity > 0);
    for (const component of components.filter((row) => row.tenantId === tenantId && row.deletedAt == null)) {
      const ingredients = await ctx.db.query("componentIngredients")
        .withIndex("by_componentId", (q) => q.eq("componentId", component.componentId)).collect();
      if (ingredients.some((row) => row.tenantId === tenantId && row.deletedAt == null && row.quantity > 0)) hasQuantities = true;
    }
    if (!hasQuantities) result.recipesWithoutQuantities.push(recipe.name);
    const added: { docId: Id<"eventDishes"> } = await ctx.runMutation(api.mutations.EventDish_createViaAddToEvent, {
      eventId: args.eventId, dishId: dish._id, quantityServings: line.servings,
      // Costing and demand must use the same portions shown in the package preview.
      headcountOverride: line.servings === event.expectedHeadcount ? 0 : line.servings,
      course: recipe.course, serviceStyle: pack.serviceStyle,
      specialInstructions: `${line.notes.trim()}${line.notes.trim() ? "\n\n" : ""}Package: ${pack.name}\nSource: ${source}${!hasQuantities ? "\nIngredient quantities not recorded; purchasing totals are incomplete for this dish." : ""}`,
    });
    result.savedDishIds.push(String(added.docId));
  }

  if (pack.packing?.length) {
    const list: { docId: string } = await ctx.runMutation(api.mutations.PackList_createViaOpen, {
      eventId: args.eventId, name: `${pack.name} supplies`, purpose: source,
      notes: `${pack.notes}\nEach line is one service kit; verify consumable quantities for the event headcount.`,
    });
    for (const description of pack.packing) await ctx.runMutation(api.mutations.PackListItem_createViaAddItem, {
      packListId: list.docId, description: `${description} (service kit; plan consumable quantities)`, requiredQuantity: 1, unit: "each",
    });
    result.packingLists = 1;
  }
  for (const name of pack.serviceTasks ?? []) {
    await ctx.runMutation(api.mutations.EventTimelineActivity_createViaSchedule, {
      eventId: args.eventId, name: `${pack.name}: ${name}`, startsAt: startsAt!,
      category: "Beverage service", notes: `${source}\n${pack.notes}\nPackage start time; adjust this activity to the service schedule.`,
    });
    result.serviceActivities++;
  }
  const saved = new Set(result.savedDishIds);
  const prep = await ctx.db.query("prepTasks").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).collect();
  result.prepTasks = prep.filter((task) => task.tenantId === tenantId && task.deletedAt == null && saved.has(String(task.eventDishId))).length;
  const demands = await ctx.db.query("ingredientDemands").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).collect();
  result.savedDemandVersions = Object.fromEntries(demands.filter((row) => row.tenantId === tenantId && row.deletedAt == null).map((row) => [String(row._id), row.version]));
  await writeMaterializationReceipt(ctx, tenantId, "cateringPackage", args.operationKey, args, result);
  return result;
}
