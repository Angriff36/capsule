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

const stagedLineInput = v.object({
  sourceOrder: v.number(),
  sourceLine: v.string(),
  parsedQuantity: v.optional(v.number()),
  parsedUnit: v.optional(v.string()),
  parsedIngredientName: v.optional(v.string()),
  preparationNote: v.optional(v.string()),
});

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
      lineIds.push(String(staged.docId));
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
});

/**
 * Saves review corrections in one transaction: header revision bump plus every
 * line measurement edit, guarded by the caller's expected revision. Omitted
 * fields keep their stored values, so unknown measurements stay explicitly
 * unknown instead of being coerced. A stale expected revision conflicts with
 * no writes.
 */
export const saveComponentImportReview = mutation({
  args: {
    importId: v.id("componentImports"),
    expectedReviewRevision: v.number(),
    header: saveHeaderInput,
    lines: v.array(saveLineInput),
  },
  handler: async (ctx, args): Promise<{ reviewRevision: number }> => {
    const tenantId = await authorize(ctx);
    const row = await ownedImport(ctx, args.importId, tenantId);
    if (row.status === "ready") {
      await ctx.runMutation(api.mutations.ComponentImport_resumeReview, { docId: args.importId });
    } else if (row.status !== "reviewing") {
      throw new Error(`component import is ${row.status}; only reviewing or ready reviews can be saved`);
    }
    if (row.reviewRevision !== args.expectedReviewRevision) {
      throw new Error(`stale review revision: expected ${args.expectedReviewRevision}, stored ${row.reviewRevision}`);
    }
    for (const line of args.lines) {
      const stored = await ctx.db.get(line.lineId);
      if (!stored || stored.deletedAt != null || stored.tenantId !== tenantId || stored.importId !== args.importId) {
        throw new Error("Review line not found for this import");
      }
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
      const stored = (await ctx.db.get(line.lineId))!;
      await ctx.runMutation(api.mutations.ComponentImportLine_reviseMeasurements, {
        docId: line.lineId,
        expectedReviewRevision: nextRevision,
        parsedQuantity: line.parsedQuantity ?? stored.parsedQuantity ?? undefined,
        parsedUnit: (line.parsedUnit ?? stored.parsedUnit ?? null) as never,
        preparationNote: line.preparationNote ?? stored.preparationNote ?? undefined,
      });
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
