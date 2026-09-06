import { mutation, type MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { getAuthContext, requireTenant } from "./authContext";
import { requireKitchenAccess } from "./kitchenAccessGate";
import {
  readMaterializationReceipt,
  writeMaterializationReceipt,
} from "./materializationReceipt";

const unit = v.string();

async function ownedLive<Table extends "menus" | "dishes" | "ingredients" | "components" | "componentSnapshots">(
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

async function authorize(ctx: MutationCtx) {
  const auth = await getAuthContext(ctx);
  requireKitchenAccess(auth);
  return requireTenant(auth);
}

export const cloneMenu = mutation({
  args: {
    sourceMenuId: v.id("menus"),
    name: v.string(),
    isTemplate: v.boolean(),
    operationKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ menuId: string; lineCount: number; recovered: boolean }> => {
    const tenantId = await authorize(ctx);
    const source = await ownedLive(ctx, args.sourceMenuId, tenantId, "Menu");
    const prior = await readMaterializationReceipt<{ menuId: string; lineCount: number }>(
      ctx, tenantId, "menuClone", args.operationKey, args,
    );
    if (prior) return { ...prior, recovered: true };
    const lines = await ctx.db.query("menuDishes").withIndex("by_menuId", (q) => q.eq("menuId", args.sourceMenuId)).collect();
    for (const line of lines.filter((row) => row.deletedAt == null)) {
      await ownedLive(ctx, line.dishId, tenantId, "Dish");
    }
    const created = await ctx.runMutation(api.mutations.Menu_createViaDraft, {
      name: args.name,
      description: source.description ?? undefined,
      category: source.category ?? undefined,
      isTemplate: args.isTemplate,
      basePrice: source.basePrice,
      pricePerPerson: source.pricePerPerson,
      minGuests: source.minGuests,
      maxGuests: source.maxGuests,
      idempotencyKey: `${tenantId}:${args.operationKey}:menu`,
    });
    const liveLines = lines.filter((row) => row.deletedAt == null);
    for (let index = 0; index < liveLines.length; index++) {
      const line = liveLines[index];
      await ctx.runMutation(api.mutations.MenuDish_createViaAdd, {
        menuId: created.docId,
        dishId: line.dishId,
        sortOrder: line.sortOrder,
        sellingPrice: line.sellingPrice ?? undefined,
        course: line.course ?? undefined,
        serviceStyle: line.serviceStyle ?? undefined,
        specialInstructions: line.specialInstructions ?? undefined,
        idempotencyKey: `${tenantId}:${args.operationKey}:line:${line._id}`,
      });
    }
    const output = { menuId: String(created.docId), lineCount: liveLines.length };
    await writeMaterializationReceipt(ctx, tenantId, "menuClone", args.operationKey, args, output);
    return { ...output, recovered: false };
  },
});

const importLine = v.object({
  name: v.string(),
  ingredientId: v.optional(v.id("ingredients")),
  createNew: v.optional(v.boolean()),
  quantity: v.number(),
  unit,
  sortOrder: v.number(),
  wasteFactor: v.optional(v.number()),
  prepNotes: v.optional(v.string()),
});

export const importComponent = mutation({
  args: {
    operationKey: v.string(),
    projection: v.object({
      name: v.string(), yieldQuantity: v.number(), yieldUnit: unit,
      batchMultiplier: v.optional(v.number()), category: v.optional(v.string()),
      cuisine: v.optional(v.string()), description: v.optional(v.string()),
      instructions: v.optional(v.string()), lines: v.array(importLine),
    }),
  },
  handler: async (ctx, args): Promise<{ componentId: string; createdIngredientIds: string[]; lineIds: string[]; recovered: boolean }> => {
    const tenantId = await authorize(ctx);
    for (const line of args.projection.lines) {
      if (line.ingredientId) await ownedLive(ctx, line.ingredientId, tenantId, "Ingredient");
      else if (!line.createNew) throw new Error(`${line.name} is missing a matched ingredient`);
    }
    const prior = await readMaterializationReceipt<{ componentId: string; createdIngredientIds: string[]; lineIds: string[] }>(
      ctx, tenantId, "componentImport", args.operationKey, args.projection,
    );
    if (prior) return { ...prior, recovered: true };
    const createdIngredientIds: string[] = [];
    const ingredientIds: Id<"ingredients">[] = [];
    for (let index = 0; index < args.projection.lines.length; index++) {
      const line = args.projection.lines[index];
      if (line.ingredientId) ingredientIds.push(line.ingredientId);
      else {
        const created = await ctx.runMutation(api.mutations.Ingredient_createViaIntroduce, {
          name: line.name.trim(), unit: line.unit as never, costPerUnit: 0, allergens: [],
          idempotencyKey: `${tenantId}:${args.operationKey}:ingredient:${index}`,
        });
        createdIngredientIds.push(String(created.docId));
        ingredientIds.push(created.docId);
      }
    }
    const component = await ctx.runMutation(api.mutations.Component_createViaDraft, {
      ...args.projection, lines: undefined, yieldUnit: args.projection.yieldUnit as never,
      idempotencyKey: `${tenantId}:${args.operationKey}:component`,
    });
    const lineIds: string[] = [];
    for (let index = 0; index < args.projection.lines.length; index++) {
      const line = args.projection.lines[index];
      const created = await ctx.runMutation(api.mutations.ComponentIngredient_createViaAdd, {
        componentId: component.docId, ingredientId: ingredientIds[index], quantity: line.quantity,
        unit: line.unit as never, sortOrder: line.sortOrder, wasteFactor: line.wasteFactor,
        prepNotes: line.prepNotes, idempotencyKey: `${tenantId}:${args.operationKey}:line:${index}`,
      });
      lineIds.push(String(created.docId));
    }
    const output = { componentId: String(component.docId), createdIngredientIds, lineIds };
    await writeMaterializationReceipt(ctx, tenantId, "componentImport", args.operationKey, args.projection, output);
    return { ...output, recovered: false };
  },
});

type SnapshotLine = { ingredientId: string; quantity: number; unit: string; sortOrder?: number; wasteFactor?: number; prepNotes?: string };
type SnapshotData = { name: string; yieldQuantity: number; yieldUnit: string; batchMultiplier?: number; servesPerYield?: number; category?: string; cuisine?: string; description?: string; instructions?: string; lines: SnapshotLine[] };

export const restoreComponentSnapshot = mutation({
  args: { componentId: v.id("components"), snapshotId: v.id("componentSnapshots"), operationKey: v.string() },
  handler: async (ctx, args): Promise<{ componentId: string; lineCount: number; recovered: boolean }> => {
    const tenantId = await authorize(ctx);
    const component = await ownedLive(ctx, args.componentId, tenantId, "Component");
    const snapshot = await ownedLive(ctx, args.snapshotId, tenantId, "ComponentSnapshot");
    if (snapshot.componentId !== args.componentId) throw new Error("Snapshot does not belong to this component");
    const prior = await readMaterializationReceipt<{ componentId: string; lineCount: number }>(ctx, tenantId, "componentRestore", args.operationKey, args);
    if (prior) return { ...prior, recovered: true };
    const target = JSON.parse(snapshot.snapshot) as SnapshotData;
    if (!target || !Array.isArray(target.lines)) throw new Error("Snapshot payload is invalid");
    for (const line of target.lines) await ownedLive(ctx, line.ingredientId as Id<"ingredients">, tenantId, "Ingredient");
    await ctx.runMutation(api.mutations.Component_reviseDraft, {
      docId: args.componentId, name: target.name, yieldQuantity: target.yieldQuantity,
      yieldUnit: target.yieldUnit as never, batchMultiplier: target.batchMultiplier ?? component.batchMultiplier ?? 1,
      servesPerYield: target.servesPerYield ?? component.servesPerYield ?? 1, category: target.category || undefined,
      cuisine: target.cuisine || undefined, description: target.description || undefined,
      instructions: target.instructions || undefined, version: component.version,
      idempotencyKey: `${tenantId}:${args.operationKey}:component`,
    });
    const currentLines = await ctx.db.query("componentIngredients").withIndex("by_componentId", (q) => q.eq("componentId", args.componentId)).collect();
    for (const line of currentLines.filter((row) => row.deletedAt == null)) {
      await ctx.runMutation(api.mutations.ComponentIngredient_remove, {
        docId: line._id, reason: `Restored from snapshot ${args.snapshotId}`, version: line.version,
        idempotencyKey: `${tenantId}:${args.operationKey}:remove:${line._id}`,
      });
    }
    for (let index = 0; index < target.lines.length; index++) {
      const line = target.lines[index];
      await ctx.runMutation(api.mutations.ComponentIngredient_createViaAdd, {
        componentId: args.componentId, ingredientId: line.ingredientId as Id<"ingredients">,
        quantity: line.quantity, unit: line.unit as never, sortOrder: line.sortOrder ?? index,
        wasteFactor: line.wasteFactor, prepNotes: line.prepNotes || undefined,
        idempotencyKey: `${tenantId}:${args.operationKey}:add:${index}`,
      });
    }
    const output = { componentId: String(args.componentId), lineCount: target.lines.length };
    await writeMaterializationReceipt(ctx, tenantId, "componentRestore", args.operationKey, args, output);
    return { ...output, recovered: false };
  },
});
