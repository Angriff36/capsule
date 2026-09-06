import { mutation } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";

export const applyPackTemplate = mutation({
  args: {
    packListId: v.string(),
    operationKey: v.string(),
    items: v.array(v.object({
      description: v.string(),
      requiredQuantity: v.number(),
      unit: v.string(),
    })),
  },
  handler: async (ctx, args): Promise<void> => {
    for (let index = 0; index < args.items.length; index++) {
      const item = args.items[index];
      await ctx.runMutation(api.mutations.PackListItem_createViaAddItem, {
        packListId: args.packListId,
        description: item.description,
        requiredQuantity: item.requiredQuantity,
        unit: item.unit,
        idempotencyKey: `${args.operationKey}:item:${index}`,
      });
    }
  },
});

export const applyLayoutTemplate = mutation({
  args: {
    eventId: v.string(),
    operationKey: v.string(),
    baseSortOrder: v.number(),
    sections: v.array(v.object({
      type: v.string(),
      instructions: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<void> => {
    for (let index = 0; index < args.sections.length; index++) {
      const section = args.sections[index];
      await ctx.runMutation(api.mutations.EventLayoutSection_createViaAdd, {
        eventId: args.eventId,
        type: section.type,
        instructions: section.instructions,
        sortOrder: args.baseSortOrder + index,
        idempotencyKey: `${args.operationKey}:section:${index}`,
      });
    }
  },
});

export const draftPurchaseOrder = mutation({
  args: {
    eventId: v.string(),
    vendorId: v.string(),
    existingOrderId: v.optional(v.string()),
    operationKey: v.string(),
    lines: v.array(v.object({
      ingredientId: v.string(),
      ingredientDemandId: v.string(),
      orderedQuantity: v.number(),
      unit: v.string(),
      unitCost: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<{ vendorOrderId: string }> => {
    const order = args.existingOrderId
      ? { docId: args.existingOrderId }
      : await ctx.runMutation(api.mutations.VendorOrder_createViaOpen, {
          vendorId: args.vendorId,
          eventId: args.eventId,
          notes: "Drafted from event needs",
          idempotencyKey: `${args.operationKey}:order`,
        });
    for (const line of args.lines) {
      await ctx.runMutation(api.mutations.VendorOrderLine_createViaAddLine, {
        vendorOrderId: order.docId,
        ...line,
        idempotencyKey: `${args.operationKey}:demand:${line.ingredientDemandId}`,
      });
    }
    return { vendorOrderId: order.docId };
  },
});
