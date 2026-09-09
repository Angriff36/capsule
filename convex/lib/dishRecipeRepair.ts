import { v } from "convex/values";
import { api } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getAuthContext, requireTenant } from "./authContext";
import { requireKitchenAccess } from "./kitchenAccessGate";
import {
  readMaterializationReceipt,
  writeMaterializationReceipt,
} from "./materializationReceipt";
import { recipeNameKey } from "../../src/lib/tppRecipeRepair";
import { recipeUnitRatio } from "../../src/lib/recipeUnitConversion";
import { componentBatchScale } from "../../src/lib/componentBatchScale";

const amount = v.object({
  name: v.string(),
  quantity: v.number(),
  unit: v.string(),
  source: v.string(),
  ingredientId: v.optional(v.id("ingredients")),
});
export const dishRecipeRepairArgs = {
  operationKey: v.string(),
  dishIds: v.array(v.id("dishes")),
  expectedVersions: v.record(v.string(), v.number()),
  sourceComponentId: v.optional(v.id("components")),
  prepLinks: v.optional(
    v.array(
      v.object({
        prepTaskId: v.id("prepTasks"),
        dishId: v.id("dishes"),
        taskName: v.string(),
        expectedVersion: v.number(),
        expectedName: v.string(),
        expectedQuantity: v.number(),
        expectedUnit: v.string(),
      }),
    ),
  ),
  recipe: v.object({
    name: v.string(),
    fingerprint: v.string(),
    source: v.string(),
    description: v.string(),
    raw: v.string(),
    instructions: v.string(),
    yieldText: v.string(),
    portionSize: v.number(),
    portionUnit: v.string(),
    tasks: v.array(
      v.object({
        name: v.string(),
        quantity: v.optional(v.number()),
        unit: v.optional(v.string()),
        instructions: v.string(),
      }),
    ),
    ingredients: v.array(amount),
    components: v.array(
      v.object({
        name: v.string(),
        key: v.string(),
        instructions: v.string(),
        yieldQuantity: v.optional(v.number()),
        yieldUnit: v.optional(v.string()),
        quantityPerServing: v.optional(v.number()),
        ingredients: v.array(amount),
      }),
    ),
    notes: v.array(v.string()),
  }),
};
type Amount = {
  name: string;
  quantity: number;
  unit: string;
  source: string;
  ingredientId?: Id<"ingredients">;
};
type Input = {
  operationKey: string;
  dishIds: Id<"dishes">[];
  expectedVersions: Record<string, number>;
  sourceComponentId?: Id<"components">;
  prepLinks?: {
    prepTaskId: Id<"prepTasks">;
    dishId: Id<"dishes">;
    taskName: string;
    expectedVersion: number;
    expectedName: string;
    expectedQuantity: number;
    expectedUnit: string;
  }[];
  recipe: {
    name: string;
    fingerprint: string;
    source: string;
    description: string;
    raw: string;
    instructions: string;
    yieldText: string;
    portionSize: number;
    portionUnit: string;
    tasks: {
      name: string;
      quantity?: number;
      unit?: string;
      instructions: string;
    }[];
    ingredients: Amount[];
    components: {
      name: string;
      key: string;
      instructions: string;
      yieldQuantity?: number;
      yieldUnit?: string;
      quantityPerServing?: number;
      ingredients: Amount[];
    }[];
    notes: string[];
  };
};
export async function repairDishRecipe(
  ctx: MutationCtx,
  args: Input,
): Promise<{
  dishIds: string[];
  createdIngredients: { id: string; name: string; unit: string }[];
  tasks: number;
  ingredients: number;
  components: number;
  retiredSource: boolean;
  linkedPrepTasks: number;
}> {
  const auth = await getAuthContext(ctx);
  requireKitchenAccess(auth);
  const tenantId = requireTenant(auth);
  if (!["owner", "admin", "system"].includes(auth.role))
    throw new Error("Only an administrator may run a historical recipe repair");
  const prior = await readMaterializationReceipt<
    Awaited<ReturnType<typeof repairDishRecipe>>
  >(ctx, tenantId, "dishRecipeRepair", args.operationKey, args);
  if (prior) return prior;
  const result = {
    dishIds: [] as string[],
    createdIngredients: [] as { id: string; name: string; unit: string }[],
    tasks: 0,
    ingredients: 0,
    components: 0,
    retiredSource: false,
    linkedPrepTasks: 0,
  };
  const owned = async (
    id: Id<"dishes"> | Id<"ingredients"> | Id<"components">,
  ) => {
    const row = await ctx.db.get(id);
    if (!row || row.tenantId !== tenantId || row.deletedAt != null)
      throw new Error("Recipe record not found");
    return row;
  };
  const input = args.recipe;
  const linkedIds = new Set<string>();
  // Adoption is explicit in the reviewed plan. A matching label alone is not
  // enough to merge work from separate steps or event-specific substitutions.
  for (const link of args.prepLinks ?? []) {
    if (linkedIds.has(link.prepTaskId))
      throw new Error("Prep repair contains the same work item more than once");
    linkedIds.add(link.prepTaskId);
    const prep = await ctx.db.get(link.prepTaskId);
    const eventDish = prep ? await ctx.db.get(prep.eventDishId) : null;
    if (
      !prep ||
      prep.tenantId !== tenantId ||
      prep.deletedAt != null ||
      !eventDish ||
      eventDish.tenantId !== tenantId ||
      eventDish.dishId !== link.dishId ||
      !args.dishIds.includes(link.dishId) ||
      prep.version !== link.expectedVersion ||
      prep.name !== link.expectedName ||
      prep.quantity !== link.expectedQuantity ||
      prep.unit !== link.expectedUnit
    ) {
      throw new Error(
        "Imported prep changed since the reviewed repair snapshot",
      );
    }
  }
  for (const id of args.dishIds) {
    const dish = await owned(id);
    if (
      recipeNameKey(dish.name) !== recipeNameKey(input.name) ||
      dish.version !== args.expectedVersions[id]
    )
      throw new Error("Dish changed since the reviewed repair snapshot");
  }
  if (args.sourceComponentId) {
    const source = await owned(args.sourceComponentId);
    if (
      !("instructions" in source) ||
      source.name !== `${input.name} — TPP recipe` ||
      source.instructions !== input.raw ||
      source.category !== "TPP imported recipes"
    )
      throw new Error("Source is not the reviewed imported whole recipe");
    const links = await ctx.db
      .query("dishComponents")
      .withIndex("by_componentId", (q) =>
        q.eq("componentId", args.sourceComponentId!),
      )
      .collect();
    if (links.some((l) => l.deletedAt == null))
      throw new Error(
        "Imported source is already used by a dish; preserve its references",
      );
  }
  const ingredientCache = new Map<string, Id<"ingredients">>();
  const existingIngredients = await ctx.db
    .query("ingredients")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const ingredient = async (line: Amount) => {
    if (!(line.quantity > 0) || !Number.isFinite(line.quantity))
      throw new Error("Recipe quantity must be positive");
    if (line.ingredientId) {
      const row = await owned(line.ingredientId);
      if (
        !("unit" in row) ||
        row.unit !== line.unit ||
        recipeNameKey(row.name) !== recipeNameKey(line.name)
      )
        throw new Error("Ingredient does not match the reviewed recipe");
      return line.ingredientId;
    }
    const key = `${recipeNameKey(line.name)}:${line.unit}`;
    const cached = ingredientCache.get(key);
    if (cached) return cached;
    const matches = existingIngredients.filter(
      (i) =>
        i.deletedAt == null &&
        i.status === "active" &&
        !i.mergedIntoIngredientId &&
        recipeNameKey(i.name) === recipeNameKey(line.name) &&
        i.unit === line.unit,
    );
    if (matches.length > 1)
      throw new Error(
        `Ambiguous existing ingredient: ${line.name} (${line.unit})`,
      );
    if (matches.length === 1) {
      ingredientCache.set(key, matches[0]._id);
      return matches[0]._id;
    }
    const created: { docId: Id<"ingredients"> } = await ctx.runMutation(
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: line.name,
        unit: line.unit,
        costPerUnit: 0,
        category: "TPP recipe ingredients",
      },
    );
    ingredientCache.set(key, created.docId);
    result.createdIngredients.push({
      id: created.docId,
      name: line.name,
      unit: line.unit,
    });
    return created.docId;
  };
  const componentIds: Id<"components">[] = [];
  const existingComponents = await ctx.db
    .query("components")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  for (const formula of input.components) {
    const measured =
      formula.yieldQuantity != null ||
      formula.yieldUnit != null ||
      formula.quantityPerServing != null;
    if (measured) {
      if (
        formula.yieldQuantity == null ||
        !formula.yieldUnit ||
        formula.quantityPerServing == null
      )
        throw new Error(
          "A batch recipe needs its measured yield, yield unit and amount per serving in that unit",
        );
      componentBatchScale(formula.yieldQuantity, formula.quantityPerServing);
    }
    const reused = existingComponents.find(
      (c) =>
        c.deletedAt == null &&
        c.status === "published" &&
        c.description?.includes(`[TPP subrecipe:${formula.key}]`),
    );
    if (reused) {
      if (
        reused.yieldQuantity !== (formula.yieldQuantity ?? 1) ||
        reused.yieldUnit !== (formula.yieldUnit ?? "serving")
      )
        throw new Error(
          "Existing subrecipe yield differs from the reviewed source",
        );
      componentIds.push(reused._id);
      continue;
    }
    const created: { docId: Id<"components"> } = await ctx.runMutation(
      api.mutations.Component_createViaDraft,
      {
        name: formula.name,
        yieldQuantity: formula.yieldQuantity ?? 1,
        yieldUnit: formula.yieldUnit ?? "serving",
        category: "TPP subrecipes",
        instructions: formula.instructions,
        description: `${measured ? "Kitchen batch recipe." : `Subrecipe amount for one serving of ${input.name}.`}\n[TPP subrecipe:${formula.key}]`,
      },
    );
    for (const line of formula.ingredients)
      await ctx.runMutation(api.mutations.ComponentIngredient_createViaAdd, {
        componentId: created.docId,
        ingredientId: await ingredient(line),
        quantity: line.quantity,
        unit: line.unit,
        sortOrder: formula.ingredients.indexOf(line),
      });
    await ctx.runMutation(api.mutations.Component_publishVersion, {
      docId: created.docId,
    });
    componentIds.push(created.docId);
    result.components++;
  }
  const dishIds = [...new Set(args.dishIds)];
  if (!dishIds.length) {
    const created: { docId: Id<"dishes"> } = await ctx.runMutation(
      api.mutations.Dish_createViaIntroduce,
      {
        name: input.name,
        portionSize: input.portionSize,
        portionUnit: input.portionUnit,
        category: "TPP recipes",
        description: input.description,
      },
    );
    dishIds.push(created.docId);
  }
  for (const dishId of dishIds) {
    const dish = await ctx.db.get(dishId);
    if (
      !dish ||
      dish.tenantId !== tenantId ||
      dish.deletedAt != null ||
      dish.status !== "active"
    )
      throw new Error("Active recipe dish not found");
    const marker = `[TPP dish recipe:${input.fingerprint}]`;
    if (
      dish.recipeSourceFingerprint &&
      dish.recipeSourceFingerprint !== input.fingerprint
    )
      throw new Error("Dish already has a different source recipe");
    // Restoring links to a previously imported recipe must not overwrite a
    // cook's subsequent edits to its method or resave an unchanged recipe.
    if (dish.recipeSourceFingerprint !== input.fingerprint) {
      await ctx.runMutation(api.mutations.Dish_saveRecipe, {
        docId: dishId,
        instructions: dish.recipeInstructions?.trim()
          ? dish.recipeInstructions
          : input.instructions,
        sourceText: `${input.source}\n\n${input.raw}${input.notes.length ? "\n\nSource notes:\n" + input.notes.join("\n") : ""}`,
        sourceYield: input.yieldText,
        sourceFingerprint: input.fingerprint,
      });
    }
    const tasks = await ctx.db
      .query("dishTasks")
      .withIndex("by_dishId", (q) => q.eq("dishId", dishId))
      .collect();
    for (const [i, task] of input.tasks.entries()) {
      const existing = tasks.find(
        (t) =>
          t.status === "active" &&
          t.deletedAt == null &&
          t.name.trim().toLowerCase() === task.name.trim().toLowerCase(),
      );
      if (existing) {
        if (
          existing.defaultQuantity !== task.quantity ||
          existing.defaultUnit !== task.unit
        )
          throw new Error(`Existing prep quantity differs: ${task.name}`);
        continue;
      }
      const componentIndex = input.components.findIndex(
        (c) => recipeNameKey(c.name) === recipeNameKey(task.name),
      );
      await ctx.runMutation(api.mutations.DishTask_createViaAdd, {
        dishId,
        name: task.name,
        category: dish.category ?? "Finish at Kitchen",
        taskType: "manual",
        defaultQuantity: task.quantity,
        defaultUnit: task.unit,
        componentId:
          componentIndex >= 0 ? componentIds[componentIndex] : undefined,
        station: dish.serviceStyle,
        sortOrder: i,
        instructions: `${task.instructions}\n${marker}`,
      });
      result.tasks++;
    }
    const lines = await ctx.db
      .query("dishIngredients")
      .withIndex("by_dishId", (q) => q.eq("dishId", dishId))
      .collect();
    for (const [i, line] of input.ingredients.entries()) {
      const id = await ingredient(line);
      const existing = lines.find(
        (l) =>
          l.deletedAt == null && l.ingredientId === id && l.unit === line.unit,
      );
      if (existing) {
        if (Math.abs(existing.quantity - line.quantity) > 0.000001)
          throw new Error(`Existing ingredient quantity differs: ${line.name}`);
        continue;
      }
      await ctx.runMutation(api.mutations.DishIngredient_createViaAdd, {
        dishId,
        ingredientId: id,
        quantity: line.quantity,
        unit: line.unit,
        sortOrder: i,
        prepNotes: `${line.source}\n${input.source}\n${marker}`,
      });
      result.ingredients++;
    }
    const attached = await ctx.db
      .query("dishComponents")
      .withIndex("by_dishId", (q) => q.eq("dishId", dishId))
      .collect();
    for (const [i, componentId] of componentIds.entries()) {
      const formula = input.components[i];
      const scale =
        formula.yieldQuantity != null && formula.quantityPerServing != null
          ? componentBatchScale(
              formula.yieldQuantity,
              formula.quantityPerServing,
            )
          : { yieldQuantity: 1, batchMultiplier: 1 };
      const existing = attached.filter(
        (line) => line.deletedAt == null && line.componentId === componentId,
      );
      if (existing.length) {
        if (
          existing.length !== 1 ||
          existing[0].yieldQuantity !== scale.yieldQuantity ||
          existing[0].batchMultiplier !== scale.batchMultiplier
        )
          throw new Error(
            "Existing component portion differs from the reviewed source",
          );
        continue;
      }
      await ctx.runMutation(api.mutations.DishComponent_createViaAttach, {
        dishId,
        componentId,
        ...scale,
        sortOrder: i,
        role: input.components[i].name,
      });
    }
    // Existing event menu lines need the newly restored templates too. Preserve
    // performed/manual work; matching names are not reopened or duplicated.
    const templates = await ctx.db
      .query("dishTasks")
      .withIndex("by_dishId", (q) => q.eq("dishId", dishId))
      .collect();
    for (const link of (args.prepLinks ?? []).filter(
      (l) => l.dishId === dishId,
    )) {
      const matches = templates.filter(
        (t) =>
          t.deletedAt == null &&
          t.status === "active" &&
          recipeNameKey(t.name) === recipeNameKey(link.taskName),
      );
      if (matches.length !== 1)
        throw new Error("Prep repair requires one unambiguous recipe step");
      const template = matches[0];
      const prep = await ctx.db.get(link.prepTaskId);
      if (
        !prep ||
        (prep.dishTaskId && prep.dishTaskId !== template._id) ||
        (prep.dishId && prep.dishId !== dishId) ||
        (prep.componentId && prep.componentId !== template.componentId) ||
        recipeUnitRatio(template.defaultUnit ?? "portion", prep.unit) == null
      ) {
        throw new Error(
          "Prep repair would replace a recipe link or change its quantity unit",
        );
      }
      if (
        prep.dishTaskId === template._id &&
        prep.dishId === dishId &&
        (prep.componentId ?? null) === (template.componentId ?? null)
      )
        continue;
      await ctx.runMutation(api.mutations.PrepTask_linkRecipe, {
        docId: prep._id,
        dishTaskId: template._id,
        dishId,
        ...(template.componentId ? { componentId: template.componentId } : {}),
      });
      result.linkedPrepTasks++;
    }
    const eventDishes = await ctx.db
      .query("eventDishes")
      .withIndex("by_dishId", (q) => q.eq("dishId", dishId))
      .collect();
    for (const eventDish of eventDishes.filter(
      (e) =>
        e.tenantId === tenantId &&
        e.deletedAt == null &&
        e.quantityServings > 0,
    )) {
      const event = await ctx.db.get(eventDish.eventId);
      if (
        !event ||
        event.deletedAt != null ||
        ["completed", "closed_out", "cancelled"].includes(event.stage)
      )
        continue;
      const prep = await ctx.db
        .query("prepTasks")
        .withIndex("by_eventDishId", (q) => q.eq("eventDishId", eventDish._id))
        .collect();
      for (const task of templates.filter(
        (t) => t.status === "active" && t.deletedAt == null,
      )) {
        if (
          prep.some(
            (p) =>
              p.deletedAt == null &&
              (p.dishTaskId === task._id ||
                recipeNameKey(p.name) === recipeNameKey(task.name)),
          )
        )
          continue;
        await ctx.runMutation(api.mutations.PrepTask_createViaOpen, {
          eventDishId: eventDish._id,
          eventId: eventDish.eventId,
          dishId,
          dishTaskId: task._id,
          name: task.name,
          quantity:
            task.defaultQuantity != null
              ? task.defaultQuantity * eventDish.quantityServings
              : 1,
          unit: task.defaultUnit ?? "each",
          componentId: task.componentId ?? undefined,
          category: task.category,
          taskType: task.taskType,
          isGenerated: task.defaultQuantity != null,
          specialInstructions: task.instructions ?? undefined,
        });
      }
    }
    result.dishIds.push(dishId);
  }
  if (args.sourceComponentId) {
    await ctx.runMutation(api.mutations.Component_retire, {
      docId: args.sourceComponentId,
      reason: `Whole recipe moved to dishes: ${result.dishIds.join(", ")}. Original source preserved on each dish.`,
    });
    result.retiredSource = true;
  }
  await writeMaterializationReceipt(
    ctx,
    tenantId,
    "dishRecipeRepair",
    args.operationKey,
    args,
    result,
  );
  return result;
}
