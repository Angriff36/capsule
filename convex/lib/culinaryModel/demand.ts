// Revision-2 culinary model (2026-09-14) — the ONE material-demand calculation.
//
// Demand comes only from food requirements: DishIngredient and DishComponent
// per portion, expanded through recipes (ComponentIngredient and nested
// ComponentComponent) with a visited set for cycles, unit conversion and
// basis at every hop. Event overrides and resolved choices change the
// effective requirement set. Tasks never add demand. Every contribution
// carries a stable sourceKey so replanning replaces rows idempotently and a
// task link can still say which dish and preparation it belongs to.

import { componentContentStatus, type ComponentLike, type ContentStatus, type IngredientLike } from "./costing";
import {
  convertQuantity,
  roundTo,
  toPurchaseBasis,
  type BasisStatus,
  type ItemUnitMappingLike,
  type QuantityBasis,
  type UnitCode,
  type UnitStatus,
} from "./units";

export interface PortionSpecLike {
  id: string;
  componentId: string;
  name: string;
  pieceQuantity: number;
  pieceUnit: UnitCode;
  piecesPerBatch: number | null;
}

export interface DishIngredientLike {
  id: string;
  ingredientId: string;
  quantity: number;
  unit: UnitCode;
  wasteFactor?: number | null;
  quantityBasis?: QuantityBasis | null;
}

export interface DishComponentLike {
  id: string;
  componentId: string;
  yieldQuantity: number;
  batchMultiplier: number;
  portionSpecId?: string | null;
  pieceCount?: number | null;
  quantityBasis?: QuantityBasis | null;
}

export interface DishTaskLike {
  id: string;
  name: string;
  componentId?: string | null;
  ingredientId?: string | null;
  resolution?: "resolved" | "choice_pending" | "content_missing" | null;
  choiceOptions?: string[] | null;
  materialDishIngredientIds: string[];
  materialDishComponentIds: string[];
}

export interface DishLike {
  id: string;
  name: string;
  kind?: "food" | "supply" | "service" | "package" | null;
  ingredientLines: DishIngredientLike[];
  componentLines: DishComponentLike[];
  tasks: DishTaskLike[];
}

export type OverrideKind = "add" | "remove" | "replace" | "adjust";

export interface OverrideLike {
  id: string;
  kind: OverrideKind;
  targetDishIngredientId?: string | null;
  targetDishComponentId?: string | null;
  targetDishTaskId?: string | null;
  ingredientId?: string | null;
  componentId?: string | null;
  quantity?: number | null;
  unit?: UnitCode | null;
  portionsAffected: number;
}

export interface PrepTaskChoiceLike {
  dishTaskId: string | null;
  resolution: "resolved" | "choice_pending" | "content_missing" | null;
  chosenOption: string | null;
  componentId: string | null;
  ingredientId: string | null;
}

export interface EventDishLike {
  id: string;
  eventId: string;
  dishId: string;
  quantityServings: number;
  overrides: OverrideLike[];
  prepTasks: PrepTaskChoiceLike[];
}

export interface DemandLookups {
  dishes: ReadonlyMap<string, DishLike>;
  components: ReadonlyMap<string, ComponentLike>;
  ingredients: ReadonlyMap<string, IngredientLike>;
  portionSpecs: ReadonlyMap<string, PortionSpecLike>;
  mappings: readonly ItemUnitMappingLike[];
}

export type Ownership = "event_dish" | "batch_allocation" | "batch_surplus";

export interface Contribution {
  sourceKey: string;
  eventId: string;
  eventDishId: string;
  dishId: string;
  ingredientId: string;
  ingredientName: string;
  /** Leaf recipe the ingredient line belongs to; null for the dish's own line. */
  componentId: string | null;
  componentPath: string[];
  /** Quantity in the ingredient's catalog unit when resolved, else as stated. */
  quantity: number;
  unit: UnitCode;
  exactQuantity: number;
  statedUnit: UnitCode;
  quantityBasis: QuantityBasis;
  unitStatus: UnitStatus;
  basisStatus: BasisStatus;
  ownership: Ownership;
  sourceDishIngredientId: string | null;
  sourceDishComponentId: string | null;
  servings: number;
  /** true when the row can enter the finalized purchasing total */
  purchasable: boolean;
}

export interface RecipeNeed {
  sourceKey: string;
  eventDishId: string;
  dishComponentId: string;
  componentId: string;
  componentName: string;
  portionSpecId: string | null;
  needQuantity: number;
  needUnit: UnitCode;
  batchesExact: number | null;
  contentStatus: ContentStatus;
  unitStatus: UnitStatus;
}

export type UnresolvedKind =
  | "unit"
  | "basis"
  | "recipe_content"
  | "choice_pending"
  | "cycle"
  | "missing_reference"
  | "supply_kind";

export interface UnresolvedItem {
  kind: UnresolvedKind;
  eventDishId: string;
  dishId: string;
  refId: string;
  label: string;
  detail: string;
}

export interface EventDishDemand {
  eventDishId: string;
  contributions: Contribution[];
  recipeNeeds: RecipeNeed[];
  unresolved: UnresolvedItem[];
}

interface EffectiveIngredientLine extends DishIngredientLike {
  portions: number;
  overrideId: string | null;
}

interface EffectiveComponentLine extends DishComponentLike {
  portions: number;
  overrideId: string | null;
  /** direct quantity when an override adds a recipe by quantity instead of pieces */
  directQuantity?: number | null;
  directUnit?: UnitCode | null;
}

/**
 * Apply overrides and choice resolution to the dish's requirement set for one
 * event dish. Returns per-line portion counts so a "1 vegan salad" override
 * removes one portion of creamy garlic and adds one portion of oil/vinegar
 * without touching the master dish.
 */
export function effectiveRequirements(eventDish: EventDishLike, dish: DishLike): {
  ingredientLines: EffectiveIngredientLine[];
  componentLines: EffectiveComponentLine[];
  suppressedTaskIds: Set<string>;
  pendingChoices: DishTaskLike[];
} {
  const P = Math.max(0, eventDish.quantityServings);
  const ingredientLines: EffectiveIngredientLine[] = dish.ingredientLines.map((l) => ({ ...l, portions: P, overrideId: null }));
  const componentLines: EffectiveComponentLine[] = dish.componentLines.map((l) => ({ ...l, portions: P, overrideId: null }));
  const suppressedTaskIds = new Set<string>();

  for (const o of eventDish.overrides) {
    const affected = Math.min(P, Math.max(0, o.portionsAffected));
    if (o.kind === "remove" || o.kind === "replace" || o.kind === "adjust") {
      if (o.targetDishIngredientId) {
        const line = ingredientLines.find((l) => l.id === o.targetDishIngredientId);
        if (line) {
          if (o.kind === "adjust" && o.quantity != null) {
            // adjust: the affected portions use the override quantity instead
            line.portions = Math.max(0, line.portions - affected);
            ingredientLines.push({ ...line, id: line.id, quantity: o.quantity, unit: o.unit ?? line.unit, portions: affected, overrideId: o.id });
          } else {
            line.portions = Math.max(0, line.portions - affected);
          }
        }
      }
      if (o.targetDishComponentId) {
        const line = componentLines.find((l) => l.id === o.targetDishComponentId);
        if (line) line.portions = Math.max(0, line.portions - affected);
      }
      if (o.targetDishTaskId) suppressedTaskIds.add(o.targetDishTaskId);
    }
    if (o.kind === "add" || o.kind === "replace") {
      if (o.ingredientId && o.quantity != null && o.unit) {
        ingredientLines.push({
          id: `override:${o.id}`,
          ingredientId: o.ingredientId,
          quantity: o.quantity,
          unit: o.unit,
          wasteFactor: 1,
          quantityBasis: "as_purchased",
          portions: affected,
          overrideId: o.id,
        });
      } else if (o.componentId && o.quantity != null && o.unit) {
        componentLines.push({
          id: `override:${o.id}`,
          componentId: o.componentId,
          yieldQuantity: 1,
          batchMultiplier: 1,
          portions: affected,
          overrideId: o.id,
          directQuantity: o.quantity,
          directUnit: o.unit,
        });
      }
    }
  }

  // Choices: a choice_pending task contributes nothing until picked. A picked
  // "portion" branch keeps the ingredient line; a picked "make" branch keeps
  // the recipe line. Unpicked tasks that point at a line suppress that line.
  const pendingChoices: DishTaskLike[] = [];
  for (const task of dish.tasks) {
    if (task.resolution !== "choice_pending") continue;
    const eventTask = eventDish.prepTasks.find((t) => t.dishTaskId === task.id);
    const chosen = eventTask?.resolution === "resolved" ? eventTask.chosenOption : null;
    if (!chosen) {
      pendingChoices.push(task);
      for (const id of task.materialDishIngredientIds) {
        const line = ingredientLines.find((l) => l.id === id);
        if (line) line.portions = 0;
      }
      for (const id of task.materialDishComponentIds) {
        const line = componentLines.find((l) => l.id === id);
        if (line) line.portions = 0;
      }
      continue;
    }
    // One branch only.
    if (chosen === "portion") {
      for (const id of task.materialDishComponentIds) {
        const line = componentLines.find((l) => l.id === id);
        if (line) line.portions = 0;
      }
    } else if (chosen === "make") {
      for (const id of task.materialDishIngredientIds) {
        const line = ingredientLines.find((l) => l.id === id);
        if (line) line.portions = 0;
      }
    }
  }
  return { ingredientLines, componentLines, suppressedTaskIds, pendingChoices };
}

const contributionKey = (eventDishId: string, path: string[], lineId: string, ingredientId: string) =>
  ["ed", eventDishId, ...path, lineId, ingredientId].join(":");

function expandComponent(
  args: {
    eventDish: EventDishLike;
    dish: DishLike;
    component: ComponentLike;
    batches: number;
    path: string[];
    sourceDishComponentId: string;
    lookups: DemandLookups;
    out: EventDishDemand;
    servings: number;
  },
): void {
  const { component, batches, path, lookups, out, eventDish, dish } = args;
  if (path.includes(component.id)) {
    out.unresolved.push({
      kind: "cycle",
      eventDishId: eventDish.id,
      dishId: dish.id,
      refId: component.id,
      label: component.name,
      detail: `recipe cycle: ${[...path, component.id].join(" -> ")}`,
    });
    return;
  }
  const nextPath = [...path, component.id];
  const status = componentContentStatus(component);
  if (status === "both_missing" || status === "ingredients_missing") {
    out.unresolved.push({
      kind: "recipe_content",
      eventDishId: eventDish.id,
      dishId: dish.id,
      refId: component.id,
      label: component.name,
      detail: status === "both_missing" ? "recipe has no ingredients and no method on file" : "recipe has no ingredients on file",
    });
  } else if (status === "method_missing") {
    out.unresolved.push({
      kind: "recipe_content",
      eventDishId: eventDish.id,
      dishId: dish.id,
      refId: component.id,
      label: component.name,
      detail: "recipe method not on file",
    });
  }
  for (const line of component.ingredientLines) {
    const ingredient = lookups.ingredients.get(line.ingredientId);
    if (!ingredient) {
      out.unresolved.push({ kind: "missing_reference", eventDishId: eventDish.id, dishId: dish.id, refId: line.ingredientId, label: line.ingredientId, detail: "ingredient not found" });
      continue;
    }
    const stated = line.quantity * (line.wasteFactor ?? 1) * batches;
    pushContribution({
      eventDish,
      dish,
      ingredient,
      stated,
      statedUnit: line.unit,
      basis: line.quantityBasis ?? "as_purchased",
      path: nextPath,
      lineId: line.id,
      sourceDishComponentId: args.sourceDishComponentId,
      sourceDishIngredientId: null,
      lookups,
      out,
      servings: args.servings,
    });
  }
  for (const line of component.componentLines) {
    const child = lookups.components.get(line.childComponentId);
    if (!child) {
      out.unresolved.push({ kind: "missing_reference", eventDishId: eventDish.id, dishId: dish.id, refId: line.childComponentId, label: line.childComponentId, detail: "sub-recipe not found" });
      continue;
    }
    const need = line.quantity * (line.wasteFactor ?? 1) * batches;
    const converted = convertQuantity(need, line.unit, child.yieldUnit, lookups.mappings, { itemKind: "component", itemId: child.id });
    if (converted.status !== "resolved" || child.yieldQuantity <= 0) {
      out.unresolved.push({
        kind: "unit",
        eventDishId: eventDish.id,
        dishId: dish.id,
        refId: line.id,
        label: child.name,
        detail: `${need} ${line.unit} of ${child.name} cannot convert to its yield unit ${child.yieldUnit} (${converted.status})`,
      });
      continue;
    }
    expandComponent({ ...args, component: child, batches: converted.quantity / child.yieldQuantity, path: nextPath });
  }
}

function pushContribution(args: {
  eventDish: EventDishLike;
  dish: DishLike;
  ingredient: IngredientLike;
  stated: number;
  statedUnit: UnitCode;
  basis: QuantityBasis;
  path: string[];
  lineId: string;
  sourceDishComponentId: string | null;
  sourceDishIngredientId: string | null;
  lookups: DemandLookups;
  out: EventDishDemand;
  servings: number;
}): void {
  const { ingredient, lookups, out, eventDish, dish } = args;
  const scope = { itemKind: "ingredient" as const, itemId: ingredient.id };
  const basisResult = toPurchaseBasis(args.stated, args.statedUnit, args.basis, lookups.mappings, scope);
  const converted = convertQuantity(basisResult.quantity, args.statedUnit, ingredient.unit, lookups.mappings, scope);
  const purchasable = basisResult.status === "resolved" && converted.status === "resolved";
  const contribution: Contribution = {
    sourceKey: contributionKey(eventDish.id, args.path, args.lineId, ingredient.id),
    eventId: eventDish.eventId,
    eventDishId: eventDish.id,
    dishId: dish.id,
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    componentId: args.path.length ? args.path[args.path.length - 1] : null,
    componentPath: args.path,
    quantity: roundTo(purchasable ? converted.quantity : args.stated),
    unit: purchasable ? converted.unit : args.statedUnit,
    exactQuantity: roundTo(args.stated),
    statedUnit: args.statedUnit,
    quantityBasis: args.basis,
    unitStatus: converted.status,
    basisStatus: basisResult.status,
    ownership: "event_dish",
    sourceDishIngredientId: args.sourceDishIngredientId,
    sourceDishComponentId: args.sourceDishComponentId,
    servings: args.servings,
    purchasable,
  };
  out.contributions.push(contribution);
  if (converted.status !== "resolved") {
    out.unresolved.push({
      kind: "unit",
      eventDishId: eventDish.id,
      dishId: dish.id,
      refId: contribution.sourceKey,
      label: ingredient.name,
      detail: `${contribution.exactQuantity} ${args.statedUnit} cannot convert to catalog unit ${ingredient.unit} (${converted.status})`,
    });
  }
  if (basisResult.status !== "resolved") {
    out.unresolved.push({
      kind: "basis",
      eventDishId: eventDish.id,
      dishId: dish.id,
      refId: contribution.sourceKey,
      label: ingredient.name,
      detail:
        basisResult.status === "yield_not_confirmed"
          ? `${contribution.exactQuantity} ${args.statedUnit} stated as cooked weight; no confirmed yield`
          : `${contribution.exactQuantity} ${args.statedUnit} has no stated basis`,
    });
  }
}

/** Expand one event dish into contributions, recipe needs and unresolved items. */
export function expandEventDish(eventDish: EventDishLike, lookups: DemandLookups): EventDishDemand {
  const out: EventDishDemand = { eventDishId: eventDish.id, contributions: [], recipeNeeds: [], unresolved: [] };
  const dish = lookups.dishes.get(eventDish.dishId);
  if (!dish) {
    out.unresolved.push({ kind: "missing_reference", eventDishId: eventDish.id, dishId: eventDish.dishId, refId: eventDish.dishId, label: eventDish.dishId, detail: "dish not found" });
    return out;
  }
  if (dish.kind && dish.kind !== "food") {
    // Supplies, services and packages never enter food purchasing.
    out.unresolved.push({ kind: "supply_kind", eventDishId: eventDish.id, dishId: dish.id, refId: dish.id, label: dish.name, detail: `${dish.kind} dish: no food demand` });
    return out;
  }
  const { ingredientLines, componentLines, pendingChoices } = effectiveRequirements(eventDish, dish);
  for (const task of pendingChoices) {
    out.unresolved.push({
      kind: "choice_pending",
      eventDishId: eventDish.id,
      dishId: dish.id,
      refId: task.id,
      label: task.name,
      detail: `choose: ${(task.choiceOptions ?? []).join(" / ") || "make / portion"}`,
    });
  }
  for (const line of ingredientLines) {
    if (line.portions <= 0) continue;
    const ingredient = lookups.ingredients.get(line.ingredientId);
    if (!ingredient) {
      out.unresolved.push({ kind: "missing_reference", eventDishId: eventDish.id, dishId: dish.id, refId: line.ingredientId, label: line.ingredientId, detail: "ingredient not found" });
      continue;
    }
    pushContribution({
      eventDish,
      dish,
      ingredient,
      stated: line.quantity * (line.wasteFactor ?? 1) * line.portions,
      statedUnit: line.unit,
      basis: line.quantityBasis ?? "unknown",
      path: [],
      lineId: line.overrideId ? `${line.id}@${line.overrideId}` : line.id,
      sourceDishComponentId: null,
      sourceDishIngredientId: line.id.startsWith("override:") ? null : line.id,
      lookups,
      out,
      servings: line.portions,
    });
  }
  for (const line of componentLines) {
    if (line.portions <= 0) continue;
    const component = lookups.components.get(line.componentId);
    if (!component) {
      out.unresolved.push({ kind: "missing_reference", eventDishId: eventDish.id, dishId: dish.id, refId: line.componentId, label: line.componentId, detail: "recipe not found" });
      continue;
    }
    let batches: number | null = null;
    let needQuantity = 0;
    let needUnit: UnitCode = component.yieldUnit;
    let unitStatus: UnitStatus = "resolved";
    const spec = line.portionSpecId ? lookups.portionSpecs.get(line.portionSpecId) : null;
    if (line.directQuantity != null && line.directUnit) {
      needQuantity = line.directQuantity * line.portions;
      needUnit = line.directUnit;
      const converted = convertQuantity(needQuantity, needUnit, component.yieldUnit, lookups.mappings, { itemKind: "component", itemId: component.id });
      unitStatus = converted.status;
      batches = converted.status === "resolved" && component.yieldQuantity > 0 ? converted.quantity / component.yieldQuantity : null;
    } else if (spec && line.pieceCount != null) {
      needQuantity = line.pieceCount * line.portions;
      needUnit = "piece";
      batches = spec.piecesPerBatch && spec.piecesPerBatch > 0 ? needQuantity / spec.piecesPerBatch : null;
      if (batches == null) unitStatus = "unresolved_no_mapping";
    } else {
      // Attachment snapshot: batchMultiplier batches serve yieldQuantity portions.
      needQuantity = line.yieldQuantity > 0 ? (line.portions / line.yieldQuantity) * line.batchMultiplier * component.yieldQuantity : 0;
      batches = line.yieldQuantity > 0 ? (line.portions / line.yieldQuantity) * line.batchMultiplier : null;
      if (batches == null) unitStatus = "unresolved_no_mapping";
    }
    const contentStatus = componentContentStatus(component);
    out.recipeNeeds.push({
      sourceKey: ["rn", eventDish.id, line.id, component.id].join(":"),
      eventDishId: eventDish.id,
      dishComponentId: line.id,
      componentId: component.id,
      componentName: component.name,
      portionSpecId: spec?.id ?? null,
      needQuantity: roundTo(needQuantity),
      needUnit,
      batchesExact: batches == null ? null : roundTo(batches, 6),
      contentStatus,
      unitStatus,
    });
    if (batches == null) {
      out.unresolved.push({ kind: "unit", eventDishId: eventDish.id, dishId: dish.id, refId: line.id, label: component.name, detail: `cannot express ${needQuantity} ${needUnit} of ${component.name} in batches (${unitStatus})` });
      continue;
    }
    expandComponent({ eventDish, dish, component, batches, path: [], sourceDishComponentId: line.id.startsWith("override:") ? line.id : line.id, lookups, out, servings: line.portions });
  }
  return out;
}

export interface ExistingContributionRow {
  id: string;
  sourceKey: string | null;
  eventDishId: string;
  componentId: string | null;
  ingredientId: string;
  unit: UnitCode;
  quantity: number;
  deletedAt: number | null;
}

export interface ReconcilePlan {
  create: Contribution[];
  update: { id: string; next: Contribution }[];
  supersede: { id: string; sourceKey: string | null; replacedBy: string | null }[];
  unchanged: string[];
}

/**
 * Idempotent replacement: rows the engine owns for this event dish (any row
 * with a sourceKey under the event dish prefix, plus legacy reaction rows
 * that match on leaf component + ingredient + unit) are updated in place when
 * the key matches, superseded when it does not, and created when new.
 * Replaying the same plan twice yields zero creates and zero supersedes.
 */
export function reconcileContributions(existing: readonly ExistingContributionRow[], next: readonly Contribution[], eventDishId: string): ReconcilePlan {
  const live = existing.filter((r) => r.eventDishId === eventDishId && r.deletedAt == null);
  const plan: ReconcilePlan = { create: [], update: [], supersede: [], unchanged: [] };
  const byKey = new Map(live.filter((r) => r.sourceKey).map((r) => [r.sourceKey as string, r]));
  const legacy = live.filter((r) => !r.sourceKey);
  const claimed = new Set<string>();
  for (const c of next) {
    const match = byKey.get(c.sourceKey);
    if (match) {
      claimed.add(match.id);
      if (roundTo(match.quantity) === roundTo(c.quantity) && match.unit === c.unit) plan.unchanged.push(match.id);
      else plan.update.push({ id: match.id, next: c });
      continue;
    }
    const adopt = legacy.find((r) => !claimed.has(r.id) && r.componentId === c.componentId && r.ingredientId === c.ingredientId && r.unit === c.unit);
    if (adopt) {
      claimed.add(adopt.id);
      plan.update.push({ id: adopt.id, next: c });
      continue;
    }
    plan.create.push(c);
  }
  for (const row of live) {
    if (claimed.has(row.id)) continue;
    plan.supersede.push({ id: row.id, sourceKey: row.sourceKey, replacedBy: null });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Shared batches

export type RoundingScope = "none" | "dish_allocation" | "event_total" | "production_group" | "purchase_pack";
export type RoundingRule = "none" | "whole_up" | "whole_nearest" | "increment";

export interface BatchAllocationInput {
  eventId: string;
  eventDishId: string;
  quantity: number;
  unit: UnitCode;
}

export interface BatchAllocationPlan {
  eventId: string | null;
  eventDishId: string | null;
  allocatedQuantity: number;
  unit: UnitCode;
  formulaShare: number;
  isSurplus: boolean;
}

export interface BatchPlan {
  componentId: string;
  yieldUnit: UnitCode;
  plannedExact: number;
  plannedRounded: number;
  surplusQuantity: number;
  batchesExact: number;
  batchesRounded: number;
  roundingScope: RoundingScope;
  allocations: BatchAllocationPlan[];
  /** ingredient contributions for the whole batch, split by allocation share */
  contributions: BatchContribution[];
  unresolved: string[];
}

export interface BatchContribution {
  sourceKey: string;
  allocationIndex: number;
  ownership: Ownership;
  eventId: string | null;
  eventDishId: string | null;
  ingredientId: string;
  ingredientName: string;
  componentId: string;
  componentPath: string[];
  quantity: number;
  unit: UnitCode;
  unitStatus: UnitStatus;
  basisStatus: BasisStatus;
  purchasable: boolean;
}

export const applyRounding = (value: number, rule: RoundingRule, increment = 1): number => {
  if (rule === "none" || value <= 0) return value;
  if (rule === "whole_up") return Math.ceil(value - 1e-9);
  if (rule === "whole_nearest") return Math.max(1, Math.round(value));
  const inc = increment > 0 ? increment : 1;
  return Math.ceil(value / inc - 1e-9) * inc;
};

/**
 * Plan one shared batch of a recipe for several event dishes. Allocations sum
 * to plannedExact; the surplus row closes the ledger to plannedRounded. Each
 * allocation owns formulaShare = allocated / yield of the recipe formula, so
 * batch ingredient contributions are split by ownership and never assigned
 * whole to more than one event.
 */
export function planSharedBatch(args: {
  batchId: string;
  component: ComponentLike;
  allocations: readonly BatchAllocationInput[];
  lookups: DemandLookups;
  rounding: { scope: RoundingScope; rule: RoundingRule; increment?: number };
}): BatchPlan {
  const { component, lookups } = args;
  const unresolved: string[] = [];
  const inYield: { input: BatchAllocationInput; quantity: number }[] = [];
  for (const a of args.allocations) {
    const converted = convertQuantity(a.quantity, a.unit, component.yieldUnit, lookups.mappings, { itemKind: "component", itemId: component.id });
    if (converted.status !== "resolved") {
      unresolved.push(`${a.eventDishId}: ${a.quantity} ${a.unit} cannot convert to ${component.yieldUnit} (${converted.status})`);
      continue;
    }
    inYield.push({ input: a, quantity: converted.quantity });
  }
  const plannedExact = roundTo(inYield.reduce((s, a) => s + a.quantity, 0), 6);
  const batchesExact = component.yieldQuantity > 0 ? plannedExact / component.yieldQuantity : 0;
  const batchesRounded = args.rounding.scope === "production_group" ? applyRounding(batchesExact, args.rounding.rule, args.rounding.increment) : batchesExact;
  const plannedRounded = roundTo(batchesRounded * component.yieldQuantity, 6);
  const surplusQuantity = roundTo(plannedRounded - plannedExact, 6);
  const allocations: BatchAllocationPlan[] = inYield.map((a) => ({
    eventId: a.input.eventId,
    eventDishId: a.input.eventDishId,
    allocatedQuantity: roundTo(a.quantity, 6),
    unit: component.yieldUnit,
    formulaShare: component.yieldQuantity > 0 ? roundTo(a.quantity / component.yieldQuantity, 6) : 0,
    isSurplus: false,
  }));
  if (surplusQuantity > 1e-9) {
    allocations.push({
      eventId: null,
      eventDishId: null,
      allocatedQuantity: surplusQuantity,
      unit: component.yieldUnit,
      formulaShare: component.yieldQuantity > 0 ? roundTo(surplusQuantity / component.yieldQuantity, 6) : 0,
      isSurplus: true,
    });
  }
  const contributions: BatchContribution[] = [];
  const flatten = (comp: ComponentLike, batches: number, path: string[]): void => {
    if (path.includes(comp.id)) {
      unresolved.push(`recipe cycle: ${[...path, comp.id].join(" -> ")}`);
      return;
    }
    const nextPath = [...path, comp.id];
    for (const line of comp.ingredientLines) {
      const ingredient = lookups.ingredients.get(line.ingredientId);
      if (!ingredient) {
        unresolved.push(`ingredient ${line.ingredientId} not found`);
        continue;
      }
      allocations.forEach((alloc, index) => {
        const stated = line.quantity * (line.wasteFactor ?? 1) * batches * alloc.formulaShare;
        const scope = { itemKind: "ingredient" as const, itemId: ingredient.id };
        const basis = toPurchaseBasis(stated, line.unit, line.quantityBasis ?? "as_purchased", lookups.mappings, scope);
        const converted = convertQuantity(basis.quantity, line.unit, ingredient.unit, lookups.mappings, scope);
        const purchasable = basis.status === "resolved" && converted.status === "resolved";
        contributions.push({
          sourceKey: ["pb", args.batchId, alloc.isSurplus ? "surplus" : (alloc.eventDishId ?? "none"), ...nextPath, line.id, ingredient.id].join(":"),
          allocationIndex: index,
          ownership: alloc.isSurplus ? "batch_surplus" : "batch_allocation",
          eventId: alloc.eventId,
          eventDishId: alloc.eventDishId,
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          componentId: comp.id,
          componentPath: nextPath,
          quantity: roundTo(purchasable ? converted.quantity : stated, 6),
          unit: purchasable ? converted.unit : line.unit,
          unitStatus: converted.status,
          basisStatus: basis.status,
          purchasable,
        });
        if (!purchasable) unresolved.push(`${ingredient.name}: ${stated} ${line.unit} (${converted.status !== "resolved" ? converted.status : basis.status})`);
      });
    }
    for (const line of comp.componentLines) {
      const child = lookups.components.get(line.childComponentId);
      if (!child) {
        unresolved.push(`sub-recipe ${line.childComponentId} not found`);
        continue;
      }
      const need = line.quantity * (line.wasteFactor ?? 1) * batches;
      const converted = convertQuantity(need, line.unit, child.yieldUnit, lookups.mappings, { itemKind: "component", itemId: child.id });
      if (converted.status !== "resolved" || child.yieldQuantity <= 0) {
        unresolved.push(`${child.name}: ${need} ${line.unit} cannot convert to ${child.yieldUnit}`);
        continue;
      }
      flatten(child, converted.quantity / child.yieldQuantity, nextPath);
    }
  };
  // Ingredient lines are computed once for the WHOLE batch (batchesRounded)
  // and split by share; the shares sum to 1 across allocations + surplus.
  const totalShare = allocations.reduce((s, a) => s + a.formulaShare, 0);
  if (Math.abs(totalShare - batchesRounded) > 1e-6) unresolved.push(`shares ${totalShare} do not sum to batches ${batchesRounded}`);
  flatten(component, 1, []);
  return {
    componentId: component.id,
    yieldUnit: component.yieldUnit,
    plannedExact,
    plannedRounded,
    surplusQuantity,
    batchesExact: roundTo(batchesExact, 6),
    batchesRounded: roundTo(batchesRounded, 6),
    roundingScope: args.rounding.scope,
    allocations,
    contributions,
    unresolved: [...new Set(unresolved)],
  };
}

export interface PurchasableRow {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: UnitCode;
  purchasable: boolean;
  exactQuantity?: number;
  statedUnit?: UnitCode;
}

/** Sum purchasable contributions per ingredient; unresolved rows are listed apart. */
export function purchasingTotals(contributions: readonly PurchasableRow[]) {
  const totals = new Map<string, { ingredientId: string; ingredientName: string; quantity: number; unit: UnitCode }>();
  const unresolved: { ingredientId: string; ingredientName: string; quantity: number; unit: UnitCode }[] = [];
  for (const c of contributions) {
    if (!c.purchasable) {
      unresolved.push({ ingredientId: c.ingredientId, ingredientName: c.ingredientName, quantity: c.exactQuantity ?? c.quantity, unit: c.statedUnit ?? c.unit });
      continue;
    }
    const key = `${c.ingredientId}|${c.unit}`;
    const row = totals.get(key) ?? { ingredientId: c.ingredientId, ingredientName: c.ingredientName, quantity: 0, unit: c.unit };
    row.quantity = roundTo(row.quantity + c.quantity, 6);
    totals.set(key, row);
  }
  return { totals: [...totals.values()], unresolved, complete: unresolved.length === 0 };
}
