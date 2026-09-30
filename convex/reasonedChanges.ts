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
import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";

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
