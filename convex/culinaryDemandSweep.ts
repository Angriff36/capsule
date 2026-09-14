// Authored sweep: when a nested recipe (or its ingredients) change, re-run
// the one demand calculation on every live event that still serves a dish
// reaching that recipe. Direct one-level component edits already cascade
// through src/procurement/event-purchasing.manifest; nested ComponentComponent
// lines do not.
//
// Walks parent/dish/event indexes (not whole-tenant collects). One public
// call reconciles a few events so generated demand writes keep the caller's
// auth. The client hook repeats until the cursor is done.

import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";

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
    const eventIds = await liveEventIdsUsingRecipes(
      ctx,
      tenantId,
      await ancestorRecipeIds(ctx, tenantId, String(args.componentId)),
    );
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

async function ancestorRecipeIds(
  ctx: MutationCtx,
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

async function liveEventIdsUsingRecipes(
  ctx: MutationCtx,
  tenantId: string,
  recipeIds: Set<string>,
): Promise<string[]> {
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
  const eventIds = new Set<string>();
  for (const dishId of dishIds) {
    const rows = await ctx.db
      .query("eventDishes")
      .withIndex("by_dishId", (q) => q.eq("dishId", dishId as Id<"dishes">))
      .collect();
    for (const row of rows) {
      if (row.tenantId !== tenantId) continue;
      if (row.deletedAt != null || row.removedAt != null) continue;
      const event = await ctx.db.get(row.eventId);
      if (
        event &&
        event.deletedAt == null &&
        event.tenantId === tenantId &&
        LIVE_EVENT_STAGES.has(String(event.stage))
      ) {
        eventIds.add(String(event._id));
      }
    }
  }
  return [...eventIds];
}
