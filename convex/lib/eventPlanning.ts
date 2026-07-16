/**
 * AUTHOR SEAM — allocate the instance required by generated Manifest commands,
 * invoke that generated command, and remove the target if it rejects.
 * Domain validation, policies, guards, encryption, events, and reactions stay
 * inside the generated mutation surface.
 */
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { action, internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getAuthContext, requireTenant } from "./authContext";

export const allocateClient = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    return await ctx.db.insert("clients", {
      tenantId,
      clientType: "company",
      taxExempt: false,
      paymentTermsDays: 0,
      status: "active",
      createdAt: Date.now(),
      version: 0,
    });
  },
});

export const allocateVenue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    return await ctx.db.insert("venues", {
      tenantId,
      name: "",
      venueType: "other",
      capacity: 0,
      status: "active",
      createdAt: Date.now(),
      version: 0,
    });
  },
});

export const allocateEvent = internalMutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, { clientId }) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const client = await ctx.db.get(clientId);
    if (!client || client.tenantId !== tenantId)
      throw new Error("Client not found");
    return await ctx.db.insert("events", {
      tenantId,
      clientId,
      title: "",
      eventType: "",
      expectedHeadcount: 0,
      budgetAmount: 0,
      quotedPrice: 0,
      stage: "planning",
      createdAt: Date.now(),
      version: 0,
    });
  },
});

export const allocateEventGuest = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const event = await ctx.db.get(eventId);
    if (!event || event.tenantId !== tenantId)
      throw new Error("Event not found");
    return await ctx.db.insert("eventGuests", {
      tenantId,
      eventId,
      name: "",
      specialMealRequired: false,
      rsvpStatus: "pending",
      createdAt: Date.now(),
      version: 0,
    });
  },
});

export const discardTarget = internalMutation({
  args: { docId: v.any() },
  handler: async (ctx, { docId }) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const target = await ctx.db.get(docId);
    if (target && "tenantId" in target && target.tenantId === tenantId) {
      await ctx.db.delete(docId);
    }
  },
});

async function discardAfterFailure(
  ctx: any,
  docId: unknown,
  error: unknown,
): Promise<never> {
  try {
    await ctx.runMutation(internal.lib.eventPlanning.discardTarget, { docId });
  } catch {
    // Preserve the generated command failure; an allocator cleanup failure must
    // never replace the policy/guard/validation error the user needs to see.
  }
  throw error;
}

export const createClient = action({
  args: { input: v.any() },
  handler: async (ctx, { input }): Promise<{ docId: Id<"clients"> }> => {
    const docId: Id<"clients"> = await ctx.runMutation(
      internal.lib.eventPlanning.allocateClient,
      {},
    );
    try {
      await ctx.runMutation(api.mutations.Client_register, { ...input, docId });
      return { docId };
    } catch (error) {
      return await discardAfterFailure(ctx, docId, error);
    }
  },
});

export const createVenue = action({
  args: { input: v.any() },
  handler: async (ctx, { input }): Promise<{ docId: Id<"venues"> }> => {
    const docId: Id<"venues"> = await ctx.runMutation(
      internal.lib.eventPlanning.allocateVenue,
      {},
    );
    try {
      await ctx.runMutation(api.mutations.Venue_register, { ...input, docId });
      return { docId };
    } catch (error) {
      return await discardAfterFailure(ctx, docId, error);
    }
  },
});

export const createEvent = action({
  args: { input: v.any() },
  handler: async (ctx, { input }): Promise<{ docId: Id<"events"> }> => {
    const docId: Id<"events"> = await ctx.runMutation(
      internal.lib.eventPlanning.allocateEvent,
      {
        clientId: input.clientId,
      },
    );
    try {
      await ctx.runMutation(api.mutations.Event_planEngagement, {
        ...input,
        docId,
      });
      return { docId };
    } catch (error) {
      return await discardAfterFailure(ctx, docId, error);
    }
  },
});

export const createEventGuest = action({
  args: { input: v.any() },
  handler: async (ctx, { input }): Promise<{ docId: Id<"eventGuests"> }> => {
    const docId: Id<"eventGuests"> = await ctx.runMutation(
      internal.lib.eventPlanning.allocateEventGuest,
      {
        eventId: input.eventId,
      },
    );
    try {
      await ctx.runMutation(api.mutations.EventGuest_invite, {
        ...input,
        docId,
      });
      return { docId };
    } catch (error) {
      return await discardAfterFailure(ctx, docId, error);
    }
  },
});
