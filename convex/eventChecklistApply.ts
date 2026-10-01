/**
 * AUTHOR SEAM — put a checklist on an event in one save.
 *
 * One to-do is made for each checklist line that is not on the event yet.
 * The lines already there are read inside the same transaction, so two
 * people applying the same checklist, or a second try after a failure,
 * never make a line twice and never leave half a checklist. Each to-do is
 * made by the generated EventTask.add command; its rules and permissions
 * apply unchanged.
 */
import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import {
  checklistLinesToAdd,
  parseChecklistLines,
} from "../src/lib/eventChecklists";

export const apply = mutation({
  args: { eventId: v.id("events"), checklistId: v.id("eventChecklists") },
  handler: async (ctx, args): Promise<{ added: number }> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const [event, checklist] = await Promise.all([
      ctx.db.get(args.eventId),
      ctx.db.get(args.checklistId),
    ]);
    if (!event || event.tenantId !== tenantId || event.deletedAt != null)
      throw new ConvexError("This event is not in your workspace.");
    if (
      !checklist ||
      checklist.tenantId !== tenantId ||
      checklist.deletedAt != null
    )
      throw new ConvexError("This checklist is not in your workspace.");
    if (checklist.status !== "active")
      throw new ConvexError(
        "This checklist was retired. Bring it back before you add it to an event.",
      );
    const tasks = (
      await ctx.db
        .query("eventTasks")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect()
    ).filter((task) => task.tenantId === tenantId);
    const lines = checklistLinesToAdd(
      args.checklistId,
      parseChecklistLines(checklist.itemsJson),
      event.startsAt ?? null,
      tasks,
    );
    for (const line of lines)
      await ctx.runMutation(api.mutations.EventTask_createViaAdd, {
        eventId: args.eventId,
        title: line.title,
        details: line.details || undefined,
        category: checklist.category ?? undefined,
        dueAt: line.dueAt,
        priority: line.priority,
        proofRequired: line.proofRequired,
        checklistTemplateId: args.checklistId,
        templateLineKey: line.key,
      });
    return { added: lines.length };
  },
});
