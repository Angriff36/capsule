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
  componentReplacements: v.optional(
    v.array(
      v.object({
        dishComponentId: v.id("dishComponents"),
        expectedVersion: v.number(),
        replacementKey: v.string(),
      }),
    ),
  ),
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
  componentReplacements?: {
    dishComponentId: Id<"dishComponents">;
    expectedVersion: number;
    replacementKey: string;
  }[];
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
  const replacements = [];
  const replacementIds = new Set<string>();
  for (const replacement of args.componentReplacements ?? []) {
    const row = await ctx.db.get(replacement.dishComponentId);
    if (
      !row ||
      row.tenantId !== tenantId ||
      row.deletedAt != null ||
      row.version !== replacement.expectedVersion ||
      !args.dishIds.includes(row.dishId) ||
      replacementIds.has(row._id) ||
      input.components.filter((c) => c.key === replacement.replacementKey)
        .length !== 1
    )
      throw new Error(
        "Component replacement differs from the reviewed attachment",
      );
    replacementIds.add(row._id);
    replacements.push({ row, replacementKey: replacement.replacementKey });
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
        recipeUnitRatio(line.unit, row.unit) == null ||
        recipeNameKey(row.name) !== recipeNameKey(line.name)
      )
        throw new Error("Ingredient does not match the reviewed recipe");
      return line.ingredientId;
    }
    const key = `${recipeNameKey(line.name)}:${line.unit}`;
    const cached = ingredientCache.get(key);
    if (cached) return cached;
    const compatible = existingIngredients.filter(
      (i) =>
        i.deletedAt == null &&
        i.status === "active" &&
        !i.mergedIntoIngredientId &&
        recipeNameKey(i.name) === recipeNameKey(line.name) &&
        recipeUnitRatio(line.unit, i.unit) != null,
    );
    const exact = compatible.filter((i) => i.unit === line.unit);
    const matches = exact.length ? exact : compatible;
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
    const createdIngredient = await ctx.db.get(created.docId);
    if (createdIngredient) existingIngredients.push(createdIngredient);
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
        (c.recipeSourceFingerprint === formula.key ||
          c.description?.includes(`[TPP subrecipe:${formula.key}]`)),
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
        description: measured
          ? "Kitchen batch recipe."
          : `Subrecipe amount for one serving of ${input.name}.`,
        sourceFingerprint: formula.key,
        sourceText: `${input.source}\n${JSON.stringify(formula)}`,
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
      const componentIndex = input.components.findIndex(
        (c) => recipeNameKey(c.name) === recipeNameKey(task.name),
      );
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
        if (existing.componentId == null && componentIndex >= 0) {
          await ctx.runMutation(api.mutations.DishTask_revise, {
            docId: existing._id,
            version: existing.version,
            name: existing.name,
            category: existing.category,
            taskType: existing.taskType,
            defaultQuantity: existing.defaultQuantity ?? undefined,
            defaultUnit: existing.defaultUnit ?? undefined,
            station: existing.station ?? undefined,
            sortOrder: existing.sortOrder,
            componentId: componentIds[componentIndex],
            ingredientId: existing.ingredientId ?? undefined,
            instructions: existing.instructions ?? undefined,
          });
        }
        continue;
      }
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
        instructions: task.instructions,
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
      });
      result.ingredients++;
    }
    for (const replacement of replacements.filter(
      (r) => r.row.dishId === dishId,
    )) {
      const index = input.components.findIndex(
        (c) => c.key === replacement.replacementKey,
      );
      const replacementId = componentIds[index];
      if (replacementId === replacement.row.componentId)
        throw new Error(
          "Replacement must identify a different component recipe",
        );
      // Populate routing for legacy active events before detaching the old formula.
      const eventLines = await ctx.db
        .query("eventDishes")
        .withIndex("by_dishId", (q) => q.eq("dishId", dishId))
        .collect();
      for (const eventId of new Set(
        eventLines.filter((e) => e.tenantId === tenantId).map((e) => e.eventId),
      )) {
        const event = await ctx.db.get(eventId);
        if (event && event.tenantId === tenantId)
          await reconcileEventRecipeSync(ctx, {
            eventId,
            expectedEventVersion: event.version,
          });
      }
      await ctx.runMutation(api.mutations.DishComponent_detach, {
        docId: replacement.row._id,
        version: replacement.row.version,
        reason: "Replace with reviewed source recipe",
      });
      for (const template of tasks.filter(
        (t) =>
          t.deletedAt == null &&
          t.status === "active" &&
          t.componentId === replacement.row.componentId,
      )) {
        await ctx.runMutation(api.mutations.DishTask_revise, {
          docId: template._id,
          version: template.version,
          name: template.name,
          category: template.category,
          taskType: template.taskType,
          defaultQuantity: template.defaultQuantity ?? undefined,
          defaultUnit: template.defaultUnit ?? undefined,
          station: template.station ?? undefined,
          sortOrder: template.sortOrder,
          componentId: replacementId,
          ingredientId: template.ingredientId ?? undefined,
          instructions: template.instructions ?? undefined,
        });
      }
      for (const eventLine of eventLines.filter(
        (e) => e.tenantId === tenantId && e.deletedAt == null,
      )) {
        const event = await ctx.db.get(eventLine.eventId);
        if (
          !event ||
          event.deletedAt != null ||
          ["completed", "closed_out", "cancelled"].includes(event.stage)
        )
          continue;
        const prep = await ctx.db
          .query("prepTasks")
          .withIndex("by_eventDishId", (q) =>
            q.eq("eventDishId", eventLine._id),
          )
          .collect();
        for (const task of prep.filter(
          (t) =>
            t.tenantId === tenantId &&
            t.deletedAt == null &&
            t.componentId === replacement.row.componentId &&
            ["pending", "claimed"].includes(t.status),
        )) {
          await ctx.runMutation(api.mutations.PrepTask_replaceRecipeComponent, {
            docId: task._id,
            version: task.version,
            previousComponentId: replacement.row.componentId,
            componentId: replacementId,
          });
        }
      }
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

/** Backfill only catalog-routing keys; recipe facts and performed work stay intact. */
export async function reconcileEventRecipeSync(
  ctx: MutationCtx,
  args: { eventId: Id<"events">; expectedEventVersion: number },
): Promise<{ changed: number }> {
  const auth = await getAuthContext(ctx);
  const tenantId = requireTenant(auth);
  if (!["owner", "admin", "system"].includes(auth.role))
    throw new Error(
      "Only an administrator may run historical recipe reconciliation",
    );
  const event = await ctx.db.get(args.eventId);
  if (
    !event ||
    event.tenantId !== tenantId ||
    event.version !== args.expectedEventVersion
  )
    throw new Error("Event changed since the reviewed repair snapshot");
  const active =
    event.deletedAt == null &&
    !["completed", "closed_out", "cancelled"].includes(event.stage);
  let changed = 0;
  const dishes = await ctx.db
    .query("eventDishes")
    .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
    .collect();
  for (const row of dishes) {
    if (row.tenantId !== tenantId) continue;
    const target = active && row.deletedAt == null ? row.dishId : null;
    if ((row.recipeSyncDishId ?? null) === target) continue;
    await ctx.runMutation(api.mutations.EventDish_refreshRecipeSync, {
      docId: row._id,
    });
    changed++;
  }
  const seeds = await ctx.db
    .query("eventDishComponentSeeds")
    .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
    .collect();
  for (const row of seeds) {
    if (row.tenantId !== tenantId) continue;
    const target = active && row.deletedAt == null ? row.componentId : null;
    if ((row.recipeSyncComponentId ?? null) === target) continue;
    await ctx.runMutation(
      api.mutations.EventDishComponentSeed_refreshRecipeSync,
      { docId: row._id },
    );
    changed++;
  }
  const contributions = await ctx.db
    .query("eventIngredientContributions")
    .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
    .collect();
  for (const row of contributions) {
    if (row.tenantId !== tenantId) continue;
    const component =
      active && row.deletedAt == null ? (row.componentId ?? null) : null;
    const ingredient =
      active && row.deletedAt == null ? row.ingredientId : null;
    if (
      (row.recipeSyncComponentId ?? null) === component &&
      (row.recipeSyncIngredientId ?? null) === ingredient
    )
      continue;
    await ctx.runMutation(
      api.mutations.EventIngredientContribution_refreshRecipeSync,
      { docId: row._id },
    );
    changed++;
  }
  return { changed };
}
