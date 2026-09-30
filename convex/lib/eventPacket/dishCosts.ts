import type { QueryCtx, MutationCtx } from "../../_generated/server";
import {
  dishPortionCost,
  type ComponentLike,
  type DishRequirementLike,
  type IngredientLike,
} from "../culinaryModel/costing";
import {
  isUnitCode,
  type ItemUnitMappingLike,
  type QuantityBasis,
  type UnitCode,
} from "../culinaryModel/units";

type Ctx = QueryCtx | MutationCtx;

const unitOf = (value: unknown, fallback: UnitCode = "each"): UnitCode =>
  isUnitCode(value as string) ? (value as UnitCode) : fallback;
const basisOf = (value: unknown): QuantityBasis | null =>
  value === "as_purchased" ||
  value === "as_produced" ||
  value === "raw" ||
  value === "cooked" ||
  value === "unknown"
    ? value
    : null;
const liveOwn = (row: any, tenantId: string) =>
  row && row.tenantId === tenantId && row.deletedAt == null;

/**
 * Cost of one portion of each dish, from its recipe lines and ingredient
 * catalog costs (same rules as the kitchen's costing). Null when any line's
 * cost is unknown, so an order is only judged on full costs. Reads only the
 * named dishes and the recipes they use.
 */
export async function dishPortionCosts(
  ctx: Ctx,
  tenantId: string,
  dishIds: string[],
): Promise<Map<string, number | null>> {
  const components = new Map<string, ComponentLike>();
  const ingredients = new Map<string, IngredientLike>();
  const requirements = new Map<string, DishRequirementLike[]>();

  const loadIngredient = async (id: string) => {
    if (ingredients.has(id)) return;
    const normalized = ctx.db.normalizeId("ingredients", id);
    const row: any = normalized ? await ctx.db.get(normalized) : null;
    if (!liveOwn(row, tenantId)) return;
    ingredients.set(id, {
      id,
      name: row.name,
      unit: unitOf(row.unit),
      costPerUnit: row.costPerUnit == null ? null : Number(row.costPerUnit),
    });
  };
  const loadComponent = async (id: string): Promise<void> => {
    if (components.has(id)) return;
    const normalized = ctx.db.normalizeId("components", id);
    const row: any = normalized ? await ctx.db.get(normalized) : null;
    if (!liveOwn(row, tenantId)) return;
    const [ingredientLines, childLines] = await Promise.all([
      ctx.db
        .query("componentIngredients")
        .withIndex("by_componentId", (q) => q.eq("componentId", row._id))
        .collect(),
      ctx.db
        .query("componentComponents")
        .withIndex("by_componentId", (q) => q.eq("componentId", row._id))
        .collect(),
    ]);
    const lines = ingredientLines.filter(
      (l: any) => liveOwn(l, tenantId) && l.addedAt != null,
    );
    const children = childLines.filter(
      (l: any) => liveOwn(l, tenantId) && l.addedAt != null,
    );
    components.set(id, {
      id,
      name: row.name,
      yieldQuantity: Number(row.yieldQuantity ?? 0),
      yieldUnit: unitOf(row.yieldUnit, "portion"),
      instructions: row.instructions ?? null,
      stepCount: 1,
      ingredientLines: lines.map((l: any) => ({
        id: String(l._id),
        ingredientId: String(l.ingredientId),
        quantity: Number(l.quantity),
        unit: unitOf(l.unit),
        wasteFactor: l.wasteFactor ?? 1,
        quantityBasis: basisOf(l.quantityBasis),
      })),
      componentLines: children.map((l: any) => ({
        id: String(l._id),
        childComponentId: String(l.childComponentId),
        quantity: Number(l.quantity),
        unit: unitOf(l.unit),
        wasteFactor: l.wasteFactor ?? 1,
        quantityBasis: basisOf(l.quantityBasis),
      })),
    });
    for (const l of lines) await loadIngredient(String(l.ingredientId));
    for (const l of children) await loadComponent(String(l.childComponentId));
  };

  for (const dishId of new Set(dishIds)) {
    const normalized = ctx.db.normalizeId("dishes", dishId);
    const dish: any = normalized ? await ctx.db.get(normalized) : null;
    if (!normalized || !liveOwn(dish, tenantId)) continue;
    const [ingredientLines, componentLines] = await Promise.all([
      ctx.db
        .query("dishIngredients")
        .withIndex("by_dishId", (q) => q.eq("dishId", normalized))
        .collect(),
      ctx.db
        .query("dishComponents")
        .withIndex("by_dishId", (q) => q.eq("dishId", normalized))
        .collect(),
    ]);
    const reqs: DishRequirementLike[] = [];
    for (const l of ingredientLines as any[]) {
      if (!liveOwn(l, tenantId) || l.addedAt == null) continue;
      await loadIngredient(String(l.ingredientId));
      reqs.push({
        id: String(l._id),
        kind: "ingredient",
        refId: String(l.ingredientId),
        quantity: Number(l.quantity),
        unit: unitOf(l.unit),
        wasteFactor: l.wasteFactor ?? 1,
        quantityBasis: basisOf(l.quantityBasis),
      });
    }
    for (const l of componentLines as any[]) {
      if (!liveOwn(l, tenantId) || l.attachedAt == null) continue;
      await loadComponent(String(l.componentId));
      const spec: any = l.portionSpecId ? await ctx.db.get(l.portionSpecId) : null;
      reqs.push({
        id: String(l._id),
        kind: "component",
        refId: String(l.componentId),
        quantity: 1,
        unit: "portion",
        yieldQuantity: Number(l.yieldQuantity ?? 1),
        batchMultiplier: Number(l.batchMultiplier ?? 1),
        pieceCount: l.pieceCount == null ? null : Number(l.pieceCount),
        portionSpecPiecesPerBatch:
          liveOwn(spec, tenantId) && spec.piecesPerBatch != null
            ? Number(spec.piecesPerBatch)
            : null,
        quantityBasis: basisOf(l.quantityBasis),
      });
    }
    requirements.set(dishId, reqs);
  }

  const mappings: ItemUnitMappingLike[] = [];
  for (const id of ingredients.keys()) {
    const rows = await ctx.db
      .query("itemUnitMappings")
      .withIndex("by_ingredientId", (q) =>
        q.eq("ingredientId", id as any),
      )
      .collect();
    for (const m of rows as any[]) {
      if (!liveOwn(m, tenantId) || m.recordedAt == null) continue;
      mappings.push({
        ingredientId: String(m.ingredientId),
        componentId: m.componentId ? String(m.componentId) : null,
        kind: m.kind,
        unit: unitOf(m.unit),
        equalsQuantity: Number(m.equalsQuantity),
        equalsUnit: unitOf(m.equalsUnit),
        fromBasis: basisOf(m.fromBasis),
        toBasis: basisOf(m.toBasis),
      });
    }
  }

  const costs = new Map<string, number | null>();
  for (const [dishId, reqs] of requirements) {
    const report = dishPortionCost(reqs, { components, ingredients, mappings });
    costs.set(
      dishId,
      report.confidence === "complete" ? report.knownSubtotal : null,
    );
  }
  return costs;
}
