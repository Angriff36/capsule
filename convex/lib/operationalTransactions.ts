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
        startsAt: v.number(),
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
    for (const row of args.rows)
      await ctx.runMutation(api.mutations.EventTimelineActivity_adjust, row);
    return { adjusted: args.rows.length };
  },
});
