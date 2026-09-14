// Authored sweep: when a nested recipe (or its ingredients) change, re-run
// the one demand calculation on every live event that still serves a dish
// reaching that recipe. Direct one-level component edits already cascade
// through src/procurement/event-purchasing.manifest; nested ComponentComponent
// lines do not.

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

export const reconcileLiveEventsForComponent = mutation({
  args: { componentId: v.id("components") },
  returns: v.object({
    eventIds: v.array(v.string()),
    reconciled: v.number(),
  }),
  handler: async (ctx, args) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const recipeIds = await ancestorRecipeIds(
      ctx,
      tenantId,
      String(args.componentId),
    );
    const eventIds = await liveEventIdsUsingRecipes(ctx, tenantId, recipeIds);
    for (const eventId of eventIds) {
      await ctx.runMutation(api.culinaryDemand.reconcileEventDemand, {
        eventId: eventId as Id<"events">,
      });
    }
    return { eventIds, reconciled: eventIds.length };
  },
});

async function ancestorRecipeIds(
  ctx: MutationCtx,
  tenantId: string,
  startId: string,
): Promise<Set<string>> {
  const lines = await ctx.db
    .query("componentComponents")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const parents = new Map<string, string[]>();
  for (const line of lines) {
    if (line.deletedAt != null || line.addedAt == null) continue;
    const child = String(line.childComponentId);
    const list = parents.get(child) ?? [];
    list.push(String(line.componentId));
    parents.set(child, list);
  }
  const found = new Set<string>([startId]);
  const stack = [startId];
  while (stack.length) {
    const current = stack.pop() as string;
    for (const parent of parents.get(current) ?? []) {
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
  const dishLinks = await ctx.db
    .query("dishComponents")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const dishIds = new Set(
    dishLinks
      .filter(
        (link) =>
          link.deletedAt == null &&
          link.attachedAt != null &&
          recipeIds.has(String(link.componentId)),
      )
      .map((link) => String(link.dishId)),
  );
  if (dishIds.size === 0) return [];
  const eventDishes = await ctx.db
    .query("eventDishes")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const candidateEventIds = new Set(
    eventDishes
      .filter(
        (row) =>
          row.deletedAt == null &&
          row.removedAt == null &&
          dishIds.has(String(row.dishId)),
      )
      .map((row) => String(row.eventId)),
  );
  const events = await ctx.db
    .query("events")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  return events
    .filter(
      (event) =>
        event.deletedAt == null &&
        candidateEventIds.has(String(event._id)) &&
        LIVE_EVENT_STAGES.has(String(event.stage)),
    )
    .map((event) => String(event._id));
}
