import type { AppAuthContext } from "./authContext";
import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { resolveLookupCostHint } from "./lookupCostFromOpenPrices";

type ApplyCtx = Pick<GenericActionCtx<DataModel>, "runMutation" | "runQuery">;

export async function applyLookupCostToIngredient(
  ctx: ApplyCtx,
  _auth: AppAuthContext,
  docId: Id<"ingredients">,
  args: {
    barcode?: string;
    productName: string;
    brandOwner?: string;
    category?: string;
    catalogUnit: string;
    servingGramsPerUnit?: number;
  },
): Promise<{
  costApplied: boolean;
  costNote: string;
  suggestedCostPerUnit?: number;
}> {
  const doc = await ctx.runQuery(api.queries.getIngredient, { id: docId });
  if (!doc) throw new Error("Ingredient not found");

  const tenantIngredients = await ctx.runQuery(api.queries.listIngredient, {});
  const hint = await resolveLookupCostHint({
    barcode: args.barcode,
    productName: args.productName,
    brandOwner: args.brandOwner,
    category: args.category ?? (typeof doc.category === "string" ? doc.category : undefined),
    catalogUnit: args.catalogUnit,
    servingGramsPerUnit: args.servingGramsPerUnit,
    tenantIngredients,
  });

  if (hint.costPerUnit == null || hint.costPerUnit <= 0) {
    return {
      costApplied: false,
      costNote: hint.costNote,
      suggestedCostPerUnit: hint.suggestedCostPerUnit,
    };
  }

  const autoSaveSources = new Set([
    "open_prices",
    "tenant_category",
    "tenant_name",
  ]);
  const mayAutoSave = hint.source != null && autoSaveSources.has(hint.source);
  if (!mayAutoSave) {
    return {
      costApplied: false,
      suggestedCostPerUnit: hint.costPerUnit,
      costNote: hint.costNote,
    };
  }

  const existingCost = Number(doc.costPerUnit ?? 0);
  if (existingCost > 0) {
    return {
      costApplied: false,
      suggestedCostPerUnit: hint.costPerUnit,
      costNote: `Existing catalog cost kept (${existingCost.toFixed(2)}). Lookup estimate was ${hint.costPerUnit.toFixed(2)}.`,
    };
  }

  try {
    await ctx.runMutation(api.mutations.Ingredient_updateCosting, {
      docId,
      version: doc.version,
      costPerUnit: hint.costPerUnit,
    });
  } catch {
    return {
      costApplied: false,
      suggestedCostPerUnit: hint.costPerUnit,
      costNote: `Lookup found ${hint.costPerUnit.toFixed(2)} per ${args.catalogUnit} — cost is filled below; tap Save cost to keep it.`,
    };
  }

  return {
    costApplied: true,
    suggestedCostPerUnit: hint.costPerUnit,
    costNote: hint.costNote,
  };
}

export async function resolveLookupCostForCreate(
  ctx: ApplyCtx,
  args: {
    barcode?: string;
    productName: string;
    brandOwner?: string;
    category?: string;
    catalogUnit: string;
    servingGramsPerUnit?: number;
    formCost: number;
    lookupUsed?: boolean;
  },
): Promise<number> {
  if (Number.isFinite(args.formCost) && args.formCost > 0) {
    return args.formCost;
  }
  if (!args.lookupUsed) {
    return 0;
  }
  const tenantIngredients = await ctx.runQuery(api.queries.listIngredient, {});
  const hint = await resolveLookupCostHint({
    barcode: args.barcode,
    productName: args.productName,
    brandOwner: args.brandOwner,
    category: args.category,
    catalogUnit: args.catalogUnit,
    servingGramsPerUnit: args.servingGramsPerUnit,
    tenantIngredients,
  });
  if (hint.costPerUnit != null && hint.costPerUnit > 0) {
    const autoSaveSources = new Set([
      "open_prices",
      "tenant_category",
      "tenant_name",
    ]);
    if (hint.source != null && autoSaveSources.has(hint.source)) {
      return hint.costPerUnit;
    }
  }
  return 0;
}
