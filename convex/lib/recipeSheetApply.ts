// AUTHOR-OWNED — not generated. The parts of the owner's recipe sheet
// (recipe_sheet.csv, Ryan 2026-10-04) that a recipe import saves besides the
// ingredient lines: times, allergens marked on the sheet, the equipment list,
// numbered steps and packaging per service style. Applied in the same
// transaction that creates the recipe, through generated commands only.
import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const recipeSheetArgs = v.optional(
  v.object({
    activePrepMinutes: v.optional(v.number()),
    passiveCookMinutes: v.optional(v.number()),
    allergens: v.optional(v.array(v.string())),
    equipment: v.optional(v.array(v.string())),
    steps: v.optional(v.array(v.string())),
    packaging: v.optional(
      v.array(
        v.object({ serviceStyleId: v.string(), instructions: v.string() }),
      ),
    ),
  }),
);

export type RecipeSheetInput = {
  activePrepMinutes?: number;
  passiveCookMinutes?: number;
  allergens?: string[];
  equipment?: string[];
  steps?: string[];
  packaging?: { serviceStyleId: string; instructions: string }[];
};

/** Save the sheet's extras on a recipe the import just created. */
export async function applyRecipeSheet(
  ctx: MutationCtx,
  tenantId: string,
  componentId: Id<"components">,
  sheet: RecipeSheetInput | undefined,
) {
  if (!sheet) return;
  const minutes = (value: number | undefined) =>
    value != null && Number.isFinite(value) && value >= 0
      ? Math.round(value)
      : null;
  const active = minutes(sheet.activePrepMinutes);
  const passive = minutes(sheet.passiveCookMinutes);
  if (active != null || passive != null) {
    const row = await ctx.db.get(componentId);
    await ctx.runMutation(api.mutations.Component_setTimes, {
      docId: componentId,
      version: row?.version,
      activePrepMinutes: active ?? 0,
      passiveCookMinutes: passive ?? 0,
    });
  }
  const allergens = [...new Set(sheet.allergens ?? [])];
  if (allergens.length > 0) {
    const row = await ctx.db.get(componentId);
    await ctx.runMutation(api.mutations.Component_setDeclaredAllergens, {
      docId: componentId,
      version: row?.version,
      declaredAllergens: allergens,
    });
  }
  const equipment = (sheet.equipment ?? []).map((name) => name.trim());
  for (let index = 0; index < equipment.length; index++) {
    if (!equipment[index]) continue;
    await ctx.runMutation(api.mutations.ComponentEquipment_createViaAdd, {
      componentId,
      name: equipment[index],
      sortOrder: index + 1,
    });
  }
  const steps = (sheet.steps ?? []).map((step) => step.trim());
  for (let index = 0; index < steps.length; index++) {
    if (!steps[index]) continue;
    await ctx.runMutation(api.mutations.ComponentStep_createViaAdd, {
      componentId,
      instruction: steps[index],
      sortOrder: index + 1,
    });
  }
  const written = new Set<string>();
  for (const line of sheet.packaging ?? []) {
    const instructions = line.instructions.trim();
    const styleId = ctx.db.normalizeId("serviceStyles", line.serviceStyleId);
    const style = styleId ? await ctx.db.get(styleId) : null;
    if (!style || style.tenantId !== tenantId || style.deletedAt != null) {
      throw new Error("A packaging line names a service style this company does not have.");
    }
    // One line per service style; a sheet naming the same style twice keeps the first.
    if (!instructions || written.has(styleId as string)) continue;
    written.add(styleId as string);
    await ctx.runMutation(api.mutations.StylePackaging_createViaAdd, {
      serviceStyleId: line.serviceStyleId,
      instructions,
      componentId,
    });
  }
}
