// Authored seam: catalog reclassification (2026-09-21).
// Design: docs/systems/culinary-catalog-reclassification.md.
//
// Suggestions are ExternalRecordLink rows (recordType "menu", role
// "reclassify", decision suggested → approved/rejected). The plan is computed
// off-line by scripts/catalog-reclassification-plan.ts (rules, then Jev) and
// recorded here; a person approves per group on /kitchen/cleanup; apply runs
// the existing generated commands in one transaction per batch and never
// deletes a Dish row — it retires it and points its link at the new record.

import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { requireKitchenAccess } from "./lib/kitchenAccessGate";
import { buildLinkKey } from "./lib/culinaryModel/importMapping";
import {
  CAPSULE_ENTITY_FOR_KIND,
  nameKey,
  PLACEHOLDER_CATEGORY,
  RECLASSIFY_KINDS,
  type ReclassifyKind,
} from "./lib/culinaryModel/catalogReclassification";
import {
  readMaterializationReceipt,
  writeMaterializationReceipt,
} from "./lib/materializationReceipt";

const SOURCE_SYSTEM = "tpp_legacy";
const MENU_RECORD_TYPE = "menu";
const RECLASSIFY_ROLE = "reclassify";
const RECEIPT_FAMILY = "catalogReclassification";
export const APPLY_BATCH_LIMIT = 25;

type Ctx = QueryCtx | MutationCtx;
type Link = Doc<"externalRecordLinks">;

const kindValidator = v.union(
  v.literal("food"),
  v.literal("supply"),
  v.literal("package"),
  v.literal("service"),
  v.literal("placeholder"),
  v.literal("kitchen_batch"),
  v.literal("prep_step"),
  v.literal("orphan"),
);

const parentValidator = v.object({
  sak: v.string(),
  name: v.string(),
  dishId: v.union(v.id("dishes"), v.null()),
});

const suggestionValidator = v.object({
  dishId: v.id("dishes"),
  externalId: v.string(),
  kind: kindValidator,
  source: v.string(),
  confidence: v.number(),
  ready: v.boolean(),
  category: v.union(v.string(), v.null()),
  tpp: v.union(
    v.object({
      sak: v.string(),
      account: v.string(),
      category: v.union(v.string(), v.null()),
      role: v.union(v.string(), v.null()),
      yieldQuantity: v.number(),
      yieldUnit: v.union(v.string(), v.null()),
      yieldLabel: v.string(),
    }),
    v.null(),
  ),
  parents: v.array(parentValidator),
  existing: v.object({
    componentId: v.union(v.id("components"), v.null()),
    dishTaskIds: v.array(v.id("dishTasks")),
  }),
  sourceText: v.union(v.string(), v.null()),
  notes: v.array(v.string()),
});

/** What the link's metadata column holds for a suggestion. */
export interface SuggestionMetadata {
  kind: ReclassifyKind;
  source: string;
  confidence: number;
  ready: boolean;
  category: string | null;
  tpp: {
    sak: string;
    account: string;
    category: string | null;
    role: string | null;
    yieldQuantity: number;
    yieldUnit: string | null;
    yieldLabel: string;
  } | null;
  parents: { sak: string; name: string; dishId: string | null }[];
  existing: { componentId: string | null; dishTaskIds: string[] };
  sourceText: string | null;
  notes: string[];
}

const reclassifyLinkKey = (externalId: string) =>
  buildLinkKey({
    sourceSystem: SOURCE_SYSTEM,
    sourceAccount: null,
    recordType: MENU_RECORD_TYPE,
    externalId,
    role: RECLASSIFY_ROLE,
    ordinal: 0,
  });

async function authorize(ctx: Ctx) {
  const auth = await getAuthContext(ctx);
  requireKitchenAccess(auth);
  return { auth, tenantId: requireTenant(auth) };
}

async function tenantLinks(ctx: Ctx, tenantId: string): Promise<Link[]> {
  return await ctx.db
    .query("externalRecordLinks")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .filter((q) =>
      q.and(
        q.eq(q.field("deletedAt"), null),
        q.eq(q.field("recordType"), MENU_RECORD_TYPE),
      ),
    )
    .collect();
}

const parseMetadata = (link: Link): SuggestionMetadata | null => {
  if (!link.metadata) return null;
  try {
    return JSON.parse(link.metadata) as SuggestionMetadata;
  } catch {
    return null;
  }
};

const liveDish = (dish: Doc<"dishes"> | null, tenantId: string) =>
  dish != null && dish.tenantId === tenantId && dish.deletedAt == null
    ? dish
    : null;

/**
 * Every Dish the TPP menus import created (a "menu" link points at it) plus
 * the live components and dish task templates, so the off-line planner can
 * match existing records without a second round trip.
 */
export const candidates = query({
  args: {},
  handler: async (ctx) => {
    const { tenantId } = await authorize(ctx);
    const links = await tenantLinks(ctx, tenantId);
    const rows: {
      dishId: Id<"dishes">;
      name: string;
      category: string | null;
      kind: string | null;
      status: string;
      externalId: string;
      alreadySuggested: boolean;
    }[] = [];
    const suggested = new Set(
      links
        .filter((link) => link.role === RECLASSIFY_ROLE)
        .map((link) => link.externalId),
    );
    for (const link of links) {
      if (link.role != null || !link.capsuleId) continue;
      const dish = liveDish(
        await ctx.db.get(link.capsuleId as Id<"dishes">),
        tenantId,
      );
      if (!dish) continue;
      rows.push({
        dishId: dish._id,
        name: dish.name,
        category: dish.category ?? null,
        kind: (dish.kind as string | undefined) ?? null,
        status: String(dish.status),
        externalId: link.externalId,
        alreadySuggested: suggested.has(link.externalId),
      });
    }
    const components = (
      await ctx.db
        .query("components")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    )
      .filter((c) => c.deletedAt == null && String(c.status) !== "retired")
      .map((c) => ({ componentId: c._id, name: c.name }));
    const dishTasks = (
      await ctx.db
        .query("dishTasks")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    )
      .filter((t) => t.deletedAt == null && String(t.status) === "active")
      .map((t) => ({ dishTaskId: t._id, dishId: t.dishId, name: t.name }));
    const dishes = (
      await ctx.db
        .query("dishes")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    )
      .filter((d) => d.deletedAt == null && String(d.status) === "active")
      .map((d) => ({ dishId: d._id, name: d.name }));
    return { rows, components, dishTasks, dishes };
  },
});

/** Record (or refresh) suggestions. A decision a person already made stays. */
export const recordSuggestions = mutation({
  args: { suggestions: v.array(suggestionValidator) },
  handler: async (ctx, args) => {
    const { tenantId } = await authorize(ctx);
    const now = Date.now();
    let inserted = 0;
    let refreshed = 0;
    let kept = 0;
    for (const s of args.suggestions) {
      const dish = liveDish(await ctx.db.get(s.dishId), tenantId);
      if (!dish) continue;
      const { dishId: _dishId, externalId, ...metadata } = s;
      const metadataJson = JSON.stringify(
        metadata satisfies SuggestionMetadata,
      );
      const linkKey = reclassifyLinkKey(externalId);
      const existing = await ctx.db
        .query("externalRecordLinks")
        .withIndex("by_linkKey", (q) => q.eq("linkKey", linkKey))
        .filter((q) =>
          q.and(
            q.eq(q.field("tenantId"), tenantId),
            q.eq(q.field("deletedAt"), null),
          ),
        )
        .first();
      if (existing) {
        if (existing.decision !== "suggested" || existing.appliedAt != null) {
          kept += 1;
          continue;
        }
        await ctx.db.patch(existing._id, {
          capsuleEntity: CAPSULE_ENTITY_FOR_KIND[
            s.kind
          ] as Link["capsuleEntity"],
          metadata: metadataJson,
          suggestedBy: s.source,
          updatedAt: now,
          version: existing.version + 1,
        });
        refreshed += 1;
        continue;
      }
      await ctx.db.insert("externalRecordLinks", {
        tenantId,
        sourceSystem: SOURCE_SYSTEM as Link["sourceSystem"],
        recordType: MENU_RECORD_TYPE,
        externalId,
        sourceAccount: undefined,
        role: RECLASSIFY_ROLE,
        ordinal: 0,
        linkKey,
        capsuleEntity: CAPSULE_ENTITY_FOR_KIND[s.kind] as Link["capsuleEntity"],
        // The dish the suggestion is about; apply moves this to the new record.
        capsuleId: String(dish._id),
        decision: "suggested",
        suggestedBy: s.source,
        metadata: metadataJson,
        verified: false,
        conflictStatus: "resolved",
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        version: 0,
      });
      inserted += 1;
    }
    return { inserted, refreshed, kept };
  },
});

export interface PlanRow {
  linkId: Id<"externalRecordLinks">;
  dishId: Id<"dishes">;
  name: string;
  kind: ReclassifyKind;
  source: string;
  confidence: number;
  ready: boolean;
  decision: string;
  applied: boolean;
  outcome: string | null;
  /** Why the last apply attempt failed, when it did. */
  note: string | null;
  category: string | null;
  parentCount: number;
  existingCount: number;
}

export interface PlanGroup {
  kind: ReclassifyKind;
  total: number;
  ready: number;
  needsLook: number;
  approved: number;
  rejected: number;
  applied: number;
  rows: PlanRow[];
}

/** The review list: every suggestion, grouped by kind. */
export const plan = query({
  args: {},
  handler: async (ctx): Promise<{ groups: PlanGroup[] }> => {
    const { tenantId } = await authorize(ctx);
    const links = (await tenantLinks(ctx, tenantId)).filter(
      (link) => link.role === RECLASSIFY_ROLE,
    );
    const byKind = new Map<ReclassifyKind, PlanGroup>();
    for (const link of links) {
      const meta = parseMetadata(link);
      if (!meta) continue;
      const applied = link.appliedAt != null;
      // Before apply the link points at the dish; after, resolutionNote
      // keeps "dish:<id>" and capsuleId moves to the new record.
      const dishId = (
        applied
          ? (link.resolutionNote?.match(/^dish:(\w+)/)?.[1] ?? link.capsuleId)
          : link.capsuleId
      ) as Id<"dishes">;
      let dishName: string | null = null;
      try {
        const dish = await ctx.db.get(dishId);
        dishName = dish?.name ?? null;
      } catch {
        dishName = null;
      }
      const row: PlanRow = {
        linkId: link._id,
        dishId,
        name: dishName ?? link.externalId,
        kind: meta.kind,
        source: meta.source,
        confidence: meta.confidence,
        ready: meta.ready,
        decision: String(link.decision ?? "suggested"),
        applied,
        outcome: applied ? (link.appliedValues ?? null) : null,
        note:
          !applied && link.resolutionNote?.includes(" failed: ")
            ? link.resolutionNote.replace(/^dish:\w+ failed: /, "")
            : null,
        category: meta.category,
        parentCount: meta.parents.length,
        existingCount:
          (meta.existing.componentId ? 1 : 0) +
          meta.existing.dishTaskIds.length,
      };
      const group = byKind.get(meta.kind) ?? {
        kind: meta.kind,
        total: 0,
        ready: 0,
        needsLook: 0,
        approved: 0,
        rejected: 0,
        applied: 0,
        rows: [],
      };
      group.total += 1;
      if (row.applied) group.applied += 1;
      else if (row.decision === "approved") group.approved += 1;
      else if (row.decision === "rejected") group.rejected += 1;
      else if (row.ready) group.ready += 1;
      else group.needsLook += 1;
      group.rows.push(row);
      byKind.set(meta.kind, group);
    }
    const order = RECLASSIFY_KINDS;
    const groups = [...byKind.values()].sort(
      (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind),
    );
    for (const group of groups) {
      group.rows.sort((a, b) =>
        a.ready === b.ready ? a.name.localeCompare(b.name) : a.ready ? 1 : -1,
      );
    }
    return { groups };
  },
});

/** Approve or reject suggestions. Applied ones are left alone. */
export const decide = mutation({
  args: {
    linkIds: v.array(v.id("externalRecordLinks")),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    /** Optional per-row override of the kind while approving. */
    kind: v.optional(kindValidator),
  },
  handler: async (ctx, args) => {
    const { auth, tenantId } = await authorize(ctx);
    const now = Date.now();
    let changed = 0;
    for (const linkId of args.linkIds) {
      const link = await ctx.db.get(linkId);
      if (
        !link ||
        link.tenantId !== tenantId ||
        link.deletedAt != null ||
        link.role !== RECLASSIFY_ROLE ||
        link.appliedAt != null
      ) {
        continue;
      }
      const meta = parseMetadata(link);
      const patch: Partial<Link> = {
        decision: args.decision,
        decidedByUserId: auth.id,
        decidedAt: now,
        updatedAt: now,
        version: link.version + 1,
      };
      if (args.kind && meta && args.kind !== meta.kind) {
        patch.metadata = JSON.stringify({
          ...meta,
          kind: args.kind,
          source: `person:${auth.id}`,
          confidence: 1,
          ready: true,
          category:
            args.kind === "placeholder" ? PLACEHOLDER_CATEGORY : meta.category,
        } satisfies SuggestionMetadata);
        patch.capsuleEntity = CAPSULE_ENTITY_FOR_KIND[
          args.kind
        ] as Link["capsuleEntity"];
      }
      await ctx.db.patch(linkId, patch);
      changed += 1;
    }
    return { changed };
  },
});

type ApplyOutcome = {
  linkId: Id<"externalRecordLinks">;
  dishId: Id<"dishes">;
  kind: ReclassifyKind;
  outcome: string;
  error?: string;
};

async function liveDishById(ctx: MutationCtx, id: string, tenantId: string) {
  try {
    return liveDish(await ctx.db.get(id as Id<"dishes">), tenantId);
  } catch {
    return null;
  }
}

/** Parents resolved to distinct live, active dishes (two TPP parents can share one dish). */
async function liveParentDishes(
  ctx: MutationCtx,
  tenantId: string,
  meta: SuggestionMetadata,
  exclude: Id<"dishes">,
): Promise<Doc<"dishes">[]> {
  const seen = new Set<string>();
  const dishes: Doc<"dishes">[] = [];
  for (const parent of meta.parents) {
    if (!parent.dishId || seen.has(parent.dishId)) continue;
    seen.add(parent.dishId);
    const dish = await liveDishById(ctx, parent.dishId, tenantId);
    if (!dish || String(dish.status) !== "active" || dish._id === exclude)
      continue;
    dishes.push(dish);
  }
  return dishes;
}

async function backfillCategory(
  ctx: MutationCtx,
  dish: Doc<"dishes">,
  category: string | null,
): Promise<boolean> {
  if (!category || (dish.category ?? "").trim() !== "") return false;
  await ctx.runMutation(api.mutations.Dish_reviseDetails, {
    docId: dish._id,
    name: dish.name,
    description: dish.description ?? undefined,
    category,
    course: dish.course ?? undefined,
    serviceStyle: dish.serviceStyle ?? undefined,
    dietaryTags: dish.dietaryTags ?? undefined,
  });
  return true;
}

async function classifyKind(
  ctx: MutationCtx,
  dish: Doc<"dishes">,
  kind: "food" | "supply" | "service" | "package",
): Promise<boolean> {
  if ((dish.kind as string | undefined) === kind) return false;
  await ctx.runMutation(api.mutations.Dish_classifyKind, {
    docId: dish._id,
    kind,
  });
  return true;
}

async function retireDish(
  ctx: MutationCtx,
  dish: Doc<"dishes">,
  reason: string,
) {
  if (String(dish.status) !== "active") return false;
  await ctx.runMutation(api.mutations.Dish_retire, { docId: dish._id, reason });
  return true;
}

async function applyOne(
  ctx: MutationCtx,
  tenantId: string,
  link: Link,
  meta: SuggestionMetadata,
): Promise<{ outcome: string; capsuleEntity: string; capsuleId: string }> {
  const dish = liveDish(
    await ctx.db.get(link.capsuleId as Id<"dishes">),
    tenantId,
  );
  if (!dish) throw new Error("Dish not found");
  const done: string[] = [];
  const kind = meta.kind;

  if (
    kind === "food" ||
    kind === "supply" ||
    kind === "package" ||
    kind === "service"
  ) {
    if (await classifyKind(ctx, dish, kind)) done.push(`kind=${kind}`);
    if (await backfillCategory(ctx, dish, meta.category))
      done.push(`category=${meta.category}`);
    return {
      outcome: done.join(", ") || "already so",
      capsuleEntity: "dish",
      capsuleId: String(dish._id),
    };
  }

  if (kind === "placeholder") {
    if (await classifyKind(ctx, dish, "food")) done.push("kind=food");
    if (await backfillCategory(ctx, dish, PLACEHOLDER_CATEGORY))
      done.push(`category=${PLACEHOLDER_CATEGORY}`);
    return {
      outcome: done.join(", ") || "already so",
      capsuleEntity: "dish",
      capsuleId: String(dish._id),
    };
  }

  if (kind === "kitchen_batch") {
    // 1. The recipe: the one the TPP import made, a live same-name one, or a new draft.
    let componentId = meta.existing.componentId;
    if (componentId) {
      const component = await ctx.db.get(componentId as Id<"components">);
      if (
        !component ||
        component.tenantId !== tenantId ||
        component.deletedAt != null
      )
        componentId = null;
    }
    if (!componentId) {
      const key = nameKey(dish.name);
      const sameName = (
        await ctx.db
          .query("components")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .collect()
      ).find(
        (c) =>
          c.deletedAt == null &&
          String(c.status) !== "retired" &&
          nameKey(c.name) === key,
      );
      componentId = sameName ? String(sameName._id) : null;
    }
    if (componentId) {
      done.push("recipe already exists");
    } else {
      const created = (await ctx.runMutation(
        api.mutations.Component_createViaDraft,
        {
          name: dish.name,
          yieldQuantity:
            meta.tpp && meta.tpp.yieldQuantity > 0 ? meta.tpp.yieldQuantity : 1,
          yieldUnit: meta.tpp?.yieldUnit ?? "batch",
          category: meta.tpp?.category ?? undefined,
          description: dish.description ?? undefined,
          sourceFingerprint: meta.tpp
            ? `tpp:menu_item:${meta.tpp.sak}`
            : undefined,
          sourceText: meta.sourceText ?? undefined,
        },
      )) as { docId: string };
      componentId = created.docId;
      done.push("recipe drafted");
    }
    // 2. Every live parent dish carries the recipe, whether the recipe is new
    //    or already existed (a retry after a partial failure lands here too).
    let attached = 0;
    for (const parentDish of await liveParentDishes(
      ctx,
      tenantId,
      meta,
      dish._id,
    )) {
      const already = (
        await ctx.db
          .query("dishComponents")
          .withIndex("by_dishId", (q) => q.eq("dishId", parentDish._id))
          .collect()
      ).some((dc) => dc.deletedAt == null && dc.componentId === componentId);
      if (already) continue;
      await ctx.runMutation(api.mutations.DishComponent_createViaAttach, {
        dishId: parentDish._id,
        componentId,
        yieldQuantity: 1,
        sortOrder: 0,
        role: "tpp_recipe_row",
      });
      attached += 1;
    }
    if (attached) done.push(`attached to ${attached} dish(es)`);
    // 3. Only now the duplicate dish row goes.
    if (await retireDish(ctx, dish, `Reclassified as recipe: ${dish.name}`))
      done.push("dish row retired");
    return {
      outcome: done.join(", "),
      capsuleEntity: "component",
      capsuleId: componentId,
    };
  }

  if (kind === "prep_step") {
    // Tasks the TPP import (or an earlier apply) already wrote, by id.
    const known = new Map<string, Doc<"dishTasks">>();
    for (const id of meta.existing.dishTaskIds) {
      const task = await ctx.db.get(id as Id<"dishTasks">);
      // A task retired between planning and apply no longer counts.
      if (
        task &&
        task.tenantId === tenantId &&
        task.deletedAt == null &&
        String(task.status) === "active"
      )
        known.set(String(task._id), task);
    }
    const key = nameKey(dish.name);
    const taskIds: string[] = [];
    const parents = await liveParentDishes(ctx, tenantId, meta, dish._id);
    // Every live parent dish gets exactly one task for this step: a known one
    // under it, a same-name one already under it, or a new one.
    let added = 0;
    for (const parentDish of parents) {
      const mine =
        [...known.values()].find((t) => t.dishId === parentDish._id) ??
        (
          await ctx.db
            .query("dishTasks")
            .withIndex("by_dishId", (q) => q.eq("dishId", parentDish._id))
            .collect()
        ).find(
          (t) =>
            t.deletedAt == null &&
            String(t.status) === "active" &&
            nameKey(t.name) === key,
        );
      if (mine) {
        taskIds.push(String(mine._id));
        continue;
      }
      const created = (await ctx.runMutation(
        api.mutations.DishTask_createViaAdd,
        {
          synchronizePrep: false,
          dishId: parentDish._id,
          name: dish.name,
          category: parentDish.category ?? "Finish at Kitchen",
          taskType: "manual",
          sortOrder: 0,
        },
      )) as { docId: string };
      taskIds.push(created.docId);
      added += 1;
    }
    // Known tasks under dishes this plan could not name as parents still count.
    for (const [id] of known) if (!taskIds.includes(id)) taskIds.push(id);
    if (added) done.push(`added under ${added} dish(es)`);
    if (taskIds.length > added)
      done.push(`already tracked as ${taskIds.length - added} dish task(s)`);
    if (taskIds.length === 0) {
      // TPP names parents but none is a live dish in this catalog: there is
      // nothing to attach the step to, so the row stays and the note says why.
      if (meta.parents.length > 0)
        throw new Error(
          `TPP names ${meta.parents.length} parent dish(es) for this step, but none is a live dish here; the row stays until a parent exists`,
        );
      if (
        await retireDish(
          ctx,
          dish,
          "Prep item with no parent dish in TPP; add it under a dish when needed",
        )
      )
        done.push("dish row retired (no parent dish)");
      return {
        outcome: done.join(", ") || "already retired",
        capsuleEntity: "dish",
        capsuleId: String(dish._id),
      };
    }
    if (
      await retireDish(
        ctx,
        dish,
        `Reclassified as prep step under ${taskIds.length} dish(es)`,
      )
    )
      done.push("dish row retired");
    return {
      outcome: done.join(", "),
      capsuleEntity: "dish_task",
      capsuleId: taskIds[0]!,
    };
  }

  // orphan
  if (
    await retireDish(
      ctx,
      dish,
      "Prep item with no parent dish in TPP; add it under a dish when needed",
    )
  )
    done.push("dish row retired");
  return {
    outcome: done.join(", ") || "already retired",
    capsuleEntity: "dish",
    capsuleId: String(dish._id),
  };
}

/** Apply approved suggestions, at most APPLY_BATCH_LIMIT per call. */
export const apply = mutation({
  args: {
    operationKey: v.string(),
    linkIds: v.array(v.id("externalRecordLinks")),
  },
  handler: async (ctx, args): Promise<{ outcomes: ApplyOutcome[] }> => {
    const { tenantId } = await authorize(ctx);
    if (args.linkIds.length > APPLY_BATCH_LIMIT) {
      throw new Error(`Apply at most ${APPLY_BATCH_LIMIT} rows per call`);
    }
    const receipt = await readMaterializationReceipt<{
      outcomes: ApplyOutcome[];
    }>(ctx, tenantId, RECEIPT_FAMILY, args.operationKey, args);
    if (receipt) return receipt;

    const outcomes: ApplyOutcome[] = [];
    const now = Date.now();
    for (const linkId of args.linkIds) {
      const link = await ctx.db.get(linkId);
      if (
        !link ||
        link.tenantId !== tenantId ||
        link.deletedAt != null ||
        link.role !== RECLASSIFY_ROLE
      )
        continue;
      const meta = parseMetadata(link);
      if (!meta || link.decision !== "approved" || link.appliedAt != null)
        continue;
      const dishId = link.capsuleId as Id<"dishes">;
      try {
        const result = await applyOne(ctx, tenantId, link, meta);
        await ctx.db.patch(linkId, {
          capsuleEntity: result.capsuleEntity as Link["capsuleEntity"],
          capsuleId: result.capsuleId,
          appliedAt: now,
          appliedValues: result.outcome,
          resolutionNote: `dish:${dishId}`,
          updatedAt: now,
          version: link.version + 1,
        });
        outcomes.push({
          linkId,
          dishId,
          kind: meta.kind,
          outcome: result.outcome,
        });
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : String(cause);
        await ctx.db.patch(linkId, {
          resolutionNote: `dish:${dishId} failed: ${error.slice(0, 300)}`,
          updatedAt: now,
          version: link.version + 1,
        });
        outcomes.push({
          linkId,
          dishId,
          kind: meta.kind,
          outcome: "failed",
          error,
        });
      }
    }
    const result = { outcomes };
    await writeMaterializationReceipt(
      ctx,
      tenantId,
      RECEIPT_FAMILY,
      args.operationKey,
      args,
      result,
    );
    return result;
  },
});
