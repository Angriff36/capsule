import { mutation } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import { getAuthContext, requireTenant } from "./authContext";
import { orgCapabilityDeniesAction } from "./orgCapabilityGate";

const DRAFTABLE_EVENT_STAGES = new Set(["planning", "quote", "sales_lock"]);
const LOGISTICS_ROLES = new Set([
  "admin", "driver", "logistics_manager", "logistics_staff", "owner", "system",
]);
const EVENT_ROLES = new Set([
  "admin", "event_manager", "event_staff", "owner", "system",
]);
const MANAGE_ROLES = new Set([
  "admin", "event_manager", "finance_manager", "inventory_manager",
  "kitchen_manager", "logistics_manager", "manager", "owner",
  "sales_manager", "system", "workforce_manager",
]);
const PROCUREMENT_ROLES = new Set([
  "admin", "inventory_manager", "owner", "procurement_staff", "system",
]);

function requireRole(
  auth: Awaited<ReturnType<typeof getAuthContext>>,
  action: "logisticsAccess" | "eventAccess" | "procurementAccess",
) {
  const allowed =
    action === "logisticsAccess"
      ? LOGISTICS_ROLES.has(auth.role)
      : action === "eventAccess"
        ? EVENT_ROLES.has(auth.role)
        : PROCUREMENT_ROLES.has(auth.role) || MANAGE_ROLES.has(auth.role);
  if (
    !allowed ||
    orgCapabilityDeniesAction(action, auth.disabledCapabilities)
  ) {
    throw new Error(`${action.replace("Access", "")} access required`);
  }
}

async function ownedLive(ctx: any, id: string, tenantId: string, label: string) {
  const row = await ctx.db.get(id as never);
  if (!row || row.deletedAt != null || row.tenantId !== tenantId) {
    throw new Error(`${label} not found`);
  }
  return row as Record<string, any>;
}

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
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireRole(auth, "logisticsAccess");
    await ownedLive(ctx, args.packListId, tenantId, "PackList");
    for (let index = 0; index < args.items.length; index++) {
      const item = args.items[index];
      await ctx.runMutation(api.mutations.PackListItem_createViaAddItem, {
        packListId: args.packListId,
        description: item.description,
        requiredQuantity: item.requiredQuantity,
        unit: item.unit,
        idempotencyKey: `${tenantId}:${args.operationKey}:item:${index}`,
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
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireRole(auth, "eventAccess");
    await ownedLive(ctx, args.eventId, tenantId, "Event");
    for (let index = 0; index < args.sections.length; index++) {
      const section = args.sections[index];
      await ctx.runMutation(api.mutations.EventLayoutSection_createViaAdd, {
        eventId: args.eventId,
        type: section.type,
        instructions: section.instructions,
        sortOrder: args.baseSortOrder + index,
        idempotencyKey: `${tenantId}:${args.operationKey}:section:${index}`,
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
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireRole(auth, "procurementAccess");
    const event = await ownedLive(ctx, args.eventId, tenantId, "Event");
    if (!DRAFTABLE_EVENT_STAGES.has(String(event.stage))) {
      throw new Error(
        `Cannot draft a PO while the event is ${String(event.stage).replaceAll("_", " ")}.`,
      );
    }
    await ownedLive(ctx, args.vendorId, tenantId, "Vendor");
    for (const line of args.lines) {
      const demand = await ownedLive(
        ctx,
        line.ingredientDemandId,
        tenantId,
        "IngredientDemand",
      );
      if (
        String(demand.eventId) !== args.eventId ||
        String(demand.ingredientId) !== line.ingredientId
      ) {
        throw new Error(
          "IngredientDemand does not belong to this event and ingredient",
        );
      }
      await ownedLive(ctx, line.ingredientId, tenantId, "Ingredient");
    }
    if (args.existingOrderId) {
      const existing = await ownedLive(
        ctx,
        args.existingOrderId,
        tenantId,
        "VendorOrder",
      );
      if (
        existing.status !== "draft" ||
        String(existing.eventId) !== args.eventId ||
        String(existing.vendorId) !== args.vendorId
      ) {
        throw new Error(
          "VendorOrder is not the matching draft for this event and vendor",
        );
      }
    }
    const order = args.existingOrderId
      ? { docId: args.existingOrderId }
      : await ctx.runMutation(api.mutations.VendorOrder_createViaOpen, {
          vendorId: args.vendorId,
          eventId: args.eventId,
          notes: "Drafted from event needs",
          idempotencyKey: `${tenantId}:${args.operationKey}:order`,
        });
    for (const line of args.lines) {
      await ctx.runMutation(api.mutations.VendorOrderLine_createViaAddLine, {
        vendorOrderId: order.docId,
        ...line,
        idempotencyKey: `${tenantId}:${args.operationKey}:demand:${line.ingredientDemandId}`,
      });
    }
    return { vendorOrderId: order.docId };
  },
});
