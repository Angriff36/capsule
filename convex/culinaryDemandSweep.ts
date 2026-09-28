// Authored sweep: when a nested recipe (or its ingredients) change, re-run
// the one demand calculation on every live event that still serves a dish
// reaching that recipe. Direct one-level component edits already cascade
// through src/procurement/event-purchasing.manifest; nested ComponentComponent
// lines do not.
//
// Walks parent/dish/event indexes (not whole-tenant collects). One public
// call reconciles a few events so generated demand writes keep the caller's
// auth. The client hook repeats until the cursor is done.
//
// Also the publish seam (PL-DEMAND, BE-9.6 publish control): publishing runs
// the governed Component.publishVersion command, then saves the published
// formula as a ComponentSnapshot marked as a published edition
// (lib/culinaryModel/recipeEdition.ts). While the recipe is later taken back to
// draft, events keep using that edition. The impact list splits the events
// that use the recipe into the ones that follow a publish (not finished yet)
// and the ones that keep what they were made with (finished or cancelled).

import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { buildPublishedEdition } from "./lib/culinaryModel/recipeEdition";
import { FINISHED_EVENT_STAGES, requireCulinaryReader } from "./culinaryDemand";

const LIVE_EVENT_STAGES = new Set([
  "quote",
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
]);

const EVENT_BATCH = 3;

export const reconcileLiveEventsForComponent = mutation({
  args: {
    componentId: v.id("components"),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    eventIds: v.array(v.string()),
    reconciled: v.number(),
    nextCursor: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const eventIds = (
      await eventsUsingRecipe(ctx, tenantId, String(args.componentId))
    )
      .filter((event) => LIVE_EVENT_STAGES.has(String(event.stage)))
      .map((event) => String(event._id));
    const cursor = args.cursor ?? 0;
    const batch = eventIds.slice(cursor, cursor + EVENT_BATCH);
    for (const eventId of batch) {
      await ctx.runMutation(api.culinaryDemand.reconcileEventDemand, {
        eventId: eventId as Id<"events">,
      });
    }
    const nextCursor = cursor + batch.length;
    return {
      eventIds: batch,
      reconciled: batch.length,
      nextCursor,
      hasMore: nextCursor < eventIds.length,
    };
  },
});

/** Every event (any stage) serving a dish that reaches this recipe, directly or as a sub-recipe. */
export async function eventsUsingRecipe(
  ctx: QueryCtx | MutationCtx,
  tenantId: string,
  componentId: string,
): Promise<Doc<"events">[]> {
  return eventsUsingRecipes(
    ctx,
    tenantId,
    await ancestorRecipeIds(ctx, tenantId, componentId),
  );
}

async function ancestorRecipeIds(
  ctx: QueryCtx | MutationCtx,
  tenantId: string,
  startId: string,
): Promise<Set<string>> {
  const found = new Set<string>([startId]);
  const stack = [startId];
  while (stack.length) {
    const current = stack.pop() as string;
    const parents = await ctx.db
      .query("componentComponents")
      .withIndex("by_childComponentId", (q) =>
        q.eq("childComponentId", current as Id<"components">),
      )
      .collect();
    for (const line of parents) {
      if (line.tenantId !== tenantId) continue;
      if (line.deletedAt != null || line.addedAt == null) continue;
      const parent = String(line.componentId);
      if (found.has(parent)) continue;
      found.add(parent);
      stack.push(parent);
    }
  }
  return found;
}

async function eventsUsingRecipes(
  ctx: QueryCtx | MutationCtx,
  tenantId: string,
  recipeIds: Set<string>,
): Promise<Doc<"events">[]> {
  const dishIds = new Set<string>();
  for (const recipeId of recipeIds) {
    const links = await ctx.db
      .query("dishComponents")
      .withIndex("by_componentId", (q) =>
        q.eq("componentId", recipeId as Id<"components">),
      )
      .collect();
    for (const link of links) {
      if (link.tenantId !== tenantId) continue;
      if (link.deletedAt != null || link.attachedAt == null) continue;
      dishIds.add(String(link.dishId));
    }
  }
  const events = new Map<string, Doc<"events">>();
  for (const dishId of dishIds) {
    const rows = await ctx.db
      .query("eventDishes")
      .withIndex("by_dishId", (q) => q.eq("dishId", dishId as Id<"dishes">))
      .collect();
    for (const row of rows) {
      if (row.tenantId !== tenantId) continue;
      if (row.deletedAt != null || row.removedAt != null) continue;
      if (events.has(String(row.eventId))) continue;
      const event = await ctx.db.get(row.eventId);
      if (event && event.deletedAt == null && event.tenantId === tenantId)
        events.set(String(event._id), event);
    }
  }
  return [...events.values()];
}

export interface RecipeEditionEvent {
  eventId: string;
  title: string;
  startsAt: number | null;
  stage: string;
}

export interface RecipeEditionImpact {
  componentId: string;
  /** Events not finished yet: they use the recipe as published. */
  following: RecipeEditionEvent[];
  /** Finished or cancelled events: they keep the demand they were made with. */
  keeping: RecipeEditionEvent[];
}

async function impactFor(
  ctx: QueryCtx,
  tenantId: string,
  componentId: string,
): Promise<RecipeEditionImpact> {
  const events = await eventsUsingRecipe(ctx, tenantId, componentId);
  const row = (e: Doc<"events">): RecipeEditionEvent => ({
    eventId: String(e._id),
    title: e.title || "Untitled event",
    startsAt: typeof e.startsAt === "number" ? e.startsAt : null,
    stage: String(e.stage),
  });
  const byDate = (a: RecipeEditionEvent, b: RecipeEditionEvent) =>
    (a.startsAt ?? 0) - (b.startsAt ?? 0);
  return {
    componentId,
    following: events
      .filter((e) => !FINISHED_EVENT_STAGES.has(String(e.stage)))
      .map(row)
      .sort(byDate),
    keeping: events
      .filter((e) => FINISHED_EVENT_STAGES.has(String(e.stage)))
      .map(row)
      .sort(byDate),
  };
}

async function requireRecipe(
  ctx: QueryCtx,
  tenantId: string,
  componentId: Id<"components">,
): Promise<Doc<"components">> {
  const recipe = await ctx.db.get(componentId);
  if (!recipe || recipe.tenantId !== tenantId || recipe.deletedAt != null)
    throw new Error("Recipe not found");
  return recipe;
}

/** Which events a publish of this recipe reaches, and which keep their history. */
export const recipeEditionImpact = query({
  args: { componentId: v.id("components") },
  handler: async (ctx, args): Promise<RecipeEditionImpact> => {
    const tenantId = requireCulinaryReader(await getAuthContext(ctx));
    await requireRecipe(ctx, tenantId, args.componentId);
    return impactFor(ctx, tenantId, String(args.componentId));
  },
});

/** Publish the recipe and save the edition events will use. */
export const publishRecipeEdition = mutation({
  args: {
    componentId: v.id("components"),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RecipeEditionImpact> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    await requireRecipe(ctx, tenantId, args.componentId);
    await ctx.runMutation(api.mutations.Component_publishVersion, {
      docId: args.componentId,
      version: args.version,
    });
    const recipe = await requireRecipe(ctx, tenantId, args.componentId);
    const [ingredientLines, subRecipeLines] = await Promise.all([
      ctx.db
        .query("componentIngredients")
        .withIndex("by_componentId", (q) =>
          q.eq("componentId", args.componentId),
        )
        .collect(),
      ctx.db
        .query("componentComponents")
        .withIndex("by_componentId", (q) =>
          q.eq("componentId", args.componentId),
        )
        .collect(),
    ]);
    const names = new Map<string, string>();
    for (const line of ingredientLines) {
      if (line.tenantId !== tenantId || names.has(String(line.ingredientId)))
        continue;
      const ingredient = await ctx.db.get(line.ingredientId);
      if (ingredient && ingredient.tenantId === tenantId)
        names.set(String(line.ingredientId), ingredient.name);
    }
    const edition = buildPublishedEdition(
      {
        name: recipe.name,
        category: recipe.category,
        cuisine: recipe.cuisine,
        description: recipe.description,
        instructions: recipe.instructions,
        yieldQuantity: Number(recipe.yieldQuantity),
        yieldUnit: recipe.yieldUnit,
        batchMultiplier:
          recipe.batchMultiplier == null ? 1 : Number(recipe.batchMultiplier),
        servesPerYield: recipe.servesPerYield ?? 1,
        versionNumber: Number(recipe.versionNumber),
      },
      ingredientLines
        .filter((l) => l.tenantId === tenantId)
        .map((l) => ({ ...l, quantity: Number(l.quantity) })),
      subRecipeLines
        .filter((l) => l.tenantId === tenantId)
        .map((l) => ({ ...l, quantity: Number(l.quantity) })),
      (id) => names.get(id) ?? "Unknown ingredient",
    );
    await ctx.runMutation(api.mutations.ComponentSnapshot_createViaCapture, {
      componentId: String(args.componentId),
      versionNumber: Number(recipe.versionNumber),
      changeSummary: `Published edition ${recipe.versionNumber}`,
      snapshot: JSON.stringify(edition),
    });
    return impactFor(ctx, tenantId, String(args.componentId));
  },
});
