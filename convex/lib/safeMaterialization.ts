import { mutation, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { v } from "convex/values";
import { getAuthContext, requireTenant } from "./authContext";
import { orgCapabilityDeniesAction } from "./orgCapabilityGate";
import {
  readMaterializationReceipt,
  writeMaterializationReceipt,
} from "./materializationReceipt";

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

async function ownedLive<Table extends "packLists" | "events" | "vendors" | "vendorOrders" | "ingredientDemands" | "ingredients">(
  ctx: MutationCtx,
  id: Id<Table>,
  tenantId: string,
  label: string,
) {
  const row = await ctx.db.get(id);
  if (!row || row.deletedAt != null || row.tenantId !== tenantId) {
    throw new Error(`${label} not found`);
  }
  return row;
}


export const applyPackTemplate = mutation({
  args: {
    packListId: v.id("packLists"),
    operationKey: v.string(),
    items: v.array(v.object({
      description: v.string(),
      requiredQuantity: v.number(),
      unit: v.string(),
    })),
  },
  handler: async (ctx, args): Promise<{ itemCount: number; recovered: boolean }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireRole(auth, "logisticsAccess");
    await ownedLive(ctx, args.packListId, tenantId, "PackList");
    const prior = await readMaterializationReceipt<{ itemCount: number }>(ctx, tenantId, "pack", args.operationKey, args);
    if (prior) return { ...prior, recovered: true };
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
    const output = { itemCount: args.items.length };
    await writeMaterializationReceipt(ctx, tenantId, "pack", args.operationKey, args, output);
    return { ...output, recovered: false };
  },
});

export const applyLayoutTemplate = mutation({
  args: {
    eventId: v.id("events"),
    operationKey: v.string(),
    baseSortOrder: v.number(),
    sections: v.array(v.object({
      type: v.string(),
      instructions: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<{ sectionCount: number; recovered: boolean }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireRole(auth, "eventAccess");
    await ownedLive(ctx, args.eventId, tenantId, "Event");
    const prior = await readMaterializationReceipt<{ sectionCount: number }>(ctx, tenantId, "layout", args.operationKey, args);
    if (prior) return { ...prior, recovered: true };
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
    const output = { sectionCount: args.sections.length };
    await writeMaterializationReceipt(ctx, tenantId, "layout", args.operationKey, args, output);
    return { ...output, recovered: false };
  },
});

export const draftPurchaseOrder = mutation({
  args: {
    eventId: v.id("events"),
    vendorId: v.id("vendors"),
    existingOrderId: v.optional(v.id("vendorOrders")),
    operationKey: v.string(),
    lines: v.array(v.object({
      ingredientId: v.id("ingredients"),
      ingredientDemandId: v.id("ingredientDemands"),
      orderedQuantity: v.number(),
      unit: v.string(),
      unitCost: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<{ vendorOrderId: string; lineCount: number; recovered: boolean }> => {
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
    const prior = await readMaterializationReceipt<{ vendorOrderId: string; lineCount: number }>(ctx, tenantId, "po", args.operationKey, args);
    if (prior) return { ...prior, recovered: true };
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
    const output = { vendorOrderId: String(order.docId), lineCount: args.lines.length };
    await writeMaterializationReceipt(ctx, tenantId, "po", args.operationKey, args, output);
    return { ...output, recovered: false };
  },
});
