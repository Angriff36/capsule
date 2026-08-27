import type { AppAuthContext } from "./authContext";
import { orgCapabilityDeniesAction } from "./orgCapabilityGate";
import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { resolveLookupCostHint } from "./lookupCostFromOpenPrices";

const KITCHEN_MANAGE_ROLES = new Set([
  "admin",
  "owner",
  "system",
  "kitchen_lead",
  "kitchen_manager",
]);

type ApplyCtx = Pick<GenericActionCtx<DataModel>, "runMutation" | "runQuery">;

function canManageIngredientCost(auth: AppAuthContext): boolean {
  if (!auth.tenantId || auth.role === "anonymous") return false;
  if (orgCapabilityDeniesAction("kitchenAccess", auth.disabledCapabilities)) {
    return false;
  }
  return KITCHEN_MANAGE_ROLES.has(auth.role);
}

export async function applyLookupCostToIngredient(
  ctx: ApplyCtx,
  auth: AppAuthContext,
  docId: Id<"ingredients">,
  barcode: string | undefined,
  catalogUnit: string,
  servingGramsPerUnit?: number,
): Promise<{
  costApplied: boolean;
  costNote: string;
  suggestedCostPerUnit?: number;
}> {
  const hint = await resolveLookupCostHint(
    barcode,
    catalogUnit,
    servingGramsPerUnit,
  );
  if (hint.costPerUnit == null || hint.costPerUnit <= 0) {
    return { costApplied: false, costNote: hint.costNote };
  }

  const doc = await ctx.runQuery(api.queries.getIngredient, { id: docId });
  if (!doc) throw new Error("Ingredient not found");

  const existingCost = Number(doc.costPerUnit ?? 0);
  if (existingCost > 0) {
    return {
      costApplied: false,
      suggestedCostPerUnit: hint.costPerUnit,
      costNote: `Existing catalog cost kept (${existingCost.toFixed(2)}). Lookup estimate was ${hint.costPerUnit.toFixed(2)} — update manually if you prefer it.`,
    };
  }

  if (!canManageIngredientCost(auth)) {
    return {
      costApplied: false,
      suggestedCostPerUnit: hint.costPerUnit,
      costNote: `Suggested catalog cost ${hint.costPerUnit.toFixed(2)} per ${catalogUnit} — enter it in Catalog Costing below (manager role required to auto-save).`,
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
      costNote: `Suggested catalog cost ${hint.costPerUnit.toFixed(2)} per ${catalogUnit} — save it manually in Catalog Costing.`,
    };
  }

  return {
    costApplied: true,
    suggestedCostPerUnit: hint.costPerUnit,
    costNote: hint.costNote,
  };
}
