// Revision-2 culinary model (2026-09-14) — content status and cost confidence.
//
// One definition for recipes (Component) and dishes, nested. A line is
// "known" when its ingredient has a catalog cost AND the line converts to the
// catalog unit at the stated basis, or its child recipe is complete and its
// quantity converts to the child's yield unit. Known subtotals are shown
// apart from the count of unknown lines. A $0.00 is never presented as a fact
// for a partial or none result.

import {
  convertQuantity,
  toPurchaseBasis,
  type ItemUnitMappingLike,
  type QuantityBasis,
  type UnitCode,
} from "./units";

export type ContentStatus = "complete" | "method_missing" | "ingredients_missing" | "both_missing";
export type CostConfidence = "complete" | "partial" | "none";

export interface IngredientLineLike {
  id: string;
  ingredientId: string;
  quantity: number;
  unit: UnitCode;
  wasteFactor?: number | null;
  quantityBasis?: QuantityBasis | null;
}

export interface NestedLineLike {
  id: string;
  childComponentId: string;
  quantity: number;
  unit: UnitCode;
  wasteFactor?: number | null;
  quantityBasis?: QuantityBasis | null;
}

export interface ComponentLike {
  id: string;
  name: string;
  yieldQuantity: number;
  yieldUnit: UnitCode;
  instructions?: string | null;
  stepCount: number;
  ingredientLines: IngredientLineLike[];
  componentLines: NestedLineLike[];
}

export interface IngredientLike {
  id: string;
  name: string;
  unit: UnitCode;
  costPerUnit: number | null;
}

export interface CostLookups {
  components: ReadonlyMap<string, ComponentLike>;
  ingredients: ReadonlyMap<string, IngredientLike>;
  mappings: readonly ItemUnitMappingLike[];
}

export function componentContentStatus(component: Pick<ComponentLike, "instructions" | "stepCount" | "ingredientLines" | "componentLines">): ContentStatus {
  const hasLines = component.ingredientLines.length + component.componentLines.length > 0;
  const hasMethod = component.stepCount > 0 || (component.instructions ?? "").trim().length > 0;
  if (hasLines && hasMethod) return "complete";
  if (hasLines) return "method_missing";
  if (hasMethod) return "ingredients_missing";
  return "both_missing";
}

export interface CostLineReport {
  lineId: string;
  label: string;
  known: boolean;
  cost: number | null;
  reason: string | null;
}

export interface CostReport {
  confidence: CostConfidence;
  knownSubtotal: number;
  unknownLines: number;
  totalLines: number;
  lines: CostLineReport[];
  /** Set when the walk met a recipe that contains an ancestor. */
  cycle: string[] | null;
}

const summarize = (lines: CostLineReport[], cycle: string[] | null): CostReport => {
  const known = lines.filter((l) => l.known);
  const knownSubtotal = known.reduce((sum, l) => sum + (l.cost ?? 0), 0);
  const unknownLines = lines.length - known.length;
  const confidence: CostConfidence =
    lines.length === 0 || known.length === 0 ? "none" : unknownLines === 0 && !cycle ? "complete" : "partial";
  return { confidence, knownSubtotal: Math.round(knownSubtotal * 100) / 100, unknownLines, totalLines: lines.length, lines, cycle };
};

/** Cost of one batch of a recipe, nested, with per-line reasons. */
export function componentBatchCost(componentId: string, lookups: CostLookups, path: string[] = []): CostReport {
  const component = lookups.components.get(componentId);
  if (!component) return summarize([{ lineId: componentId, label: componentId, known: false, cost: null, reason: "recipe not found" }], null);
  if (path.includes(componentId)) return summarize([], [...path, componentId]);
  const nextPath = [...path, componentId];
  const lines: CostLineReport[] = [];
  let cycle: string[] | null = null;
  for (const line of component.ingredientLines) {
    const ingredient = lookups.ingredients.get(line.ingredientId);
    const label = ingredient?.name ?? line.ingredientId;
    if (!ingredient) {
      lines.push({ lineId: line.id, label, known: false, cost: null, reason: "ingredient not found" });
      continue;
    }
    if (ingredient.costPerUnit == null) {
      lines.push({ lineId: line.id, label, known: false, cost: null, reason: "no catalog cost" });
      continue;
    }
    const basis = toPurchaseBasis(line.quantity, line.unit, line.quantityBasis ?? "as_purchased", lookups.mappings, {
      itemKind: "ingredient",
      itemId: ingredient.id,
    });
    if (basis.status !== "resolved") {
      lines.push({ lineId: line.id, label, known: false, cost: null, reason: basis.status });
      continue;
    }
    const converted = convertQuantity(basis.quantity, line.unit, ingredient.unit, lookups.mappings, {
      itemKind: "ingredient",
      itemId: ingredient.id,
    });
    if (converted.status !== "resolved") {
      lines.push({ lineId: line.id, label, known: false, cost: null, reason: converted.status });
      continue;
    }
    const cost = converted.quantity * (line.wasteFactor ?? 1) * ingredient.costPerUnit;
    lines.push({ lineId: line.id, label, known: true, cost: Math.round(cost * 10000) / 10000, reason: null });
  }
  for (const line of component.componentLines) {
    const child = lookups.components.get(line.childComponentId);
    const label = child?.name ?? line.childComponentId;
    if (!child) {
      lines.push({ lineId: line.id, label, known: false, cost: null, reason: "recipe not found" });
      continue;
    }
    if (nextPath.includes(child.id)) {
      cycle = [...nextPath, child.id];
      lines.push({ lineId: line.id, label, known: false, cost: null, reason: "cycle" });
      continue;
    }
    const childReport = componentBatchCost(child.id, lookups, nextPath);
    if (childReport.cycle) cycle = childReport.cycle;
    const converted = convertQuantity(line.quantity, line.unit, child.yieldUnit, lookups.mappings, {
      itemKind: "component",
      itemId: child.id,
    });
    if (childReport.confidence !== "complete" || converted.status !== "resolved" || child.yieldQuantity <= 0) {
      const reason =
        childReport.confidence !== "complete" ? `sub-recipe ${childReport.confidence}` : converted.status !== "resolved" ? converted.status : "yield missing";
      // A partial child still contributes its known part; the line stays unknown.
      lines.push({ lineId: line.id, label, known: false, cost: null, reason });
      continue;
    }
    const batches = (converted.quantity * (line.wasteFactor ?? 1)) / child.yieldQuantity;
    lines.push({ lineId: line.id, label, known: true, cost: Math.round(childReport.knownSubtotal * batches * 10000) / 10000, reason: null });
  }
  return summarize(lines, cycle);
}

export interface DishRequirementLike {
  id: string;
  kind: "ingredient" | "component";
  refId: string;
  /** per portion */
  quantity: number;
  unit: UnitCode;
  wasteFactor?: number | null;
  quantityBasis?: QuantityBasis | null;
  /** DishComponent fields — yieldQuantity is the attachment snapshot */
  yieldQuantity?: number | null;
  batchMultiplier?: number | null;
  pieceCount?: number | null;
  portionSpecPiecesPerBatch?: number | null;
}

/** Cost of one portion of a dish from its food requirements, nested through recipes. */
export function dishPortionCost(requirements: readonly DishRequirementLike[], lookups: CostLookups): CostReport {
  const lines: CostLineReport[] = [];
  let cycle: string[] | null = null;
  for (const req of requirements) {
    if (req.kind === "ingredient") {
      const report = componentBatchCost("__dish__", {
        ...lookups,
        components: new Map([
          [
            "__dish__",
            {
              id: "__dish__",
              name: "dish",
              yieldQuantity: 1,
              yieldUnit: "portion",
              stepCount: 1,
              ingredientLines: [{ id: req.id, ingredientId: req.refId, quantity: req.quantity, unit: req.unit, wasteFactor: req.wasteFactor, quantityBasis: req.quantityBasis }],
              componentLines: [],
            },
          ],
        ]),
      });
      lines.push(...report.lines);
      continue;
    }
    const child = lookups.components.get(req.refId);
    const label = child?.name ?? req.refId;
    if (!child) {
      lines.push({ lineId: req.id, label, known: false, cost: null, reason: "recipe not found" });
      continue;
    }
    const childReport = componentBatchCost(child.id, lookups);
    if (childReport.cycle) cycle = childReport.cycle;
    if (childReport.confidence !== "complete") {
      lines.push({ lineId: req.id, label, known: false, cost: null, reason: `recipe ${childReport.confidence}` });
      continue;
    }
    let batchesPerPortion: number | null = null;
    if (req.pieceCount != null && req.portionSpecPiecesPerBatch != null && req.portionSpecPiecesPerBatch > 0) {
      batchesPerPortion = req.pieceCount / req.portionSpecPiecesPerBatch;
    } else if (req.yieldQuantity != null && req.yieldQuantity > 0) {
      batchesPerPortion = (req.batchMultiplier ?? 1) / req.yieldQuantity;
    }
    if (batchesPerPortion == null) {
      lines.push({ lineId: req.id, label, known: false, cost: null, reason: "yield missing" });
      continue;
    }
    lines.push({ lineId: req.id, label, known: true, cost: Math.round(childReport.knownSubtotal * batchesPerPortion * 10000) / 10000, reason: null });
  }
  return summarize(lines, cycle);
}
