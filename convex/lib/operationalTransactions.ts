import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { getAuthContext, requireTenant } from "./authContext";
import {
  readMaterializationReceipt,
  writeMaterializationReceipt,
} from "./materializationReceipt";
import { orgCapabilityDeniesAction } from "./orgCapabilityGate";
import { materializeCateringPackage, type CateringPackageResult } from "./cateringPackageOperations";

export const applyCateringPackage = mutation({
  args: {
    eventId: v.id("events"),
    packageId: v.string(),
    operationKey: v.string(),
    selections: v.array(v.object({ recipeId: v.string(), servings: v.number(), notes: v.string() })),
    serviceStartsAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CateringPackageResult> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireMenuAccess(auth);
    return materializeCateringPackage(ctx, tenantId, args);
  },
});

const MANAGE_ROLES = new Set([
  "admin",
  "event_manager",
  "finance_manager",
  "inventory_manager",
  "kitchen_manager",
  "logistics_manager",
  "manager",
  "owner",
  "sales_manager",
  "system",
  "workforce_manager",
]);
const INVENTORY_ROLES = new Set([
  "admin",
  "inventory_manager",
  "inventory_staff",
  "kitchen_manager",
  "owner",
  "system",
]);
const EVENT_MANAGE_ROLES = new Set([
  "admin",
  "event_manager",
  "owner",
  "system",
]);

function permits(
  auth: Awaited<ReturnType<typeof getAuthContext>>,
  action: "inventoryAccess" | "eventManageAccess" | "manageAccess",
) {
  const roles =
    action === "inventoryAccess"
      ? INVENTORY_ROLES
      : action === "eventManageAccess"
        ? EVENT_MANAGE_ROLES
        : MANAGE_ROLES;
  return (
    roles.has(auth.role) &&
    !orgCapabilityDeniesAction(action, auth.disabledCapabilities)
  );
}

function requireStockIssueAccess(
  auth: Awaited<ReturnType<typeof getAuthContext>>,
) {
  if (
    !(permits(auth, "inventoryAccess") || permits(auth, "eventManageAccess")) ||
    !(permits(auth, "inventoryAccess") || permits(auth, "manageAccess"))
  )
    throw new Error("Inventory and event management access required");
}

function requireMenuAccess(auth: Awaited<ReturnType<typeof getAuthContext>>) {
  if (!permits(auth, "manageAccess"))
    throw new Error("Management access required");
}

export const issueEventStock = mutation({
  args: {
    eventId: v.id("events"),
    reservationId: v.id("inventoryReservations"),
    reservationVersion: v.number(),
    operationKey: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireStockIssueAccess(auth);
    type Output = {
      reservationId: Id<"inventoryReservations">;
      consumedQuantity: number;
      consumedForIngredient: number;
      fulfilledDemandId: Id<"ingredientDemands"> | null;
      recovered?: boolean;
    };
    const recovered = await readMaterializationReceipt<Output>(
      ctx,
      tenantId,
      "eventStockIssue",
      args.operationKey,
      args,
    );
    if (recovered) return { ...recovered, recovered: true };
    const reservation = await ctx.db.get(args.reservationId);
    if (
      !reservation ||
      reservation.tenantId !== tenantId ||
      reservation.eventId !== args.eventId
    )
      throw new Error("InventoryReservation not found");
    const item = await ctx.db.get(reservation.inventoryItemId);
    if (
      !item ||
      item.tenantId !== tenantId ||
      item.ingredientId !== reservation.ingredientId
    )
      throw new Error("Inventory item does not match the reservation");
    const demands = await ctx.db
      .query("ingredientDemands")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();
    const demand = demands.find(
      (row) =>
        row.tenantId === tenantId &&
        row.ingredientId === reservation.ingredientId &&
        row.deletedAt == null &&
        (row.status === "calculated" || row.status === "confirmed"),
    );
    const reservations = await ctx.db
      .query("inventoryReservations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();
    const consumedQuantity = reservations
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.ingredientId === reservation.ingredientId &&
          row.deletedAt == null &&
          (row.status === "consumed" || row._id === reservation._id),
      )
      .reduce((sum, row) => sum + row.quantity, 0);
    await ctx.runMutation(api.mutations.InventoryReservation_consume, {
      docId: reservation._id,
      version: args.reservationVersion,
    });
    let fulfilledDemandId: Id<"ingredientDemands"> | null = null;
    if (
      demand &&
      consumedQuantity + Number.EPSILON >= demand.requiredQuantity
    ) {
      if (demand.status === "calculated")
        await ctx.runMutation(api.mutations.IngredientDemand_confirm, {
          docId: demand._id,
          version: demand.version,
        });
      const currentDemand = await ctx.db.get(demand._id);
      if (!currentDemand || currentDemand.tenantId !== tenantId)
        throw new Error("IngredientDemand not found after confirmation");
      await ctx.runMutation(api.mutations.IngredientDemand_fulfill, {
        docId: currentDemand._id,
        version: currentDemand.version,
      });
      fulfilledDemandId = currentDemand._id;
    }
    const output: Output = {
      reservationId: reservation._id,
      consumedQuantity: reservation.quantity,
      consumedForIngredient: consumedQuantity,
      fulfilledDemandId,
    };
    await writeMaterializationReceipt(
      ctx,
      tenantId,
      "eventStockIssue",
      args.operationKey,
      args,
      output,
    );
    return output;
  },
});

export const materializeEventMenuTemplate = mutation({
  args: {
    eventId: v.id("events"),
    operationKey: v.string(),
    lines: v.array(
      v.object({
        dishId: v.id("dishes"),
        quantityServings: v.number(),
        course: v.optional(v.string()),
        serviceStyle: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireMenuAccess(auth);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.tenantId !== tenantId || event.deletedAt != null)
      throw new Error("Event not found");
    for (const line of args.lines) {
      const dish = await ctx.db.get(line.dishId);
      if (!dish || dish.tenantId !== tenantId || dish.deletedAt != null)
        throw new Error("Dish not found");
    }
    type Output = {
      savedDishIds: string[];
      appliedDishIds: string[];
      savedDemandVersions: Record<string, number>;
      savedCount: number;
      requestedCount: number;
      recovered?: boolean;
    };
    const prior = await readMaterializationReceipt<Output>(
      ctx,
      tenantId,
      "eventMenuTemplate",
      args.operationKey,
      args,
    );
    if (prior) return { ...prior, recovered: true };
    const savedDishIds: string[] = [];
    for (let index = 0; index < args.lines.length; index++) {
      const line = args.lines[index];
      const created = await ctx.runMutation(
        api.mutations.EventDish_createViaAddToEvent,
        {
          eventId: args.eventId,
          dishId: line.dishId,
          quantityServings: line.quantityServings,
          headcountOverride: 0,
          course: line.course,
          serviceStyle: line.serviceStyle,
        },
      );
      savedDishIds.push(String(created.docId));
    }
    const savedDemandVersions = Object.fromEntries(
      (
        await ctx.db
          .query("ingredientDemands")
          .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
          .collect()
      )
        .filter(
          (demand) => demand.tenantId === tenantId && demand.deletedAt == null,
        )
        .map((demand) => [String(demand._id), demand.version]),
    );
    const output: Output = {
      savedDishIds,
      appliedDishIds: args.lines.map((line) => String(line.dishId)),
      savedDemandVersions,
      savedCount: savedDishIds.length,
      requestedCount: args.lines.length,
    };
    await writeMaterializationReceipt(
      ctx,
      tenantId,
      "eventMenuTemplate",
      args.operationKey,
      args,
      output,
    );
    return output;
  },
});

export const reorderEventTimeline = mutation({
  args: {
    eventId: v.id("events"),
    rows: v.array(
      v.object({
        docId: v.id("eventTimelineActivities"),
        startsAt: v.optional(v.number()),
        endsAt: v.optional(v.number()),
        sortOrder: v.number(),
        version: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const live = (
      await ctx.db
        .query("eventTimelineActivities")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect()
    ).filter(
      (row) =>
        row.tenantId === tenantId &&
        row.deletedAt == null &&
        row.scheduledAt != null,
    );
    if (
      live.length !== args.rows.length ||
      new Set(args.rows.map((row) => String(row.docId))).size !== live.length
    )
      throw new Error(
        "Timeline reorder must include every current event activity",
      );
    const liveIds = new Set(live.map((row) => String(row._id)));
    if (args.rows.some((row) => !liveIds.has(String(row.docId))))
      throw new Error("Timeline activity not found for this event");
    const liveById = new Map(live.map((row) => [String(row._id), row]));
    for (const row of args.rows) {
      const prior = liveById.get(String(row.docId))!;
      await ctx.runMutation(api.mutations.EventTimelineActivity_adjust, {
        ...row,
        // A reorder that retains times is not a time edit. This also keeps
        // ordering usable for historical rows with an invalid old window.
        startsAt: (row.startsAt ?? null) === (prior.startsAt ?? null) ? undefined : row.startsAt,
        endsAt: (row.endsAt ?? null) === (prior.endsAt ?? null) ? undefined : row.endsAt,
      });
    }
    return { adjusted: args.rows.length };
  },
});

/** One transaction: a failed block must not leave an unusable partial run. */
export const scheduleEventTimeline = mutation({
  args: {
    eventId: v.id("events"),
    operationKey: v.string(),
    plans: v.array(v.object({
      idempotencyKey: v.string(),
      name: v.string(),
      startsAt: v.optional(v.number()),
      endsAt: v.optional(v.number()),
      category: v.optional(v.string()),
      notes: v.optional(v.string()),
      responsibleParty: v.optional(v.string()),
      assigneeTeams: v.optional(v.array(v.string())),
    })),
  },
  handler: async (ctx, args): Promise<{ created: number; existing: number }> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const event = await ctx.runQuery(api.queries.getEvent, { id: args.eventId });
    if (!event) throw new Error("Event not found");
    const live = (await ctx.db.query("eventTimelineActivities")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).collect())
      .filter((row) => row.tenantId === tenantId && row.deletedAt == null && row.scheduledAt != null);
    const identity = (row: { name?: string | null; category?: string | null }) =>
      JSON.stringify([row.name?.trim().toLowerCase(), row.category?.trim().toLowerCase() ?? ""]);
    const existing = new Set(live.map(identity));
    let sortOrder = live.reduce((max, row) => Math.max(max, row.sortOrder ?? 0), -1) + 1;
    let created = 0;
    let reused = 0;
    for (const plan of args.plans) {
      const key = identity(plan);
      if (existing.has(key)) {
        reused++;
        continue;
      }
      await ctx.runMutation(api.mutations.EventTimelineActivity_createViaSchedule, {
        ...plan,
        eventId: args.eventId,
        idempotencyKey: `${args.operationKey}:${plan.idempotencyKey}`,
        sortOrder: sortOrder++,
      });
      existing.add(key);
      created++;
    }
    return { created, existing: reused };
  },
});
