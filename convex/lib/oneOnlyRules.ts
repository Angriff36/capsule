import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * "Only one" rules, checked inside the originating command's transaction so
 * they hold for every way in (a page, the command route, two people pressing
 * at the same moment):
 * - one live packer for each section of a pack list;
 * - one answer for each planning suggestion on an event;
 * - one to-do for each checklist line on an event.
 * The generated create cannot read the other rows of its own table, so the
 * check runs here, after the row is written; a refusal rolls the write back.
 */
export async function enforceOneOnly(
  ctx: MutationCtx,
  event: ConvexCommandEvent,
): Promise<void> {
  if (event.entity === "PackSectionClaim" && event.type === "PackSectionTaken") {
    const row = await ctx.db.get(event.entityId as Id<"packSectionClaims">);
    if (!row) return;
    const other = (
      await ctx.db
        .query("packSectionClaims")
        .withIndex("by_packListId", (q) => q.eq("packListId", row.packListId))
        .collect()
    ).find(
      (claim) =>
        claim._id !== row._id &&
        claim.tenantId === row.tenantId &&
        claim.deletedAt == null &&
        claim.sectionKey === row.sectionKey &&
        claim.claimedAt != null &&
        claim.releasedAt == null,
    );
    if (other)
      throw new ConvexError(
        `${other.personName?.trim() || "Someone"} is already packing this section. Use "Take over" to take it.`,
      );
    return;
  }
  if (
    event.entity === "PlanningReceipt" &&
    event.type === "PlanningSuggestionAnswered"
  ) {
    const row = await ctx.db.get(event.entityId as Id<"planningReceipts">);
    if (!row) return;
    const other = (
      await ctx.db
        .query("planningReceipts")
        .withIndex("by_eventId", (q) => q.eq("eventId", row.eventId))
        .collect()
    ).some(
      (receipt) =>
        receipt._id !== row._id &&
        receipt.tenantId === row.tenantId &&
        receipt.deletedAt == null &&
        receipt.recordedAt != null &&
        receipt.suggestionKey === row.suggestionKey,
    );
    if (other)
      throw new ConvexError(
        "Someone already answered this suggestion. The board shows the new answer.",
      );
    return;
  }
  if (event.entity === "EventTask" && event.type === "EventTaskAdded") {
    const row = await ctx.db.get(event.entityId as Id<"eventTasks">);
    if (!row || row.checklistTemplateId == null || !row.templateLineKey) return;
    const other = (
      await ctx.db
        .query("eventTasks")
        .withIndex("by_eventId", (q) => q.eq("eventId", row.eventId))
        .collect()
    ).some(
      (task) =>
        task._id !== row._id &&
        task.tenantId === row.tenantId &&
        task.deletedAt == null &&
        task.checklistTemplateId === row.checklistTemplateId &&
        task.templateLineKey === row.templateLineKey,
    );
    if (other)
      throw new ConvexError(
        "This checklist line is already a to-do on the event.",
      );
  }
}
