import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { resolveLookupCostHint } from "./lookupCostFromOpenPrices";

type ApplyCtx = Pick<GenericActionCtx<DataModel>, "runMutation" | "runQuery">;

export async function applyLookupCostToIngredient(
  ctx: ApplyCtx,
  docId: Id<"ingredients">,
  barcode: string | undefined,
  catalogUnit: string,
  servingGramsPerUnit?: number,
): Promise<{ costApplied: boolean; costNote: string }> {
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

  await ctx.runMutation(api.mutations.Ingredient_updateCosting, {
    docId,
    version: doc.version,
    costPerUnit: hint.costPerUnit,
  });

  return { costApplied: true, costNote: hint.costNote };
}
