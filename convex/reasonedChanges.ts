/**
 * AUTHOR SEAM — a change made with open "fix first" items, saved together
 * with the reason for it.
 *
 * The dispatch board and the planning board let a person go on with an open
 * item when they say why. The change and the reason are two records. Saved
 * one after the other from the page, one can be kept without the other: a
 * reason for a truck that never left, or a change with its reason lost.
 *
 * Each step here is the generated command the pages already use, so its
 * rules and permissions apply unchanged. Convex runs a mutation called from
 * a mutation inside the caller's transaction: when one step is refused,
 * nothing is kept.
 */
import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";

const reasonArgs = {
  reason: v.string(),
  openItems: v.optional(v.string()),
};

/** Send a pack list out with open items, and keep why. */
export const sendOutWithReason = mutation({
  args: {
    packListId: v.id("packLists"),
    version: v.optional(v.number()),
    eventId: v.id("events"),
    ...reasonArgs,
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(api.mutations.PackList_dispatch, {
      docId: args.packListId,
      version: args.version,
    });
    await ctx.runMutation(api.mutations.DepartureOverride_createViaRecord, {
      eventId: args.eventId,
      packListId: args.packListId,
      reason: args.reason,
      openItems: args.openItems,
    });
    return null;
  },
});

/** Put a person on an event who is already on another one, and keep why. */
export const assignPersonWithReason = mutation({
  args: {
    eventId: v.id("events"),
    personId: v.id("people"),
    role: v.string(),
    action: v.string(),
    ...reasonArgs,
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(api.mutations.EventAssignment_createViaAssign, {
      eventId: args.eventId,
      personId: args.personId,
      role: args.role,
    });
    await ctx.runMutation(api.mutations.PlanningOverride_createViaRecord, {
      eventId: args.eventId,
      action: args.action,
      reason: args.reason,
      openItems: args.openItems,
    });
    return null;
  },
});

/**
 * Hold equipment for an event with an open item, and keep why. With
 * `bookOutOfService` the reason is also the manager's reason for booking a
 * unit that is out of service (the reserve seam checks who may do that).
 */
export const holdEquipmentWithReason = mutation({
  args: {
    eventId: v.id("events"),
    equipmentId: v.id("equipments"),
    startsAt: v.number(),
    endsAt: v.number(),
    quantity: v.number(),
    bookOutOfService: v.optional(v.boolean()),
    action: v.string(),
    ...reasonArgs,
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(api.equipmentCheckout.reserve, {
      equipmentId: args.equipmentId,
      eventId: args.eventId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      quantity: args.quantity,
      ...(args.bookOutOfService ? { overrideReason: args.reason } : {}),
    });
    await ctx.runMutation(api.mutations.PlanningOverride_createViaRecord, {
      eventId: args.eventId,
      action: args.action,
      reason: args.reason,
      openItems: args.openItems,
    });
    return null;
  },
});

/**
 * Add what a planning suggestion asks for, and keep the answer, in one save.
 * The answer is what stops the board from suggesting it again, so an
 * addition without its answer would be offered (and added) a second time.
 * Two people pressing Add at the same moment: the second is told the
 * suggestion is already answered, and nothing of theirs is kept.
 */
export const acceptSuggestion = mutation({
  args: {
    eventId: v.id("events"),
    suggestionKey: v.string(),
    kind: v.union(
      v.literal("equipment"),
      v.literal("position"),
      v.literal("task"),
    ),
    /** The equipment id, the crew position name, or the to-do title. */
    target: v.string(),
    /** How many to add now. */
    add: v.number(),
    /** The amount the rule asks for in all; kept on the answer. */
    wanted: v.number(),
    basis: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    /** The earlier answer this one replaces, when there is one. */
    receiptId: v.optional(v.id("planningReceipts")),
    receiptVersion: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<null> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const answered = (
      await ctx.db
        .query("planningReceipts")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect()
    ).filter(
      (row) =>
        row.tenantId === tenantId &&
        row.deletedAt == null &&
        row.recordedAt != null &&
        row.suggestionKey === args.suggestionKey,
    );
    if (answered.some((row) => row._id !== args.receiptId))
      throw new ConvexError(
        "Someone already answered this suggestion. The board shows the new answer.",
      );

    if (args.kind === "equipment") {
      const equipmentId = ctx.db.normalizeId("equipments", args.target);
      if (!equipmentId || args.startsAt == null || args.endsAt == null)
        throw new ConvexError(
          "Set the event's date and times before you hold equipment for it.",
        );
      await ctx.runMutation(api.equipmentCheckout.reserve, {
        equipmentId,
        eventId: args.eventId,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        quantity: args.add,
      });
    } else if (args.kind === "position") {
      if (!Number.isSafeInteger(args.add) || args.add < 1 || args.add > 100)
        throw new ConvexError("Add between 1 and 100 crew positions.");
      for (let count = 0; count < args.add; count += 1)
        await ctx.runMutation(api.mutations.EventStaffNeed_createViaPostOpen, {
          eventId: args.eventId,
          role: args.target,
        });
    } else {
      await ctx.runMutation(api.mutations.EventTask_createViaAdd, {
        eventId: args.eventId,
        title: args.target,
        suggestionKey: args.suggestionKey,
      });
    }

    const answer = {
      quantity: args.wanted,
      declined: false,
      basis: args.basis,
    };
    if (args.receiptId)
      await ctx.runMutation(api.mutations.PlanningReceipt_answerAgain, {
        docId: args.receiptId,
        version: args.receiptVersion,
        ...answer,
      });
    else
      await ctx.runMutation(api.mutations.PlanningReceipt_createViaRecord, {
        eventId: args.eventId,
        suggestionKey: args.suggestionKey,
        ...answer,
      });
    return null;
  },
});
