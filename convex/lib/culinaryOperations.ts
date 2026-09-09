import { mutation, type MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { getAuthContext, requireTenant } from "./authContext";
import { requireKitchenAccess } from "./kitchenAccessGate";
import { dishRecipeRepairArgs, repairDishRecipe, reconcileEventRecipeSync, componentRecipeRepairArgs, repairComponentRecipe } from "./dishRecipeRepair";
import {
  readMaterializationReceipt,
  writeMaterializationReceipt,
} from "./materializationReceipt";

export const reconcileImportedEventRecipeSync = mutation({
  args: { eventId: v.id("events"), expectedEventVersion: v.number() },
  handler: reconcileEventRecipeSync,
});

export const repairImportedComponentRecipe = mutation({
  args: componentRecipeRepairArgs,
  handler: repairComponentRecipe,
});

const unit = v.string();

/** Restore source-reviewed dish associations without inventing container capacity. */
export const reconcileImportedPackingAssociations = mutation({
  args: {
    operationKey: v.string(),
    packListId: v.id("packLists"),
    expectedVersion: v.number(),
    expectedEventVersion: v.number(),
    links: v.array(v.object({
      itemId: v.id("packListItems"),
      expectedVersion: v.number(),
      expectedDescription: v.string(),
      eventDishId: v.id("eventDishes"),
      expectedEventDishVersion: v.number(),
      sourceReference: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!["owner", "admin", "system"].includes(auth.role))
      throw new Error("Only an administrator may repair imported packing associations");
    if (!args.operationKey.trim() || !args.links.length)
      throw new Error("A repair key and reviewed packing associations are required");
    const payload = JSON.stringify({ packListId: args.packListId, expectedVersion: args.expectedVersion,
      expectedEventVersion: args.expectedEventVersion, links: args.links.map(link => ({
        itemId: link.itemId, expectedVersion: link.expectedVersion, expectedDescription: link.expectedDescription,
        eventDishId: link.eventDishId, expectedEventDishVersion: link.expectedEventDishVersion, sourceReference: link.sourceReference,
      })) });
    type Receipt = { payload: string; changed: number; items: { itemId: string; eventDishId: string; dishId: string; sourceReference: string; before: unknown }[] };
    const prior = await readMaterializationReceipt<Receipt>(ctx, tenantId, "packingAssociationRepair", args.operationKey, args);
    if (prior) {
      if (prior.payload !== payload) throw new Error("Repair key was already used for a different packing plan");
      return { changed: prior.changed, recovered: true };
    }
    const list = await ctx.db.get(args.packListId);
    const event = list ? await ctx.db.get(list.eventId) : null;
    if (!list || list.tenantId !== tenantId || list.deletedAt != null || !event || event.tenantId !== tenantId || event.deletedAt != null)
      throw new Error("Pack list and event not found");
    if (["dispatched", "cancelled"].includes(list.status) || ["completed", "closed_out", "cancelled"].includes(event.stage))
      throw new Error("Historical packing records must remain unchanged");
    if (list.version !== args.expectedVersion || event.version !== args.expectedEventVersion)
      throw new Error("Packing event changed since source review");
    const seen = new Set<string>();
    const receipt: Receipt = { payload, changed: 0, items: [] };
    for (const link of args.links) {
      if (seen.has(link.itemId) || !link.sourceReference.trim())
        throw new Error("Each packing item needs one reviewed source association");
      seen.add(link.itemId);
      const item = await ctx.db.get(link.itemId);
      const selection = await ctx.db.get(link.eventDishId);
      const dish = selection ? await ctx.db.get(selection.dishId) : null;
      if (!item || item.tenantId !== tenantId || item.deletedAt != null || item.packListId !== list._id ||
        !selection || selection.tenantId !== tenantId || selection.deletedAt != null || selection.removedAt != null || selection.eventId !== event._id ||
        !dish || dish.tenantId !== tenantId || dish.deletedAt != null)
        throw new Error("Packing association must belong to this event and tenant");
      if (item.version !== link.expectedVersion || item.description !== link.expectedDescription || selection.version !== link.expectedEventDishVersion)
        throw new Error("Packing item or menu line changed since source review");
      // Existing template ownership requires its own capacity/servings repair.
      if (item.listedAt == null || item.dishContainerId != null || item.followsDishServings === true ||
        item.eventDishId != null || item.dishId != null || item.associationSource != null)
        throw new Error("Packing item already has a relationship or is not a listed import");
      receipt.items.push({ itemId: item._id, eventDishId: selection._id, dishId: dish._id, sourceReference: link.sourceReference, before: item });
      await ctx.runMutation(api.mutations.PackListItem_restoreImportedAssociation, {
        docId: item._id, eventDishId: selection._id, dishId: dish._id,
        expectedDescription: link.expectedDescription, expectedVersion: link.expectedVersion, expectedPackListVersion: args.expectedVersion,
        expectedEventVersion: args.expectedEventVersion, expectedEventDishVersion: link.expectedEventDishVersion,
        sourceReference: link.sourceReference,
      });
      receipt.changed++;
    }
    await writeMaterializationReceipt(ctx, tenantId, "packingAssociationRepair", args.operationKey, args, receipt);
    return { changed: receipt.changed, recovered: false };
  },
});

/** Correct reviewed TPP fluid-ounce labels without changing physical quantities. */
export const reconcileImportedPackingFluidOunces = mutation({
  args: {
    packListId: v.id("packLists"),
    expectedVersion: v.number(),
    items: v.array(v.object({
      itemId: v.id("packListItems"),
      expectedVersion: v.number(),
      sourceReference: v.string(),
    })),
  },
  handler: async (ctx, args): Promise<{ changed: number }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!["owner", "admin", "system"].includes(auth.role))
      throw new Error("Only an administrator may correct imported packing units");
    const list = await ctx.db.get(args.packListId);
    if (!list || list.tenantId !== tenantId || list.deletedAt != null)
      throw new Error("Pack list not found");
    const event = await ctx.db.get(list.eventId);
    if (!event || event.tenantId !== tenantId || event.deletedAt != null)
      throw new Error("Event not found");
    if (["dispatched", "cancelled"].includes(list.status) || ["completed", "closed_out", "cancelled"].includes(event.stage))
      throw new Error("Historical packing records must remain unchanged");
    const selected = new Set<string>();
    const pending: typeof args.items = [];
    for (const input of args.items) {
      if (selected.has(input.itemId)) throw new Error("Packing item selected twice");
      selected.add(input.itemId);
      if (!input.sourceReference.trim()) throw new Error("The original fluid-ounce source is required");
      const item = await ctx.db.get(input.itemId);
      if (!item || item.tenantId !== tenantId || item.deletedAt != null || item.packListId !== list._id)
        throw new Error("Packing item not found in this list");
      if (item.unitCorrectionSource === input.sourceReference && item.unit === "cup") continue;
      if (list.version !== args.expectedVersion || item.version !== input.expectedVersion)
        throw new Error("Packing record changed since the source review");
      if (item.unit !== "ounce" || item.unitCorrectionSource != null || item.dishContainerId != null || item.followsDishServings === true)
        throw new Error("Packing item is not an uncorrected imported fluid-ounce line");
      pending.push(input);
    }
    for (const input of pending) await ctx.runMutation(api.mutations.PackListItem_correctImportedFluidOunces, {
      docId: input.itemId, sourceReference: input.sourceReference, expectedVersion: input.expectedVersion,
    });
    return { changed: pending.length };
  },
});

/** Adopt reviewed legacy container lines without recreating physical packing work. */
export const reconcileImportedPackingLinks = mutation({
  args: {
    packListId: v.id("packLists"),
    expectedVersion: v.number(),
    links: v.array(v.object({
      itemId: v.id("packListItems"),
      expectedVersion: v.number(),
      eventDishId: v.id("eventDishes"),
      expectedEventDishVersion: v.number(),
      expectedContainerVersion: v.number(),
      followsDishServings: v.boolean(),
    })),
  },
  handler: async (ctx, args): Promise<{ changed: number }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!["owner", "admin", "system"].includes(auth.role))
      throw new Error("Only an administrator may reconcile imported packing links");
    const list = await ctx.db.get(args.packListId);
    if (!list || list.tenantId !== tenantId || list.deletedAt != null)
      throw new Error("Pack list not found");
    const event = await ctx.db.get(list.eventId);
    if (!event || event.tenantId !== tenantId || event.deletedAt != null ||
      ["completed", "closed_out", "cancelled"].includes(event.stage) ||
      ["dispatched", "cancelled"].includes(list.status))
      throw new Error("Historical packing records must remain unchanged");
    const items = await ctx.db.query("packListItems")
      .withIndex("by_packListId", q => q.eq("packListId", list._id)).collect();
    const seen = new Set<string>();
    const targets = new Set<string>();
    const pending: { itemId: Id<"packListItems">; eventDishId: Id<"eventDishes">; follows: boolean; servings: number; itemVersion: number; eventDishVersion: number; containerVersion: number }[] = [];
    for (const link of args.links) {
      if (seen.has(link.itemId)) throw new Error("Packing line selected twice");
      seen.add(link.itemId);
      const item = items.find(row => row._id === link.itemId && row.tenantId === tenantId && row.deletedAt == null);
      const dish = await ctx.db.get(link.eventDishId);
      const container = item?.dishContainerId ? await ctx.db.get(item.dishContainerId) : null;
      if (!item || !dish || dish.tenantId !== tenantId || dish.deletedAt != null ||
        dish.eventId !== event._id || !container || container.tenantId !== tenantId ||
        container.deletedAt != null || container.dishId !== dish.dishId || item.dishId !== dish.dishId)
        throw new Error("Packing line, container and event dish must refer to the same dish and event");
      const target = `${container._id}:${dish._id}`;
      if (targets.has(target) || items.some(row => row._id !== item._id && row.deletedAt == null &&
        row.tenantId === tenantId && row.dishContainerId === container._id && row.eventDishId === dish._id))
        throw new Error("Another packing line already represents this event dish and container");
      targets.add(target);
      if (item.eventDishId === dish._id && item.followsDishServings === link.followsDishServings) continue;
      if (item.eventDishId != null || item.version !== link.expectedVersion ||
        list.version !== args.expectedVersion || dish.version !== link.expectedEventDishVersion ||
        container.version !== link.expectedContainerVersion)
        throw new Error("Packing records changed since the reviewed repair snapshot");
      if (link.followsDishServings && item.unit !== container.unit)
        throw new Error("Packing unit differs from the container template; retain its manual quantity until reviewed");
      pending.push({ itemId: item._id, eventDishId: dish._id, follows: link.followsDishServings, servings: dish.quantityServings, itemVersion: item.version, eventDishVersion: dish.version, containerVersion: container.version });
    }
    for (const link of pending) {
      // Earlier automatic lines in this same transaction may reopen the parent.
      // The reviewed parent version was checked for the entire batch above.
      const currentList = await ctx.db.get(list._id);
      if (!currentList) throw new Error("Pack list not found");
      await ctx.runMutation(api.mutations.PackListItem_adoptContainerLink, {
        docId: link.itemId, eventDishId: link.eventDishId,
        followsDishServings: link.follows, containerServings: link.servings,
        expectedItemVersion: link.itemVersion, expectedPackListVersion: currentList.version,
        expectedEventDishVersion: link.eventDishVersion, expectedContainerVersion: link.containerVersion,
      });
      if (link.follows) await ctx.runMutation(api.mutations.PackListItem_syncContainerServings, {
        docId: link.itemId, quantityServings: link.servings,
      });
    }
    return { changed: pending.length };
  },
});

/** Restore imported whole recipes onto their dishes in one retry-safe transaction. */
export const repairImportedDishRecipe = mutation({ args: dishRecipeRepairArgs, handler: repairDishRecipe });

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

async function ownedImport(ctx: MutationCtx, id: Id<"componentImports">, tenantId: string) {
  const row = await ctx.db.get(id);
  if (!row || row.deletedAt != null || row.tenantId !== tenantId) {
    throw new Error("Component import not found");
  }
  return row;
}

/** Stable comparison form for replay/conflict checks: sorted keys, no undefined. */
function canonicalRequest(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      );
    }
    return entry;
  });
}

export const cloneMenu = mutation({
  args: {
    sourceMenuId: v.id("menus"),
    name: v.string(),
    isTemplate: v.boolean(),
    operationKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ menuId: string; menuName: string; lineCount: number; recovered: boolean }> => {
    const tenantId = await authorize(ctx);
    const source = await ownedLive(ctx, args.sourceMenuId, tenantId, "Menu");
    const prior = await readMaterializationReceipt<{ menuId: string; menuName: string; lineCount: number }>(
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
      });
    }
    const output = { menuId: String(created.docId), menuName: args.name, lineCount: liveLines.length };
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
    review: v.optional(v.object({
      importId: v.id("componentImports"),
      expectedRevision: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<{ componentId: string; createdIngredientIds: string[]; lineIds: string[]; recovered: boolean }> => {
    const tenantId = await authorize(ctx);
    if (args.review) {
      return finalizeReviewedImport(ctx, tenantId, args.operationKey, args.projection, args.review);
    }
    const prior = await readMaterializationReceipt<{ componentId: string; createdIngredientIds: string[]; lineIds: string[] }>(
      ctx, tenantId, "componentImport", args.operationKey, args.projection,
    );
    if (prior) return { ...prior, recovered: true };
    for (const line of args.projection.lines) {
      if (line.ingredientId) await ownedLive(ctx, line.ingredientId, tenantId, "Ingredient");
      else if (!line.createNew) throw new Error(`${line.name} is missing a matched ingredient`);
    }
    const createdIngredientIds: string[] = [];
    const ingredientIds: Id<"ingredients">[] = [];
    for (let index = 0; index < args.projection.lines.length; index++) {
      const line = args.projection.lines[index];
      if (line.ingredientId) ingredientIds.push(line.ingredientId);
      else {
        const created = await ctx.runMutation(api.mutations.Ingredient_createViaIntroduce, {
          name: line.name.trim(), unit: line.unit as never, costPerUnit: 0, allergens: [],
        });
        createdIngredientIds.push(String(created.docId));
        ingredientIds.push(created.docId);
      }
    }
    const component = await ctx.runMutation(api.mutations.Component_createViaDraft, {
      ...args.projection, lines: undefined, yieldUnit: args.projection.yieldUnit as never,
    });
    const lineIds: string[] = [];
    for (let index = 0; index < args.projection.lines.length; index++) {
      const line = args.projection.lines[index];
      const created = await ctx.runMutation(api.mutations.ComponentIngredient_createViaAdd, {
        componentId: component.docId, ingredientId: ingredientIds[index], quantity: line.quantity,
        unit: line.unit as never, sortOrder: line.sortOrder, wasteFactor: line.wasteFactor,
        prepNotes: line.prepNotes,
      });
      lineIds.push(String(created.docId));
    }
    const output = { componentId: String(component.docId), createdIngredientIds, lineIds };
    await writeMaterializationReceipt(ctx, tenantId, "componentImport", args.operationKey, args.projection, output);
    return { ...output, recovered: false };
  },
});

type ImportProjection = {
  name: string;
  yieldQuantity: number;
  yieldUnit: string;
  batchMultiplier?: number;
  category?: string;
  cuisine?: string;
  description?: string;
  instructions?: string;
  lines: {
    name: string;
    ingredientId?: Id<"ingredients">;
    createNew?: boolean;
    quantity: number;
    unit: string;
    sortOrder: number;
    wasteFactor?: number;
    prepNotes?: string;
  }[];
};

type ReviewedImportResult = { componentId: string; createdIngredientIds: string[]; lineIds: string[]; request: unknown };

/**
 * Atomic finalize for a durable ComponentImport review (PR03-01 + PR13 recovery).
 * One transaction validates the stored review, creates the business graph,
 * links created ingredients, records the component, completes the import and
 * writes the materialization receipt. The exact request is kept inside the
 * receipt so an identical replay after a lost acknowledgement returns the same
 * result, while the same operation key with a changed request conflicts.
 */
async function finalizeReviewedImport(
  ctx: MutationCtx,
  tenantId: string,
  operationKey: string,
  projection: ImportProjection,
  review: { importId: Id<"componentImports">; expectedRevision: number },
): Promise<{ componentId: string; createdIngredientIds: string[]; lineIds: string[]; recovered: boolean }> {
  const request = { projection, review: { importId: String(review.importId), expectedRevision: review.expectedRevision } };
  const prior = await readMaterializationReceipt<ReviewedImportResult>(
    ctx, tenantId, "componentImportReview", operationKey, request,
  );
  if (prior) {
    if (canonicalRequest(prior.request) !== canonicalRequest(request)) {
      throw new Error(`operation ${operationKey} was already used with a different request`);
    }
    return {
      componentId: prior.componentId,
      createdIngredientIds: prior.createdIngredientIds,
      lineIds: prior.lineIds,
      recovered: true,
    };
  }
  const row = await ownedImport(ctx, review.importId, tenantId);
  if (row.status === "ready") {
    await ctx.runMutation(api.mutations.ComponentImport_beginFinalization, {
      docId: review.importId, expectedReviewRevision: review.expectedRevision,
    });
  } else if (row.status === "finalizing") {
    if (row.reviewRevision !== review.expectedRevision) {
      throw new Error(`stale review revision: expected ${review.expectedRevision}, stored ${row.reviewRevision}`);
    }
  } else {
    throw new Error(`component import is ${row.status}; only ready or finalizing reviews can be finalized`);
  }
  if (row.parsedYieldQuantity == null || row.parsedYieldUnit == null) {
    throw new Error("reviewed yield needs a quantity and a unit before finalization");
  }
  const lines = (await ctx.db
    .query("componentImportLines")
    .withIndex("by_importId", (q) => q.eq("importId", review.importId))
    .collect())
    .filter((line) => line.deletedAt == null)
    .sort((a, b) => a.sourceOrder - b.sourceOrder);
  if (lines.length !== projection.lines.length) {
    throw new Error(`review has ${lines.length} saved lines but the finalize request carries ${projection.lines.length}`);
  }
  for (let index = 0; index < lines.length; index++) {
    const stored = lines[index];
    const requested = projection.lines[index];
    if (stored.parsedQuantity == null) throw new Error(`line ${index + 1} quantity needs correction before finalization`);
    if (stored.parsedUnit == null) throw new Error(`line ${index + 1} unit needs correction before finalization`);
    if (stored.parsedQuantity !== requested.quantity) {
      throw new Error(`line ${index + 1} quantity does not match the saved review`);
    }
    if (stored.parsedUnit !== requested.unit) {
      throw new Error(`line ${index + 1} unit does not match the saved review`);
    }
    if (stored.matchStatus === "exact" || stored.matchStatus === "confirmed_existing") {
      if (stored.matchedIngredientId == null || requested.ingredientId !== stored.matchedIngredientId) {
        throw new Error(`line ${index + 1} must keep its confirmed ingredient`);
      }
      await ownedLive(ctx, stored.matchedIngredientId, tenantId, "Ingredient");
    } else if (stored.matchStatus === "confirmed_new") {
      if (!requested.createNew || requested.ingredientId != null) {
        throw new Error(`line ${index + 1} is confirmed as a new ingredient`);
      }
      if ((stored.parsedIngredientName ?? "").trim() !== requested.name.trim()) {
        throw new Error(`line ${index + 1} name does not match the saved review`);
      }
    } else {
      throw new Error(`line ${index + 1} still needs review`);
    }
  }
  const createdIngredientIds: string[] = [];
  const ingredientIds: Id<"ingredients">[] = [];
  for (let index = 0; index < lines.length; index++) {
    const stored = lines[index];
    const requested = projection.lines[index];
    if (stored.matchStatus === "confirmed_new") {
      const created = await ctx.runMutation(api.mutations.Ingredient_createViaIntroduce, {
        name: requested.name.trim(), unit: requested.unit as never, costPerUnit: 0, allergens: [],
      });
      createdIngredientIds.push(String(created.docId));
      ingredientIds.push(created.docId);
      await ctx.runMutation(api.mutations.ComponentImportLine_attachCreatedIngredient, {
        docId: stored._id, matchedIngredientId: created.docId,
      });
    } else {
      ingredientIds.push(lines[index].matchedIngredientId as Id<"ingredients">);
    }
  }
  const component = await ctx.runMutation(api.mutations.Component_createViaDraft, {
    ...projection, lines: undefined, yieldUnit: projection.yieldUnit as never,
  });
  const lineIds: string[] = [];
  for (let index = 0; index < projection.lines.length; index++) {
    const requested = projection.lines[index];
    const created = await ctx.runMutation(api.mutations.ComponentIngredient_createViaAdd, {
      componentId: component.docId, ingredientId: ingredientIds[index], quantity: requested.quantity,
      unit: requested.unit as never, sortOrder: requested.sortOrder, wasteFactor: requested.wasteFactor,
      prepNotes: requested.prepNotes,
    });
    lineIds.push(String(created.docId));
  }
  await ctx.runMutation(api.mutations.ComponentImport_recordComponent, {
    docId: review.importId, resultingComponentId: component.docId,
  });
  await ctx.runMutation(api.mutations.ComponentImport_complete, { docId: review.importId });
  const output = { componentId: String(component.docId), createdIngredientIds, lineIds, request };
  await writeMaterializationReceipt(ctx, tenantId, "componentImportReview", operationKey, request, output);
  return { componentId: output.componentId, createdIngredientIds, lineIds, recovered: false };
}

const reviewSourceInput = v.object({
  kind: v.string(),
  filename: v.optional(v.string()),
  rawText: v.string(),
  csvSheetText: v.optional(v.string()),
  csvLinesText: v.optional(v.string()),
  byteCount: v.number(),
  fingerprint: v.string(),
});

/** Desired durable match state for one review line. */
const lineMatchInput = v.object({
  matchStatus: v.string(),
  matchedIngredientId: v.optional(v.id("ingredients")),
  possibleMatchIngredientIds: v.optional(v.array(v.string())),
});

type LineMatchTarget = { matchStatus: string; matchedIngredientId?: Id<"ingredients">; possibleMatchIngredientIds?: string[] };
type StoredLineMatch = { matchStatus: string; matchedIngredientId?: Id<"ingredients"> | null; possibleMatchIngredientIds?: string[]; resolvedAt?: number | null };

function sameLineMatch(stored: StoredLineMatch, target: LineMatchTarget): boolean {
  const storedId = stored.matchedIngredientId ?? null;
  const targetId = target.matchedIngredientId ?? null;
  if (stored.matchStatus !== target.matchStatus || storedId !== targetId) return false;
  const storedPossible = JSON.stringify(stored.possibleMatchIngredientIds ?? []);
  const targetPossible = JSON.stringify(target.possibleMatchIngredientIds ?? []);
  return storedPossible === targetPossible;
}

/**
 * Translates a desired durable match state into generated line commands.
 * "exact" stores the candidate suggestion, "possible" stores candidates,
 * "new" marks the line new, the confirmed states confirm, and "unresolved"
 * resets. An already-resolved line is reset first so a changed decision can
 * replace the stored one; an existing-ingredient target is validated by
 * confirmExisting through the tenant-scoped relation, so a foreign or
 * retired ingredient fails here without writes past the reset.
 */
async function applyLineMatch(
  ctx: MutationCtx,
  lineId: Id<"componentImportLines">,
  stored: StoredLineMatch,
  target: LineMatchTarget,
) {
  if (sameLineMatch(stored, target)) return;
  if (target.matchStatus === "unresolved") {
    if (stored.matchStatus !== "unresolved" || stored.matchedIngredientId != null || (stored.possibleMatchIngredientIds ?? []).length > 0) {
      await ctx.runMutation(api.mutations.ComponentImportLine_resetResolution, { docId: lineId });
    }
    return;
  }
  if (stored.resolvedAt != null) {
    await ctx.runMutation(api.mutations.ComponentImportLine_resetResolution, { docId: lineId });
  }
  if (target.matchStatus === "exact" || target.matchStatus === "confirmed_existing") {
    if (target.matchedIngredientId == null) {
      throw new Error(`Line match ${target.matchStatus} requires an ingredient`);
    }
    await ctx.runMutation(api.mutations.ComponentImportLine_suggestExactMatch, {
      docId: lineId, matchedIngredientId: target.matchedIngredientId,
    });
    if (target.matchStatus === "confirmed_existing") {
      await ctx.runMutation(api.mutations.ComponentImportLine_confirmExisting, {
        docId: lineId, matchedIngredientId: target.matchedIngredientId,
      });
    }
    return;
  }
  if (target.matchStatus === "possible") {
    await ctx.runMutation(api.mutations.ComponentImportLine_suggestPossibleMatches, {
      docId: lineId, possibleMatchIngredientIds: target.possibleMatchIngredientIds ?? [],
    });
    return;
  }
  if (target.matchStatus === "new") {
    await ctx.runMutation(api.mutations.ComponentImportLine_markNew, { docId: lineId });
    return;
  }
  if (target.matchStatus === "confirmed_new") {
    await ctx.runMutation(api.mutations.ComponentImportLine_confirmNew, { docId: lineId });
    return;
  }
  throw new Error(`Unknown line match status ${target.matchStatus}`);
}

const stagedLineInput = v.object({
  sourceOrder: v.number(),
  sourceLine: v.string(),
  parsedQuantity: v.optional(v.number()),
  parsedUnit: v.optional(v.string()),
  parsedIngredientName: v.optional(v.string()),
  preparationNote: v.optional(v.string()),
  match: v.optional(lineMatchInput),
});

/** Accept zero-click exact matches inside the save transaction, not after it.
 * A rejected approval must roll back the draft/revision as well as its lines.
 * Incomplete drafts skip this step and remain saveable.
 */
async function prepareReviewApproval(ctx: MutationCtx, importId: Id<"componentImports">) {
  const row = await ctx.db.get(importId);
  const lines = await ctx.db.query("componentImportLines")
    .withIndex("by_importId", (q) => q.eq("importId", importId)).collect();
  const live = lines.filter((line) => line.deletedAt == null);
  const positive = (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 0;
  if (!row?.parsedName?.trim() || !positive(row.parsedYieldQuantity) || !row.parsedYieldUnit ||
      live.length === 0 || live.some((line) => !positive(line.parsedQuantity) || !line.parsedUnit)) {
    throw new Error("Review needs a name, yield and measured ingredient lines before approval");
  }
  for (const line of live) {
    if (line.matchStatus === "exact" && line.matchedIngredientId != null) {
      await ctx.runMutation(api.mutations.ComponentImportLine_confirmExisting, {
        docId: line._id, matchedIngredientId: line.matchedIngredientId,
      });
    }
  }
}

const parsedHeaderInput = v.object({
  name: v.string(),
  lineCount: v.number(),
  description: v.optional(v.string()),
  category: v.optional(v.string()),
  cuisine: v.optional(v.string()),
  instructions: v.optional(v.string()),
  yieldQuantity: v.optional(v.number()),
  yieldUnit: v.optional(v.string()),
  batchMultiplier: v.optional(v.number()),
});

/**
 * Creates a durable review in one transaction: upload, recordParse, beginReview
 * and every line staged together, so a failure leaves nothing behind and a
 * success returns the reopenable import identity plus its starting revision.
 */
export const createComponentImportReview = mutation({
  args: {
    source: reviewSourceInput,
    parsed: parsedHeaderInput,
    lines: v.array(stagedLineInput),
    approveWhenReady: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ importId: string; reviewRevision: number; lineIds: string[] }> => {
    await authorize(ctx);
    if (args.parsed.lineCount !== args.lines.length) {
      throw new Error(`parsed line count ${args.parsed.lineCount} does not match ${args.lines.length} staged lines`);
    }
    const uploaded = await ctx.runMutation(api.mutations.ComponentImport_createViaUpload, {
      sourceKind: args.source.kind as never,
      rawSourceText: args.source.rawText,
      sourceByteCount: args.source.byteCount,
      sourceFingerprint: args.source.fingerprint,
      sourceFilename: args.source.filename,
      csvSheetText: args.source.csvSheetText,
      csvLinesText: args.source.csvLinesText,
    });
    await ctx.runMutation(api.mutations.ComponentImport_recordParse, {
      docId: uploaded.docId,
      parsedName: args.parsed.name,
      parsedLineCount: args.parsed.lineCount,
      parsedDescription: args.parsed.description,
      parsedCategory: args.parsed.category,
      parsedCuisine: args.parsed.cuisine,
      parsedInstructions: args.parsed.instructions,
      parsedYieldQuantity: args.parsed.yieldQuantity,
      parsedYieldUnit: args.parsed.yieldUnit as never,
      parsedBatchMultiplier: args.parsed.batchMultiplier,
    });
    await ctx.runMutation(api.mutations.ComponentImport_beginReview, { docId: uploaded.docId });
    const ordered = [...args.lines].sort((a, b) => a.sourceOrder - b.sourceOrder);
    const lineIds: string[] = [];
    for (const line of ordered) {
      const staged = await ctx.runMutation(api.mutations.ComponentImportLine_createViaStage, {
        importId: uploaded.docId,
        sourceOrder: line.sourceOrder,
        sourceLine: line.sourceLine,
        parsedQuantity: line.parsedQuantity,
        parsedUnit: line.parsedUnit as never,
        parsedIngredientName: line.parsedIngredientName,
        preparationNote: line.preparationNote,
      });
      // The workbench match already knows exact/possible/new confidence; store
      // it with the staged line so a saved review reopens with its decisions.
      if (line.match) {
        await applyLineMatch(ctx, staged.docId, {
          matchStatus: "unresolved",
          matchedIngredientId: null,
          possibleMatchIngredientIds: [],
          resolvedAt: null,
        }, line.match);
      }
      lineIds.push(String(staged.docId));
    }
    // Same ledger recompute the save transaction performs: the staged
    // decisions above already resolve lines, so the header's
    // resolvedLineCount must reflect them or a create-then-finalize flow can
    // never satisfy approveReview's resolved === parsed guard.
    if (args.approveWhenReady) await prepareReviewApproval(ctx, uploaded.docId);
    const stagedAll = await ctx.db
      .query("componentImportLines")
      .withIndex("by_importId", (q) => q.eq("importId", uploaded.docId))
      .collect();
    const stagedResolved = stagedAll.filter(
      (line) => line.deletedAt != null || line.resolvedAt != null,
    ).length;
    await ctx.runMutation(api.mutations.ComponentImport_recordResolutionProgress, {
      docId: uploaded.docId,
      resolvedLineCount: stagedResolved,
    });
    if (args.approveWhenReady) {
      await ctx.runMutation(api.mutations.ComponentImport_approveReview, { docId: uploaded.docId });
    }
    return { importId: String(uploaded.docId), reviewRevision: 0, lineIds };
  },
});

const saveHeaderInput = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  category: v.optional(v.string()),
  cuisine: v.optional(v.string()),
  instructions: v.optional(v.string()),
  yieldQuantity: v.optional(v.number()),
  yieldUnit: v.optional(v.string()),
  batchMultiplier: v.optional(v.number()),
});

const saveLineInput = v.object({
  lineId: v.id("componentImportLines"),
  parsedQuantity: v.optional(v.number()),
  parsedUnit: v.optional(v.string()),
  preparationNote: v.optional(v.string()),
  parsedIngredientName: v.optional(v.string()),
  match: v.optional(lineMatchInput),
});

const discardedLineInput = v.object({
  lineId: v.id("componentImportLines"),
  reason: v.string(),
});

/**
 * Saves review corrections in one transaction: header revision bump, every
 * line measurement/name edit, every changed match decision and every removed
 * line, guarded by the caller's expected revision. Omitted fields keep their
 * stored values, so unknown measurements stay explicitly unknown instead of
 * being coerced. A stale expected revision conflicts with no writes.
 */
export const saveComponentImportReview = mutation({
  args: {
    importId: v.id("componentImports"),
    expectedReviewRevision: v.number(),
    header: saveHeaderInput,
    lines: v.array(saveLineInput),
    discardedLines: v.optional(v.array(discardedLineInput)),
    approveWhenReady: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ reviewRevision: number }> => {
    const tenantId = await authorize(ctx);
    const row = await ownedImport(ctx, args.importId, tenantId);
    if (row.status === "ready" || row.status === "failed") {
      await ctx.runMutation(api.mutations.ComponentImport_resumeReview, { docId: args.importId });
    } else if (row.status !== "reviewing") {
      throw new Error(`component import is ${row.status}; only reviewing or ready reviews can be saved`);
    }
    if (row.reviewRevision !== args.expectedReviewRevision) {
      throw new Error(`stale review revision: expected ${args.expectedReviewRevision}, stored ${row.reviewRevision}`);
    }
    const storedLines = new Map<string, Doc<"componentImportLines">>();
    for (const line of args.lines) {
      const stored = await ctx.db.get(line.lineId);
      if (!stored || stored.deletedAt != null || stored.tenantId !== tenantId || stored.importId !== args.importId) {
        throw new Error("Review line not found for this import");
      }
      storedLines.set(String(line.lineId), stored);
    }
    for (const discard of args.discardedLines ?? []) {
      const stored = await ctx.db.get(discard.lineId);
      if (!stored || stored.deletedAt != null || stored.tenantId !== tenantId || stored.importId !== args.importId) {
        throw new Error("Discarded review line not found for this import");
      }
    }
    // Match decisions carry no revision of their own, so they run inside this
    // transaction after the revision check: a concurrent save fails the whole
    // save instead of leaving half-updated decisions.
    for (const line of args.lines) {
      if (!line.match) continue;
      const stored = storedLines.get(String(line.lineId))!;
      await applyLineMatch(ctx, line.lineId, stored, line.match);
    }
    for (const discard of args.discardedLines ?? []) {
      await ctx.runMutation(api.mutations.ComponentImportLine_discard, {
        docId: discard.lineId,
        reason: discard.reason,
      });
    }
    // The generated revise commands wipe optional params that arrive omitted,
    // so every omitted field is resolved to its stored value here. A null
    // stored measurement is preserved as null/undefined — never guessed.
    await ctx.runMutation(api.mutations.ComponentImport_reviseReview, {
      docId: args.importId,
      expectedReviewRevision: args.expectedReviewRevision,
      parsedName: args.header.name,
      parsedDescription: args.header.description ?? row.parsedDescription ?? undefined,
      parsedCategory: args.header.category ?? row.parsedCategory ?? undefined,
      parsedCuisine: args.header.cuisine ?? row.parsedCuisine ?? undefined,
      parsedInstructions: args.header.instructions ?? row.parsedInstructions ?? undefined,
      parsedYieldQuantity: args.header.yieldQuantity ?? row.parsedYieldQuantity ?? undefined,
      parsedYieldUnit: (args.header.yieldUnit ?? row.parsedYieldUnit ?? null) as never,
      parsedBatchMultiplier: args.header.batchMultiplier ?? row.parsedBatchMultiplier ?? undefined,
    });
    const nextRevision = args.expectedReviewRevision + 1;
    for (const line of args.lines) {
      const stored = storedLines.get(String(line.lineId))!;
      await ctx.runMutation(api.mutations.ComponentImportLine_reviseMeasurements, {
        docId: line.lineId,
        expectedReviewRevision: nextRevision,
        parsedQuantity: line.parsedQuantity ?? stored.parsedQuantity ?? undefined,
        parsedUnit: (line.parsedUnit ?? stored.parsedUnit ?? null) as never,
        preparationNote: line.preparationNote ?? stored.preparationNote ?? undefined,
        parsedIngredientName: line.parsedIngredientName ?? stored.parsedIngredientName ?? undefined,
      });
    }
    // A confirmed decision and a discard are both counted outcomes, so the
    // resolution ledger is recomputed from storage: every line that is
    // resolved or discarded counts, and approval stays blocked while any
    // live line still lacks a disposition.
    if (args.approveWhenReady) await prepareReviewApproval(ctx, args.importId);
    const allLines = await ctx.db
      .query("componentImportLines")
      .withIndex("by_importId", (q) => q.eq("importId", args.importId))
      .collect();
    const resolvedCount = allLines.filter(
      (line) => line.deletedAt != null || line.resolvedAt != null,
    ).length;
    await ctx.runMutation(api.mutations.ComponentImport_recordResolutionProgress, {
      docId: args.importId,
      resolvedLineCount: resolvedCount,
    });
    if (args.approveWhenReady) {
      await ctx.runMutation(api.mutations.ComponentImport_approveReview, { docId: args.importId });
    }
    return { reviewRevision: nextRevision };
  },
});

type SnapshotLine = { ingredientId: string; quantity: number; unit: string; sortOrder?: number; wasteFactor?: number; prepNotes?: string };
type SnapshotData = { name: string; yieldQuantity: number; yieldUnit: string; batchMultiplier?: number; servesPerYield?: number; category?: string; cuisine?: string; description?: string; instructions?: string; lines: SnapshotLine[] };

export const restoreComponentSnapshot = mutation({
  args: { componentId: v.id("components"), snapshotId: v.id("componentSnapshots"), operationKey: v.string() },
  handler: async (ctx, args): Promise<{ componentId: string; snapshotId: string; lineCount: number; recovered: boolean }> => {
    const tenantId = await authorize(ctx);
    const component = await ownedLive(ctx, args.componentId, tenantId, "Component");
    const snapshot = await ownedLive(ctx, args.snapshotId, tenantId, "ComponentSnapshot");
    if (snapshot.componentId !== args.componentId) throw new Error("Snapshot does not belong to this component");
    const prior = await readMaterializationReceipt<{ componentId: string; snapshotId: string; lineCount: number }>(ctx, tenantId, "componentRestore", args.operationKey, args);
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
    });
    const currentLines = await ctx.db.query("componentIngredients").withIndex("by_componentId", (q) => q.eq("componentId", args.componentId)).collect();
    for (const line of currentLines.filter((row) => row.deletedAt == null)) {
      await ctx.runMutation(api.mutations.ComponentIngredient_remove, {
        docId: line._id, reason: `Restored from snapshot ${args.snapshotId}`, version: line.version,
      });
    }
    for (let index = 0; index < target.lines.length; index++) {
      const line = target.lines[index];
      await ctx.runMutation(api.mutations.ComponentIngredient_createViaAdd, {
        componentId: args.componentId, ingredientId: line.ingredientId as Id<"ingredients">,
        quantity: line.quantity, unit: line.unit as never, sortOrder: line.sortOrder ?? index,
        wasteFactor: line.wasteFactor, prepNotes: line.prepNotes || undefined,
      });
    }
    const output = { componentId: String(args.componentId), snapshotId: String(args.snapshotId), lineCount: target.lines.length };
    await writeMaterializationReceipt(ctx, tenantId, "componentRestore", args.operationKey, args, output);
    return { ...output, recovered: false };
  },
});
