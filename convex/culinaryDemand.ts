// Revision-2 culinary model (2026-09-14) — authored seam for the ONE demand
// calculation, recipe content/cost reports, shared batches and nested lines.
//
// Reads go through tenant-scoped indexes; writes go through the generated
// Manifest commands (never raw inserts), so guards, policies and the
// IngredientDemand sync reaction all still apply.

import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  getAuthContext,
  requireTenant,
  type AppAuthContext,
} from "./lib/authContext";
import {
  componentBatchCost,
  componentContentStatus,
  type ComponentLike,
  type CostReport,
  type IngredientLike,
} from "./lib/culinaryModel/costing";
import {
  expandEventDish,
  planSharedBatch,
  purchasingTotals,
  reconcileContributions,
  type Contribution,
  type DemandLookups,
  type DishLike,
  type EventDishDemand,
  type EventDishLike,
  type ExistingContributionRow,
  type PortionSpecLike,
  type RoundingRule,
  type RoundingScope,
  type UnresolvedItem,
} from "./lib/culinaryModel/demand";
import {
  eventFoodCost,
  type EventFoodCost,
  type EventFoodCostInput,
} from "./lib/culinaryModel/eventFoodCost";
import { observationsByIngredient } from "./lib/culinaryModel/pricing";
import { editionInUse } from "./lib/culinaryModel/recipeEdition";
import { withUnresolvedText } from "./lib/culinaryModel/unresolvedText";
import {
  convertQuantity,
  isUnitCode,
  type ItemUnitMappingLike,
  type QuantityBasis,
  type UnitCode,
} from "./lib/culinaryModel/units";
import {
  classifyDemandChange,
  demandPreviewFingerprint,
  type DemandChangeKind,
  type DemandChangeLine,
} from "./lib/demandChangePreview";

type Ctx = QueryCtx | MutationCtx;

const live = <T extends { deletedAt?: number | null }>(rows: T[]) =>
  rows.filter((r) => r.deletedAt == null);

const unitOf = (
  value: string | null | undefined,
  fallback: UnitCode = "each",
): UnitCode => (isUnitCode(value) ? value : fallback);

const basisOf = (value: string | null | undefined): QuantityBasis | null =>
  value === "as_purchased" ||
  value === "as_produced" ||
  value === "raw" ||
  value === "cooked" ||
  value === "unknown"
    ? value
    : null;

async function byTenant<
  T extends
    | "dishes"
    | "components"
    | "componentIngredients"
    | "componentComponents"
    | "componentPortionSpecs"
    | "componentSteps"
    | "componentSnapshots"
    | "dishIngredients"
    | "dishComponents"
    | "dishTasks"
    | "dishTaskMaterials"
    | "ingredients"
    | "itemUnitMappings"
    | "ingredientPriceObservations"
    | "wasteRecords"
    | "eventCloseouts"
    | "invoices"
    | "eventDishLineOverrides"
    | "prepTasks"
    | "eventDishes"
    | "eventIngredientContributions"
    | "productionBatchAllocations"
    | "productionBatches"
    | "events"
    | "ingredientDemands"
    | "purchaseNeeds",
>(ctx: Ctx, table: T, tenantId: string): Promise<Doc<T>[]> {
  // Every table here carries the TenantScoped mixin and its by_tenantId index;
  // typing the builder against one concrete table keeps the index call typed
  // while the runtime uses the real table name.
  const rows = await ctx.db
    .query(table as "dishes")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  return live(rows as unknown as (Doc<T> & { deletedAt?: number | null })[]);
}

/**
 * One event's rows of an event-scoped table, read through its by_eventId
 * index (live rows of this company only). A whole-company read of these
 * tables passed the 16 MB read limit on the live server (2026-10-08).
 */
async function byEvent<T extends "eventDishes" | "productionBatchAllocations">(
  ctx: Ctx,
  table: T,
  tenantId: string,
  eventId: Id<"events">,
) {
  const rows = await ctx.db
    .query(table as "eventDishes")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  return live(
    rows as unknown as (Doc<T> & { deletedAt?: number | null })[],
  ).filter((row) => row.tenantId === tenantId);
}

interface Catalog {
  lookups: DemandLookups;
  dishes: Doc<"dishes">[];
  components: Doc<"components">[];
  ingredients: Doc<"ingredients">[];
  dishTasks: Doc<"dishTasks">[];
}

/** Load the tenant's catalog once, shaped for the pure engine. */
async function loadCatalog(ctx: Ctx, tenantId: string): Promise<Catalog> {
  const [
    dishes,
    components,
    componentIngredients,
    componentComponents,
    portionSpecs,
    dishIngredients,
    dishComponents,
    dishTasks,
    dishTaskMaterials,
    ingredients,
    mappings,
    priceRows,
  ] = await Promise.all([
    byTenant(ctx, "dishes", tenantId),
    byTenant(ctx, "components", tenantId),
    byTenant(ctx, "componentIngredients", tenantId),
    byTenant(ctx, "componentComponents", tenantId),
    byTenant(ctx, "componentPortionSpecs", tenantId),
    byTenant(ctx, "dishIngredients", tenantId),
    byTenant(ctx, "dishComponents", tenantId),
    byTenant(ctx, "dishTasks", tenantId),
    byTenant(ctx, "dishTaskMaterials", tenantId),
    byTenant(ctx, "ingredients", tenantId),
    byTenant(ctx, "itemUnitMappings", tenantId),
    byTenant(ctx, "ingredientPriceObservations", tenantId),
  ]);
  const pricesByIngredient = observationsByIngredient(
    priceRows.map((o) => ({
      id: String(o._id),
      ingredientId: String(o.ingredientId),
      vendorId: o.vendorId ? String(o.vendorId) : null,
      vendorOrderId: o.vendorOrderId ? String(o.vendorOrderId) : null,
      unit: unitOf(o.unit),
      unitPrice: Number(o.unitPrice),
      observedAt: typeof o.observedAt === "number" ? o.observedAt : null,
    })),
  );
  const stepCounts = new Map<string, number>();
  const steps = await byTenant(ctx, "componentSteps", tenantId);
  for (const step of steps) {
    if (step.addedAt == null) continue;
    stepCounts.set(
      String(step.componentId),
      (stepCounts.get(String(step.componentId)) ?? 0) + 1,
    );
  }
  // A recipe taken back to draft keeps feeding events its last published
  // edition until the draft is published (recipeEdition.ts).
  const savedByRecipe = new Map<string, Doc<"componentSnapshots">[]>();
  for (const row of await byTenant(ctx, "componentSnapshots", tenantId)) {
    const list = savedByRecipe.get(String(row.componentId)) ?? [];
    list.push(row);
    savedByRecipe.set(String(row.componentId), list);
  }
  const componentMap = new Map<string, ComponentLike>();
  for (const c of components) {
    const edition = editionInUse(
      { status: String(c.status), versionNumber: Number(c.versionNumber) },
      (savedByRecipe.get(String(c._id)) ?? []).map((row) => ({
        versionNumber: Number(row.versionNumber),
        snapshot: row.snapshot,
      })),
    );
    if (edition) {
      componentMap.set(String(c._id), {
        id: String(c._id),
        name: c.name,
        yieldQuantity: Number(edition.yieldQuantity),
        yieldUnit: unitOf(edition.yieldUnit, "portion"),
        instructions: edition.instructions || null,
        stepCount: stepCounts.get(String(c._id)) ?? 0,
        editionVersion: edition.versionNumber,
        ingredientLines: edition.lines.map((l) => ({
          id: l.id,
          ingredientId: l.ingredientId,
          quantity: Number(l.quantity),
          unit: unitOf(l.unit),
          wasteFactor: l.wasteFactor ?? 1,
          quantityBasis: basisOf(l.quantityBasis),
        })),
        componentLines: edition.componentLines.map((l) => ({
          id: l.id,
          childComponentId: l.childComponentId,
          quantity: Number(l.quantity),
          unit: unitOf(l.unit),
          wasteFactor: l.wasteFactor ?? 1,
          quantityBasis: basisOf(l.quantityBasis),
        })),
      });
      continue;
    }
    componentMap.set(String(c._id), {
      id: String(c._id),
      name: c.name,
      yieldQuantity: Number(c.yieldQuantity ?? 0),
      yieldUnit: unitOf(c.yieldUnit, "portion"),
      instructions: c.instructions ?? null,
      editionVersion: Number(c.versionNumber),
      stepCount: stepCounts.get(String(c._id)) ?? 0,
      ingredientLines: componentIngredients
        .filter(
          (l) => String(l.componentId) === String(c._id) && l.addedAt != null,
        )
        .map((l) => ({
          id: String(l._id),
          ingredientId: String(l.ingredientId),
          quantity: Number(l.quantity),
          unit: unitOf(l.unit),
          wasteFactor: l.wasteFactor ?? 1,
          quantityBasis: basisOf(l.quantityBasis),
        })),
      componentLines: componentComponents
        .filter(
          (l) => String(l.componentId) === String(c._id) && l.addedAt != null,
        )
        .map((l) => ({
          id: String(l._id),
          childComponentId: String(l.childComponentId),
          quantity: Number(l.quantity),
          unit: unitOf(l.unit),
          wasteFactor: l.wasteFactor ?? 1,
          quantityBasis: basisOf(l.quantityBasis),
        })),
    });
  }
  const ingredientMap = new Map<string, IngredientLike>(
    ingredients.map((i) => [
      String(i._id),
      {
        id: String(i._id),
        name: i.name,
        unit: unitOf(i.unit),
        costPerUnit: i.costPerUnit == null ? null : Number(i.costPerUnit),
        observations: pricesByIngredient.get(String(i._id)) ?? [],
      },
    ]),
  );
  const specMap = new Map<string, PortionSpecLike>(
    portionSpecs
      .filter((s) => s.definedAt != null)
      .map((s) => [
        String(s._id),
        {
          id: String(s._id),
          componentId: String(s.componentId),
          name: s.name,
          pieceQuantity: Number(s.pieceQuantity),
          pieceUnit: unitOf(s.pieceUnit, "ounce"),
          piecesPerBatch:
            s.piecesPerBatch == null ? null : Number(s.piecesPerBatch),
        },
      ]),
  );
  const materialsByTask = new Map<string, Doc<"dishTaskMaterials">[]>();
  for (const m of dishTaskMaterials) {
    if (m.linkedAt == null) continue;
    const list = materialsByTask.get(String(m.dishTaskId)) ?? [];
    list.push(m);
    materialsByTask.set(String(m.dishTaskId), list);
  }
  const dishMap = new Map<string, DishLike>();
  for (const d of dishes) {
    const kind =
      d.kind === "supply" || d.kind === "service" || d.kind === "package"
        ? d.kind
        : "food";
    dishMap.set(String(d._id), {
      id: String(d._id),
      name: d.name,
      kind,
      ingredientLines: dishIngredients
        .filter((l) => String(l.dishId) === String(d._id) && l.addedAt != null)
        .map((l) => ({
          id: String(l._id),
          ingredientId: String(l.ingredientId),
          quantity: Number(l.quantity),
          unit: unitOf(l.unit),
          wasteFactor: l.wasteFactor ?? 1,
          quantityBasis: basisOf(l.quantityBasis),
        })),
      componentLines: dishComponents
        .filter(
          (l) => String(l.dishId) === String(d._id) && l.attachedAt != null,
        )
        .map((l) => ({
          id: String(l._id),
          componentId: String(l.componentId),
          yieldQuantity: Number(l.yieldQuantity ?? 1),
          batchMultiplier: Number(l.batchMultiplier ?? 1),
          portionSpecId: l.portionSpecId ? String(l.portionSpecId) : null,
          pieceCount: l.pieceCount == null ? null : Number(l.pieceCount),
          quantityBasis: basisOf(l.quantityBasis),
        })),
      tasks: dishTasks
        .filter(
          (t) => String(t.dishId) === String(d._id) && t.status === "active",
        )
        .map((t) => {
          const mats = materialsByTask.get(String(t._id)) ?? [];
          return {
            id: String(t._id),
            name: t.name,
            componentId: t.componentId ? String(t.componentId) : null,
            ingredientId: t.ingredientId ? String(t.ingredientId) : null,
            resolution:
              t.resolution === "choice_pending" ||
              t.resolution === "content_missing" ||
              t.resolution === "resolved"
                ? t.resolution
                : null,
            choiceOptions: t.choiceOptions
              ? t.choiceOptions.filter(
                  (o): o is string => typeof o === "string",
                )
              : null,
            materialDishIngredientIds: mats
              .filter((m) => m.dishIngredientId)
              .map((m) => String(m.dishIngredientId)),
            materialDishComponentIds: mats
              .filter((m) => m.dishComponentId)
              .map((m) => String(m.dishComponentId)),
          };
        }),
    });
  }
  const mappingRows: ItemUnitMappingLike[] = mappings
    .filter((m) => m.recordedAt != null)
    .map((m) => ({
      ingredientId: m.ingredientId ? String(m.ingredientId) : null,
      componentId: m.componentId ? String(m.componentId) : null,
      kind: m.kind,
      unit: unitOf(m.unit),
      equalsQuantity: Number(m.equalsQuantity),
      equalsUnit: unitOf(m.equalsUnit),
      fromBasis: basisOf(m.fromBasis),
      toBasis: basisOf(m.toBasis),
    }));
  return {
    lookups: {
      dishes: dishMap,
      components: componentMap,
      ingredients: ingredientMap,
      portionSpecs: specMap,
      mappings: mappingRows,
    },
    dishes,
    components,
    ingredients,
    dishTasks,
  };
}

async function loadEventDishes(
  ctx: Ctx,
  tenantId: string,
  eventId: Id<"events">,
  proposedHeadcount?: number,
): Promise<EventDishLike[]> {
  const previousHeadcount =
    proposedHeadcount != null
      ? Number((await ctx.db.get(eventId))?.expectedHeadcount ?? 0)
      : 0;
  // Mirrors EventDish.syncHeadcount: legacy rows (followsEventHeadcount
  // unset) follow only when they still match the previous headcount.
  const follows = (ed: Doc<"eventDishes">) =>
    ed.followsEventHeadcount != null
      ? ed.followsEventHeadcount
      : Number(ed.quantityServings ?? 0) === previousHeadcount &&
        (ed.headcountOverride == null || ed.headcountOverride === 0);
  const eventDishes = await byEvent(ctx, "eventDishes", tenantId, eventId);
  // Changes and prep tasks are matched to their event dish below, so read
  // them by event dish: exactly the rows that match, nothing else.
  const perDish = await Promise.all(
    eventDishes.map(async (ed) => {
      const [dishOverrides, dishTasks] = await Promise.all([
        ctx.db
          .query("eventDishLineOverrides")
          .withIndex("by_eventDishId", (q) => q.eq("eventDishId", ed._id))
          .collect(),
        ctx.db
          .query("prepTasks")
          .withIndex("by_eventDishId", (q) => q.eq("eventDishId", ed._id))
          .collect(),
      ]);
      return { dishOverrides, dishTasks };
    }),
  );
  const overrides = live(perDish.flatMap((row) => row.dishOverrides)).filter(
    (row) => row.tenantId === tenantId,
  );
  const prepTasks = live(perDish.flatMap((row) => row.dishTasks)).filter(
    (row) => row.tenantId === tenantId,
  );
  return eventDishes
    .filter(
      (ed) =>
        String(ed.eventId) === String(eventId) &&
        ed.addedAt != null &&
        ed.removedAt == null,
    )
    .map((ed) => ({
      id: String(ed._id),
      eventId: String(ed.eventId),
      dishId: String(ed.dishId),
      quantityServings:
        proposedHeadcount != null && follows(ed)
          ? proposedHeadcount
          : Number(ed.quantityServings ?? 0),
      overrides: overrides
        .filter(
          (o) =>
            String(o.eventDishId) === String(ed._id) &&
            o.appliedAt != null &&
            o.revokedAt == null,
        )
        .map((o) => ({
          id: String(o._id),
          kind: o.kind,
          targetDishIngredientId: o.targetDishIngredientId
            ? String(o.targetDishIngredientId)
            : null,
          targetDishComponentId: o.targetDishComponentId
            ? String(o.targetDishComponentId)
            : null,
          targetDishTaskId: o.targetDishTaskId
            ? String(o.targetDishTaskId)
            : null,
          ingredientId: o.ingredientId ? String(o.ingredientId) : null,
          componentId: o.componentId ? String(o.componentId) : null,
          quantity: o.quantity == null ? null : Number(o.quantity),
          unit: o.unit ? unitOf(o.unit) : null,
          portionsAffected: Number(o.portionsAffected ?? 0),
        })),
      prepTasks: prepTasks
        .filter(
          (t) =>
            String(t.eventDishId) === String(ed._id) &&
            t.status !== "cancelled",
        )
        .map((t) => ({
          dishTaskId: t.dishTaskId ? String(t.dishTaskId) : null,
          resolution:
            t.resolution === "choice_pending" ||
            t.resolution === "content_missing" ||
            t.resolution === "resolved"
              ? t.resolution
              : null,
          chosenOption: t.chosenOption ?? null,
          componentId: t.componentId ? String(t.componentId) : null,
          ingredientId: t.ingredientId ? String(t.ingredientId) : null,
        })),
    }));
}

async function requireEvent(
  ctx: Ctx,
  tenantId: string,
  eventId: Id<"events">,
): Promise<Doc<"events">> {
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || event.deletedAt != null)
    throw new Error("Event not found");
  return event;
}

/**
 * Mirrors the manifest read policies these reports aggregate: Ingredient
 * (kitchenAccess), EventIngredientContribution (inventoryAccess |
 * manageAccess). Ordinary staff roles do not get raw quantities.
 */
function canReadCulinaryReports(role: string): boolean {
  return (
    role === "kitchen_staff" ||
    role === "kitchen_lead" ||
    role === "inventory_staff" ||
    role === "procurement_staff" ||
    role === "manager" ||
    role.endsWith("_manager") ||
    role === "admin" ||
    role === "owner" ||
    role === "system"
  );
}

export function requireCulinaryReader(auth: AppAuthContext): string {
  const tenantId = requireTenant(auth);
  if (!canReadCulinaryReports(auth.role)) {
    throw new Error(
      "Kitchen, inventory and managers may read culinary demand reports",
    );
  }
  return tenantId;
}

export interface EventDemandReview {
  eventId: string;
  eventDishes: (EventDishDemand & {
    dishName: string;
    quantityServings: number;
  })[];
  purchasing: ReturnType<typeof purchasingTotals>;
  unresolvedCount: number;
  batchSatisfied: {
    eventDishId: string;
    componentId: string;
    productionBatchId: string;
  }[];
  /** Allocations whose batch is still live; batch-owned rows outside this set are stale. */
  activeAllocationIds: string[];
}

async function reviewEvent(
  ctx: Ctx,
  tenantId: string,
  eventId: Id<"events">,
  proposedHeadcount?: number,
): Promise<EventDemandReview> {
  await requireEvent(ctx, tenantId, eventId);
  const catalog = await loadCatalog(ctx, tenantId);
  const eventDishes = await loadEventDishes(
    ctx,
    tenantId,
    eventId,
    proposedHeadcount,
  );
  const allocations = (
    await byEvent(ctx, "productionBatchAllocations", tenantId, eventId)
  ).filter(
    (a) =>
      a.allocatedAt != null &&
      String(a.eventId ?? "") === String(eventId) &&
      a.status !== "released",
  );
  const batches = await byTenant(ctx, "productionBatches", tenantId);
  const batchById = new Map(batches.map((b) => [String(b._id), b]));
  // Every live allocation of a live batch keeps its rows, including the
  // surplus allocation, which belongs to no event but is purchased on one.
  const activeAllocationIds = (
    await byTenant(ctx, "productionBatchAllocations", tenantId)
  )
    .filter((a) => {
      const batch = batchById.get(String(a.productionBatchId));
      return (
        a.allocatedAt != null &&
        a.status !== "released" &&
        !!batch &&
        batch.status !== "cancelled"
      );
    })
    .map((a) => String(a._id));
  const batchSatisfied: EventDemandReview["batchSatisfied"] = [];
  for (const a of allocations) {
    const batch = batchById.get(String(a.productionBatchId));
    if (!batch || batch.status === "cancelled" || !a.eventDishId) continue;
    batchSatisfied.push({
      eventDishId: String(a.eventDishId),
      componentId: String(batch.componentId),
      productionBatchId: String(batch._id),
    });
  }
  const results = eventDishes.map((ed) => {
    const demand = expandEventDish(ed, catalog.lookups);
    // Recipe needs satisfied by a planned shared batch leave the per-event path:
    // the batch writes its own ingredient shares once.
    const satisfied = new Set(
      batchSatisfied
        .filter((b) => b.eventDishId === ed.id)
        .map((b) => b.componentId),
    );
    if (satisfied.size)
      demand.contributions = demand.contributions.filter(
        (c) => !(c.componentPath.length && satisfied.has(c.componentPath[0])),
      );
    demand.recipeNeeds = demand.recipeNeeds.map((need) => ({
      ...need,
      editionVersion:
        catalog.lookups.components.get(need.componentId)?.editionVersion ??
        null,
    }));
    return {
      ...demand,
      dishName: catalog.lookups.dishes.get(ed.dishId)?.name ?? ed.dishId,
      quantityServings: ed.quantityServings,
    };
  });
  const names = {
    ...catalog.lookups,
    removedNames: await removedRecordNames(
      ctx,
      tenantId,
      results.flatMap((r) => r.unresolved),
    ),
  };
  for (const result of results)
    result.unresolved = withUnresolvedText(result.unresolved, names);
  const all = results.flatMap((r) => r.contributions);
  return {
    eventId: String(eventId),
    eventDishes: results,
    purchasing: purchasingTotals(all),
    unresolvedCount: results.reduce((n, r) => n + r.unresolved.length, 0),
    batchSatisfied,
    activeAllocationIds,
  };
}

/**
 * Names of removed recipes, ingredients and dishes that unresolved items still
 * point at (soft-deleted rows keep their name), so notices can say what went.
 */
async function removedRecordNames(
  ctx: Ctx,
  tenantId: string,
  items: UnresolvedItem[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const item of items) {
    if (item.kind !== "missing_reference" || out.has(item.refId)) continue;
    const row =
      item.detail === "ingredient not found"
        ? await getIfId(ctx, "ingredients", item.refId)
        : item.detail === "dish not found"
          ? await getIfId(ctx, "dishes", item.refId)
          : await getIfId(ctx, "components", item.refId);
    if (row && row.tenantId === tenantId && row.name)
      out.set(item.refId, String(row.name));
  }
  return out;
}

async function getIfId<T extends "ingredients" | "dishes" | "components">(
  ctx: Ctx,
  table: T,
  id: string,
) {
  const normalized = ctx.db.normalizeId(table, id);
  return normalized ? await ctx.db.get(normalized) : null;
}

/** Full demand review for one event: contributions, recipe needs, unresolved items, purchasing totals. */
export const eventDemandReview = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<EventDemandReview> => {
    const tenantId = requireCulinaryReader(await getAuthContext(ctx));
    return reviewEvent(ctx, tenantId, args.eventId);
  },
});

export interface ComponentContentReport {
  componentId: string;
  contentStatus: ReturnType<typeof componentContentStatus>;
  cost: CostReport;
  nestedChildren: {
    id: string;
    name: string;
    contentStatus: ReturnType<typeof componentContentStatus>;
  }[];
  usedBy: { componentId: string; name: string }[];
}

/** Recipe page facts: content status, nested cost with known subtotal, children and parents. */
export const componentContentReport = query({
  args: { componentId: v.id("components") },
  handler: async (ctx, args): Promise<ComponentContentReport | null> => {
    const tenantId = requireCulinaryReader(await getAuthContext(ctx));
    const catalog = await loadCatalog(ctx, tenantId);
    const component = catalog.lookups.components.get(String(args.componentId));
    if (!component) return null;
    const cost = componentBatchCost(component.id, catalog.lookups);
    const usedBy = [...catalog.lookups.components.values()]
      .filter((c) =>
        c.componentLines.some((l) => l.childComponentId === component.id),
      )
      .map((c) => ({ componentId: c.id, name: c.name }));
    return {
      componentId: component.id,
      contentStatus: componentContentStatus(component),
      cost,
      nestedChildren: component.componentLines
        .map((l) => catalog.lookups.components.get(l.childComponentId))
        .filter((c): c is ComponentLike => Boolean(c))
        .map((c) => ({
          id: c.id,
          name: c.name,
          contentStatus: componentContentStatus(c),
        })),
      usedBy,
    };
  },
});

export interface UnresolvedWorkReport {
  events: {
    eventId: string;
    eventName: string;
    startsAt: number | null;
    unresolved: EventDishDemand["unresolved"];
    purchasingComplete: boolean;
  }[];
  recipes: {
    componentId: string;
    name: string;
    contentStatus: ReturnType<typeof componentContentStatus>;
    costConfidence: CostReport["confidence"];
    knownSubtotal: number;
    unknownLines: number;
  }[];
}

const OPEN_STAGES = new Set([
  "planning",
  "pending_approval",
  "approved",
  "executing",
]);

/** Tenant-wide: every unresolved requirement, choice, unit or recipe gap on live events, plus recipes with missing content. */
export const kitchenUnresolvedReport = query({
  args: {},
  handler: async (ctx): Promise<UnresolvedWorkReport> => {
    const tenantId = requireCulinaryReader(await getAuthContext(ctx));
    const catalog = await loadCatalog(ctx, tenantId);
    // An event that is already over (but never closed out) needs nothing
    // ordered or cooked any more, so its gaps are not kitchen work.
    const now = Date.now();
    const events = (await byTenant(ctx, "events", tenantId))
      .filter(
        (e) =>
          OPEN_STAGES.has(e.stage) &&
          Number(e.endsAt ?? e.startsAt ?? Infinity) >= now,
      )
      .sort(
        (a, b) =>
          Number(a.startsAt ?? Infinity) - Number(b.startsAt ?? Infinity),
      );
    const eventRows: UnresolvedWorkReport["events"] = [];
    for (const event of events) {
      const eventDishes = await loadEventDishes(ctx, tenantId, event._id);
      const demands = eventDishes.map((ed) =>
        expandEventDish(ed, catalog.lookups),
      );
      const found = demands.flatMap((d) => d.unresolved);
      const unresolved = withUnresolvedText(found, {
        ...catalog.lookups,
        removedNames: await removedRecordNames(ctx, tenantId, found),
      });
      const purchasing = purchasingTotals(
        demands.flatMap((d) => d.contributions),
      );
      if (!unresolved.length && purchasing.complete) continue;
      eventRows.push({
        eventId: String(event._id),
        eventName: event.title || String(event._id),
        startsAt: typeof event.startsAt === "number" ? event.startsAt : null,
        unresolved,
        purchasingComplete: purchasing.complete,
      });
    }
    const recipes: UnresolvedWorkReport["recipes"] = [];
    for (const component of catalog.lookups.components.values()) {
      const contentStatus = componentContentStatus(component);
      const cost = componentBatchCost(component.id, catalog.lookups);
      if (contentStatus === "complete" && cost.confidence === "complete")
        continue;
      recipes.push({
        componentId: component.id,
        name: component.name,
        contentStatus,
        costConfidence: cost.confidence,
        knownSubtotal: cost.knownSubtotal,
        unknownLines: cost.unknownLines,
      });
    }
    recipes.sort((a, b) => a.name.localeCompare(b.name));
    return { events: eventRows, recipes };
  },
});

/** Closeout read tier (financeAccess | eventManageAccess): revenue and actuals. */
function canReadEventMoney(role: string): boolean {
  return (
    role === "finance_staff" ||
    role === "manager" ||
    role.endsWith("_manager") ||
    role === "admin" ||
    role === "owner" ||
    role === "system"
  );
}

const BILLED_INVOICE_STATUSES = new Set([
  "sent",
  "viewed",
  "overdue",
  "partial",
  "paid",
]);

/**
 * Event food cost: the estimate priced at the event date with its coverage,
 * and (for money readers) the closeout actual incl. recorded waste, variance,
 * cost per guest and food-cost % on the reporting revenue basis. Read only.
 */
export const eventFoodCostReport = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<EventFoodCost> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!canReadCulinaryReports(auth.role) && !canReadEventMoney(auth.role))
      throw new Error(
        "Kitchen, finance and managers may read an event's food cost",
      );
    const event = await requireEvent(ctx, tenantId, args.eventId);
    const catalog = await loadCatalog(ctx, tenantId);
    const eventDishes = await loadEventDishes(ctx, tenantId, args.eventId);
    // Every menu amount counts, including parts a shared batch makes: the
    // event eats that food whichever batch cooks it.
    const demands = eventDishes.map((ed) =>
      expandEventDish(ed, catalog.lookups),
    );
    const asOf = typeof event.startsAt === "number" ? event.startsAt : null;
    const expectedHeadcount = Number(event.expectedHeadcount ?? 0);
    let revenue: EventFoodCostInput["revenue"] = null;
    let actual: EventFoodCostInput["actual"] = null;
    let recordedWasteCost = 0;
    if (canReadEventMoney(auth.role)) {
      const closeout = (await byTenant(ctx, "eventCloseouts", tenantId)).find(
        (c) => String(c.eventId) === String(args.eventId),
      );
      const finalized = closeout?.status === "finalized";
      const ingredientCost = Number(closeout?.actualIngredientCost ?? 0);
      // A draft seeded with $0 is not an actual yet.
      if (closeout && (finalized || ingredientCost > 0))
        actual = {
          ingredientCost,
          actualHeadcount: Number(closeout.actualHeadcount ?? 0),
          finalized,
        };
      // A finalized closeout is the event's frozen result: waste logged later
      // reaches it only through an audited closeout correction.
      recordedWasteCost = finalized
        ? Number(closeout?.actualWasteCost ?? 0)
        : (await byTenant(ctx, "wasteRecords", tenantId))
            .filter(
              (w) =>
                String(w.eventId ?? "") === String(args.eventId) &&
                w.status === "recorded",
            )
            .reduce(
              (sum, w) => sum + Number(w.quantity) * Number(w.unitCost),
              0,
            );
      const billed = (await byTenant(ctx, "invoices", tenantId))
        .filter(
          (i) =>
            String(i.eventId ?? "") === String(args.eventId) &&
            BILLED_INVOICE_STATUSES.has(String(i.status)),
        )
        .reduce((sum, i) => sum + Number(i.total ?? 0), 0);
      revenue =
        finalized && Number(closeout?.actualRevenue ?? 0) > 0
          ? { amount: Number(closeout?.actualRevenue), source: "closeout" }
          : billed > 0
            ? { amount: billed, source: "invoices" }
            : Number(event.quotedPrice ?? 0) > 0
              ? { amount: Number(event.quotedPrice), source: "quote" }
              : null;
    }
    return eventFoodCost({
      contributions: demands.flatMap((d) => d.contributions),
      unresolvedItems: demands.reduce((n, d) => n + d.unresolved.length, 0),
      ingredients: catalog.lookups.ingredients,
      mappings: catalog.lookups.mappings,
      asOf,
      expectedHeadcount,
      revenue,
      actual,
      recordedWasteCost,
    });
  },
});

const contributionArgs = (
  c: Contribution,
  dishId: string,
  purchasingWeekStart: number | undefined,
) => ({
  eventId: c.eventId,
  eventDishId: c.eventDishId,
  dishId,
  ingredientId: c.ingredientId,
  // Unresolved rows stay visible through exactQuantity but never enter the
  // summed purchasing total.
  quantity: c.purchasable ? c.quantity : 0,
  unit: c.unit,
  servings: c.servings,
  componentId: c.componentId ?? undefined,
  purchasingWeekStart,
  sourceKey: c.sourceKey,
  exactQuantity: c.exactQuantity,
  quantityBasis: c.quantityBasis,
  unitStatus: c.purchasable
    ? "resolved"
    : c.unitStatus !== "resolved"
      ? c.unitStatus
      : c.basisStatus,
  ownership: c.ownership,
  sourceDishIngredientId: c.sourceDishIngredientId ?? undefined,
  sourceDishComponentId: c.sourceDishComponentId ?? undefined,
  componentPath: c.componentPath,
  calculationSnapshot: c.calculationSnapshot,
});

export interface ReconcileEventDemandResult {
  eventId: string;
  created: number;
  updated: number;
  superseded: number;
  unchanged: number;
  unresolvedCount: number;
  purchasingComplete: boolean;
  /** True when the event is finished or cancelled: its demand is history and was left as it was. */
  historyKept?: boolean;
}

/** Stages whose demand is history: later recipe edits never rewrite it. */
export const FINISHED_EVENT_STAGES = new Set([
  "completed",
  "closed_out",
  "cancelled",
]);

/** Write the authoritative demand for an event: idempotent replace by sourceKey. */
export async function writeReconciledEventDemand(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<ReconcileEventDemandResult> {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const event = await requireEvent(ctx, tenantId, eventId);
  if (FINISHED_EVENT_STAGES.has(String(event.stage)))
    return {
      eventId: String(eventId),
      created: 0,
      updated: 0,
      superseded: 0,
      unchanged: 0,
      unresolvedCount: 0,
      purchasingComplete: true,
      historyKept: true,
    };
  const review = await reviewEvent(ctx, tenantId, eventId);
  const existingRows = (
    await byTenant(ctx, "eventIngredientContributions", tenantId)
  ).filter((r) => String(r.eventId) === String(eventId));
  const existing: ExistingContributionRow[] = existingRows.map((r) => ({
    id: String(r._id),
    sourceKey: r.sourceKey ?? null,
    eventDishId: String(r.eventDishId),
    componentId: r.componentId ? String(r.componentId) : null,
    ingredientId: String(r.ingredientId),
    unit: unitOf(r.unit),
    quantity: Number(r.quantity),
    deletedAt: r.deletedAt ?? null,
  }));
  const rowById = new Map(existingRows.map((r) => [String(r._id), r]));
  const result: ReconcileEventDemandResult = {
    eventId: String(eventId),
    created: 0,
    updated: 0,
    superseded: 0,
    unchanged: 0,
    unresolvedCount: review.unresolvedCount,
    purchasingComplete: review.purchasing.complete,
  };
  const week =
    typeof event.purchasingWeekStart === "number"
      ? event.purchasingWeekStart
      : undefined;
  const activeAllocations = new Set(review.activeAllocationIds);
  for (const ed of review.eventDishes) {
    const dishId = ed.contributions[0]?.dishId ?? null;
    const plan = reconcileContributions(
      existing,
      ed.contributions,
      ed.eventDishId,
    );
    for (const c of plan.create) {
      await ctx.runMutation(
        api.mutations.EventIngredientContribution_createViaRecord,
        contributionArgs(c, c.dishId, week),
      );
      result.created += 1;
    }
    for (const u of plan.update) {
      const row = rowById.get(u.id);
      if (!row) continue;
      // Event-dish rows the engine does not own (batch shares) are left alone.
      await ctx.runMutation(api.mutations.EventIngredientContribution_record, {
        docId: row._id,
        ...contributionArgs(u.next, u.next.dishId, week),
      });
      result.updated += 1;
    }
    for (const s of plan.supersede) {
      const row = rowById.get(s.id);
      if (!row) continue;
      const batchOwned =
        row.ownership === "batch_allocation" ||
        row.ownership === "batch_surplus";
      // Live batch shares are left alone; shares of a released allocation or
      // a cancelled batch are stale and must not be counted twice.
      if (
        batchOwned &&
        row.productionBatchAllocationId &&
        activeAllocations.has(String(row.productionBatchAllocationId))
      )
        continue;
      await ctx.runMutation(
        api.mutations.EventIngredientContribution_supersede,
        {
          docId: row._id,
          reason: batchOwned
            ? "batch allocation released or cancelled"
            : "replaced by demand reconcile",
          supersededBySourceKey: s.replacedBy ?? undefined,
        },
      );
      result.superseded += 1;
    }
    result.unchanged += plan.unchanged.length;
    void dishId;
  }
  return result;
}

export const reconcileEventDemand = mutation({
  args: { eventId: v.id("events") },
  handler: (ctx, args): Promise<ReconcileEventDemandResult> =>
    writeReconciledEventDemand(ctx, args.eventId),
});

export interface DemandChangePreview {
  kind: DemandChangeKind;
  eventId: string;
  fingerprint: string;
  lines: Array<
    DemandChangeLine & {
      change: "added" | "removed" | "changed" | "unchanged";
    }
  >;
  affectedPurchaseNeeds: Array<{
    id: string;
    ingredientId: string;
    status: string;
    currentQuantity: number;
    nextQuantity: number;
    isCommitted: boolean;
  }>;
}

type DemandPreviewInput = {
  eventId: Id<"events">;
  kind: DemandChangeKind;
  newHeadcount?: number;
  demandId?: Id<"ingredientDemands">;
};

type PreviewContribution = {
  ingredientId: string;
  unit: UnitCode;
  quantity: number;
  ingredientName: string;
};

/** The read side of demand reconciliation. It deliberately uses the same
 * review and reconcile plan as `writeReconciledEventDemand`; this is the
 * only place an operator preview is calculated. */
async function buildDemandChangePreview(
  ctx: Ctx,
  tenantId: string,
  input: DemandPreviewInput,
): Promise<DemandChangePreview> {
  const event = await requireEvent(ctx, tenantId, input.eventId);
  const contributionRows = (
    await byTenant(ctx, "eventIngredientContributions", tenantId)
  ).filter((row) => String(row.eventId) === String(input.eventId));
  const demandRows = (
    await byTenant(ctx, "ingredientDemands", tenantId)
  ).filter((row) => String(row.eventId) === String(input.eventId));
  const purchaseNeeds = (await byTenant(ctx, "purchaseNeeds", tenantId)).filter(
    (row) => String(row.eventId) === String(input.eventId),
  );

  const sourceParts = [
    `${input.kind}:${input.eventId}:${input.newHeadcount ?? ""}:${input.demandId ?? ""}`,
    `event:${event._id}:${event.version}:${event.updatedAt}`,
    ...contributionRows.map(
      (row) =>
        `contribution:${row._id}:${row.version}:${row.updatedAt}:${row.quantity}:${row.deletedAt ?? ""}`,
    ),
    ...demandRows.map(
      (row) =>
        `demand:${row._id}:${row.version}:${row.updatedAt}:${row.requiredQuantity}:${row.status}`,
    ),
    ...purchaseNeeds.map(
      (row) =>
        `purchase:${row._id}:${row.version}:${row.updatedAt}:${row.requiredQuantity}:${row.status}`,
    ),
  ];

  if (input.kind === "supersede") {
    const demand = input.demandId
      ? demandRows.find((row) => String(row._id) === String(input.demandId))
      : null;
    if (!demand) throw new Error("Ingredient demand not found");
    const affectedPurchaseNeeds = purchaseNeeds
      .filter((need) => String(need.ingredientDemandId) === String(demand._id))
      .map((need) => ({
        id: String(need._id),
        ingredientId: String(need.ingredientId),
        status: String(need.status),
        currentQuantity: Number(need.requiredQuantity),
        nextQuantity: 0,
        isCommitted: need.status === "ordered" || need.status === "fulfilled",
      }));
    const ingredient = (
      await loadCatalog(ctx, tenantId)
    ).lookups.ingredients.get(String(demand.ingredientId));
    const line: DemandChangeLine = {
      key: String(demand._id),
      ingredientId: String(demand.ingredientId),
      ingredientName: ingredient?.name ?? String(demand.ingredientId),
      unit: unitOf(demand.unit),
      currentQuantity: Number(demand.requiredQuantity),
      nextQuantity: 0,
    };
    return {
      kind: input.kind,
      eventId: String(input.eventId),
      fingerprint: demandPreviewFingerprint(sourceParts),
      lines: [{ ...line, change: "removed" }],
      affectedPurchaseNeeds,
    };
  }

  const review = await reviewEvent(
    ctx,
    tenantId,
    input.eventId,
    input.kind === "headcount" ? input.newHeadcount : undefined,
  );
  const existing = contributionRows.map((row) => ({
    id: String(row._id),
    sourceKey: row.sourceKey ?? null,
    eventDishId: String(row.eventDishId),
    componentId: row.componentId ? String(row.componentId) : null,
    ingredientId: String(row.ingredientId),
    unit: unitOf(row.unit),
    quantity: Number(row.quantity),
    deletedAt: row.deletedAt ?? null,
  }));
  const current = new Map<string, PreviewContribution>();
  const next = new Map<string, PreviewContribution>();
  const catalog = await loadCatalog(ctx, tenantId);
  const put = (
    target: Map<string, PreviewContribution>,
    key: string,
    value: PreviewContribution,
  ) => target.set(key, value);
  for (const row of contributionRows) {
    if (row.deletedAt != null) continue;
    const key = String(row._id);
    const ingredientId = String(row.ingredientId);
    put(next, key, {
      ingredientId,
      unit: unitOf(row.unit),
      quantity: Number(row.quantity),
      ingredientName:
        catalog.lookups.ingredients.get(ingredientId)?.name ?? ingredientId,
    });
    put(current, key, next.get(key)!);
  }
  for (const eventDish of review.eventDishes) {
    const plan = reconcileContributions(
      existing,
      eventDish.contributions,
      eventDish.eventDishId,
    );
    for (const created of plan.create) {
      put(next, `new:${created.sourceKey}`, {
        ingredientId: created.ingredientId,
        unit: created.unit,
        quantity: created.quantity,
        ingredientName: created.ingredientName,
      });
    }
    for (const updated of plan.update) {
      put(next, updated.id, {
        ingredientId: updated.next.ingredientId,
        unit: updated.next.unit,
        quantity: updated.next.quantity,
        ingredientName: updated.next.ingredientName,
      });
    }
    for (const removed of plan.supersede) next.delete(removed.id);
  }
  // One line per ingredient: a recipe now in pounds is compared with the
  // ounces already saved, not shown as one removed and one added line.
  const linesByKey = new Map<string, DemandChangeLine>();
  const lineFor = (row: PreviewContribution) => {
    for (const line of linesByKey.values()) {
      if (line.ingredientId !== row.ingredientId) continue;
      const converted = convertQuantity(
        row.quantity,
        row.unit,
        line.unit as UnitCode,
      );
      if (converted.status === "resolved") {
        return { line, quantity: converted.quantity };
      }
    }
    const key = `${row.ingredientId}:${row.unit}`;
    const line: DemandChangeLine = {
      key,
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName,
      unit: row.unit,
      currentQuantity: 0,
      nextQuantity: 0,
    };
    linesByKey.set(key, line);
    return { line, quantity: row.quantity };
  };
  for (const row of current.values()) {
    const { line, quantity } = lineFor(row);
    line.currentQuantity += quantity;
  }
  for (const row of next.values()) {
    const { line, quantity } = lineFor(row);
    line.nextQuantity += quantity;
  }
  const lines = [...linesByKey.values()]
    .map((line) => ({
      ...line,
      currentQuantity: Number(line.currentQuantity.toFixed(6)),
      nextQuantity: Number(line.nextQuantity.toFixed(6)),
      change: classifyDemandChange(
        Number(line.currentQuantity.toFixed(6)),
        Number(line.nextQuantity.toFixed(6)),
      ),
    }))
    .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
  const changedIngredients = new Set(
    lines
      .filter((line) => line.change !== "unchanged")
      .map((line) => line.ingredientId),
  );
  const projectedByIngredient = new Map<string, number>();
  for (const line of lines) {
    projectedByIngredient.set(line.ingredientId, line.nextQuantity);
  }
  return {
    kind: input.kind,
    eventId: String(input.eventId),
    fingerprint: demandPreviewFingerprint(sourceParts),
    lines,
    affectedPurchaseNeeds: purchaseNeeds
      .filter((need) => changedIngredients.has(String(need.ingredientId)))
      .map((need) => ({
        id: String(need._id),
        ingredientId: String(need.ingredientId),
        status: String(need.status),
        currentQuantity: Number(need.requiredQuantity),
        nextQuantity:
          projectedByIngredient.get(String(need.ingredientId)) ??
          Number(need.requiredQuantity),
        isCommitted: need.status === "ordered" || need.status === "fulfilled",
      })),
  };
}

const demandChangeKind = v.union(
  v.literal("recalculate"),
  v.literal("headcount"),
  v.literal("supersede"),
);

export const previewDemandChange = query({
  args: {
    eventId: v.id("events"),
    kind: demandChangeKind,
    newHeadcount: v.optional(v.number()),
    demandId: v.optional(v.id("ingredientDemands")),
  },
  handler: async (ctx, args): Promise<DemandChangePreview> => {
    // A headcount edit is not a culinary report: anyone who may change the
    // guest count must see its impact. The apply commands keep their guards.
    const auth = await getAuthContext(ctx);
    const tenantId =
      args.kind === "headcount"
        ? requireTenant(auth)
        : requireCulinaryReader(auth);
    return buildDemandChangePreview(ctx, tenantId, args);
  },
});

function assertFreshPreview(
  preview: DemandChangePreview,
  expectedFingerprint: string,
): void {
  if (preview.fingerprint !== expectedFingerprint) {
    throw new Error(
      "Demand data changed since this preview. Review the updated changes before applying.",
    );
  }
}

export const applyDemandRecalculation = mutation({
  args: { eventId: v.id("events"), expectedFingerprint: v.string() },
  handler: async (ctx, args): Promise<ReconcileEventDemandResult> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    assertFreshPreview(
      await buildDemandChangePreview(ctx, tenantId, {
        eventId: args.eventId,
        kind: "recalculate",
      }),
      args.expectedFingerprint,
    );
    return writeReconciledEventDemand(ctx, args.eventId);
  },
});

export const applyDemandHeadcount = mutation({
  args: {
    eventId: v.id("events"),
    newHeadcount: v.number(),
    version: v.optional(v.number()),
    expectedFingerprint: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    assertFreshPreview(
      await buildDemandChangePreview(ctx, tenantId, {
        eventId: args.eventId,
        kind: "headcount",
        newHeadcount: args.newHeadcount,
      }),
      args.expectedFingerprint,
    );
    return ctx.runMutation(api.mutations.Event_changeHeadcount, {
      docId: args.eventId,
      version: args.version,
      newHeadcount: args.newHeadcount,
    });
  },
});

export const applyDemandSupersede = mutation({
  args: {
    eventId: v.id("events"),
    demandId: v.id("ingredientDemands"),
    version: v.optional(v.number()),
    reason: v.string(),
    expectedFingerprint: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    assertFreshPreview(
      await buildDemandChangePreview(ctx, tenantId, {
        eventId: args.eventId,
        kind: "supersede",
        demandId: args.demandId,
      }),
      args.expectedFingerprint,
    );
    return ctx.runMutation(api.mutations.IngredientDemand_supersede, {
      docId: args.demandId,
      version: args.version,
      reason: args.reason,
    });
  },
});

/**
 * Plan one shared batch of a recipe for several event dishes. Refuses to
 * group more than one event unless the recipe's storage window is confirmed.
 * Allocations sum to the exact need; surplus is its own allocation. Batch
 * ingredient shares are written once, owned per allocation; the surplus share
 * is purchased on the first event and labelled batch_surplus, never repeated.
 */
interface SharedBatchResult {
  batchId: string;
  plannedExact: number;
  plannedRounded: number;
  surplusQuantity: number;
  allocations: ReturnType<typeof planSharedBatch>["allocations"];
  contributionsWritten: number;
  unresolved: string[];
}

export const planSharedRecipeBatch = mutation({
  args: {
    componentId: v.id("components"),
    allocations: v.array(
      v.object({
        eventId: v.id("events"),
        eventDishId: v.id("eventDishes"),
        quantity: v.number(),
        unit: v.string(),
      }),
    ),
    roundingScope: v.optional(v.string()),
    roundingRule: v.optional(v.string()),
    roundingIncrement: v.optional(v.number()),
    productionDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SharedBatchResult> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const catalog = await loadCatalog(ctx, tenantId);
    const component = catalog.lookups.components.get(String(args.componentId));
    const componentDoc = catalog.components.find(
      (c) => String(c._id) === String(args.componentId),
    );
    if (!component || !componentDoc) throw new Error("Recipe not found");
    if (!args.allocations.length)
      throw new Error("At least one allocation is required");
    const eventIds = new Set(args.allocations.map((a) => String(a.eventId)));
    if (eventIds.size > 1 && componentDoc.storageWindowDays == null) {
      throw new Error(
        "Shared batches across events need a confirmed storage window on the recipe",
      );
    }
    const scope: RoundingScope =
      args.roundingScope === "dish_allocation" ||
      args.roundingScope === "event_total" ||
      args.roundingScope === "production_group" ||
      args.roundingScope === "purchase_pack"
        ? args.roundingScope
        : "none";
    const rule: RoundingRule =
      args.roundingRule === "whole_up" ||
      args.roundingRule === "whole_nearest" ||
      args.roundingRule === "increment"
        ? args.roundingRule
        : "none";
    const provisional = planSharedBatch({
      batchId: "pending",
      component,
      allocations: args.allocations.map((a) => ({
        eventId: String(a.eventId),
        eventDishId: String(a.eventDishId),
        quantity: a.quantity,
        unit: unitOf(a.unit),
      })),
      lookups: catalog.lookups,
      rounding: { scope, rule, increment: args.roundingIncrement },
    });
    // Every allocation must convert to the recipe yield unit before anything
    // is written; a partial batch would delete demand for the unresolved event.
    const resolvedAllocations = provisional.allocations.filter(
      (a) => !a.isSurplus,
    ).length;
    if (resolvedAllocations !== args.allocations.length) {
      throw new Error(
        `Cannot plan this batch: ${provisional.unresolved.join("; ") || "an allocation could not be converted to the recipe yield unit"}`,
      );
    }
    const firstEvent = args.allocations[0];
    const created: { docId?: string } | null = await ctx.runMutation(
      api.mutations.ProductionBatch_createViaPlan,
      {
        componentId: String(args.componentId),
        plannedYield: provisional.plannedRounded,
        yieldUnit: component.yieldUnit,
        eventId: eventIds.size === 1 ? String(firstEvent.eventId) : undefined,
        notes: args.notes,
      },
    );
    const batchId = String(created?.docId ?? "");
    if (!batchId) throw new Error("Batch was not created");
    await ctx.runMutation(api.mutations.ProductionBatch_reconcilePlan, {
      docId: batchId as Id<"productionBatches">,
      plannedExact: provisional.plannedExact,
      plannedRounded: provisional.plannedRounded,
      roundingScope: scope,
      productionDate: args.productionDate,
    });
    const plan = planSharedBatch({
      ...{ batchId },
      component,
      allocations: args.allocations.map((a) => ({
        eventId: String(a.eventId),
        eventDishId: String(a.eventDishId),
        quantity: a.quantity,
        unit: unitOf(a.unit),
      })),
      lookups: catalog.lookups,
      rounding: { scope, rule, increment: args.roundingIncrement },
    });
    const allocationIds: string[] = [];
    for (const alloc of plan.allocations) {
      const res: { docId?: string } | null = await ctx.runMutation(
        api.mutations.ProductionBatchAllocation_createViaAllocate,
        {
          productionBatchId: batchId,
          allocatedQuantity: alloc.allocatedQuantity,
          unit: alloc.unit,
          formulaShare: alloc.formulaShare,
          eventId: alloc.eventId ?? undefined,
          eventDishId: alloc.eventDishId ?? undefined,
          isSurplus: alloc.isSurplus,
        },
      );
      allocationIds.push(String((res as { docId?: string })?.docId ?? ""));
    }
    // Per-event-dish recipe contributions for this recipe are now satisfied
    // by the batch: supersede them so demand is not counted twice.
    const existing = (
      await byTenant(ctx, "eventIngredientContributions", tenantId)
    ).filter(
      (r) =>
        r.ownership !== "batch_allocation" && r.ownership !== "batch_surplus",
    );
    for (const a of args.allocations) {
      for (const row of existing) {
        if (String(row.eventDishId) !== String(a.eventDishId)) continue;
        const path = row.componentPath ?? [];
        if (!path.length || path[0] !== component.id) continue;
        await ctx.runMutation(
          api.mutations.EventIngredientContribution_supersede,
          {
            docId: row._id,
            reason: "satisfied by shared batch",
            supersededBySourceKey: `pb:${batchId}`,
          },
        );
      }
    }
    // Batch ingredient shares, owned per allocation. Surplus is purchased once
    // on the first event and labelled; it is never assigned to a second event.
    const surplusHome = {
      eventId: String(firstEvent.eventId),
      eventDishId: String(firstEvent.eventDishId),
    };
    const eventDishDocs = await byTenant(ctx, "eventDishes", tenantId);
    const dishOf = new Map(
      eventDishDocs.map((ed) => [String(ed._id), String(ed.dishId)]),
    );
    const eventDocs = await byTenant(ctx, "events", tenantId);
    const weekOf = new Map(
      eventDocs.map((e) => [
        String(e._id),
        typeof e.purchasingWeekStart === "number"
          ? e.purchasingWeekStart
          : undefined,
      ]),
    );
    let written = 0;
    for (const share of plan.contributions) {
      const eventId = share.eventId ?? surplusHome.eventId;
      const eventDishId = share.eventDishId ?? surplusHome.eventDishId;
      await ctx.runMutation(
        api.mutations.EventIngredientContribution_createViaRecord,
        {
          eventId,
          eventDishId,
          dishId: dishOf.get(eventDishId) ?? "",
          ingredientId: share.ingredientId,
          quantity: share.purchasable ? share.quantity : 0,
          unit: share.unit,
          servings: 0,
          componentId: share.componentId,
          purchasingWeekStart: weekOf.get(eventId),
          sourceKey: share.sourceKey,
          exactQuantity: share.quantity,
          unitStatus: share.purchasable
            ? "resolved"
            : share.unitStatus !== "resolved"
              ? share.unitStatus
              : share.basisStatus,
          ownership: share.ownership,
          componentPath: share.componentPath,
          productionBatchId: batchId,
          productionBatchAllocationId:
            allocationIds[share.allocationIndex] || undefined,
        },
      );
      written += 1;
    }
    return {
      batchId,
      plannedExact: plan.plannedExact,
      plannedRounded: plan.plannedRounded,
      surplusQuantity: plan.surplusQuantity,
      allocations: plan.allocations,
      contributionsWritten: written,
      unresolved: plan.unresolved,
    };
  },
});

/**
 * The chain of recipes from `childId` down to `parentId` when `childId`
 * already uses `parentId` somewhere inside it (so putting it under
 * `parentId` would loop), else null.
 */
export function nestedRecipeLoop(
  children: ReadonlyMap<string, readonly string[]>,
  parentId: string,
  childId: string,
): string[] | null {
  const cameFrom = new Map<string, string | null>([[childId, null]]);
  const queue = [childId];
  while (queue.length) {
    const current = queue.shift() as string;
    if (current === parentId) {
      const path: string[] = [];
      for (
        let at: string | null = current;
        at != null;
        at = cameFrom.get(at) ?? null
      )
        path.unshift(at);
      return path;
    }
    for (const next of children.get(current) ?? []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, current);
      queue.push(next);
    }
  }
  return null;
}

/** Add a sub-recipe line after walking the child's tree for a cycle. */
export const addNestedRecipeLine = mutation({
  args: {
    componentId: v.id("components"),
    childComponentId: v.id("components"),
    quantity: v.number(),
    unit: v.string(),
    sortOrder: v.optional(v.number()),
    wasteFactor: v.optional(v.number()),
    quantityBasis: v.optional(v.string()),
    prepNotes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ docId?: string } | null> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    if (String(args.componentId) === String(args.childComponentId))
      throw new Error("A recipe cannot contain itself");
    const lines = await byTenant(ctx, "componentComponents", tenantId);
    const children = new Map<string, string[]>();
    for (const l of lines) {
      if (l.addedAt == null || l.deletedAt != null) continue;
      const list = children.get(String(l.componentId)) ?? [];
      list.push(String(l.childComponentId));
      children.set(String(l.componentId), list);
    }
    const loop = nestedRecipeLoop(
      children,
      String(args.componentId),
      String(args.childComponentId),
    );
    if (loop) {
      const names = await Promise.all(
        loop.map(async (id) => {
          const row = await ctx.db.get(id as Id<"components">);
          return row && row.tenantId === tenantId ? row.name : "another recipe";
        }),
      );
      throw new Error(
        `${names[0]} already uses ${names[names.length - 1]} (${names.join(" → ")}), so it cannot go inside ${names[names.length - 1]}. That would make a loop. Pick a different recipe.`,
      );
    }
    return await ctx.runMutation(
      api.mutations.ComponentComponent_createViaAdd,
      {
        componentId: String(args.componentId),
        childComponentId: String(args.childComponentId),
        quantity: args.quantity,
        unit: unitOf(args.unit),
        sortOrder: args.sortOrder,
        wasteFactor: args.wasteFactor,
        quantityBasis: basisOf(args.quantityBasis) ?? undefined,
        prepNotes: args.prepNotes,
      },
    );
  },
});
