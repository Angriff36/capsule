import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";

const INVENTORY_ITEM_EVENT_TYPES = new Set([
  "InventoryItemOpened",
  "InventoryStockReceived",
  "InventoryQuantityAdjusted",
  "InventoryRecounted",
  "InventoryTransferredOut",
  "InventoryTransferredIn",
]);

const RESERVATION_EVENT_TYPES = [
  "InventoryReserved",
  "InventoryReservationReleased",
  "InventoryReservationConsumed",
] as const;

export interface InventoryAuditEntry {
  eventId: string;
  eventType: string;
  action: string;
  measure: "on_hand" | "reserved";
  quantityBefore: number;
  quantityAfter: number;
  delta: number;
  unit: string;
  actorId: string | null;
  occurredAt: number;
  reason: string;
  referenceId: string | null;
  /** Readable names for the screen; not part of the history checksum. */
  eventTitle?: string | null;
  actorName?: string | null;
}

/**
 * Public entry point. The generated query owns InventoryItem read policy and
 * tenant authorization; this action only proceeds with the tenant from the
 * authorized item returned by that query.
 */
export const listForItem = action({
  args: { inventoryItemId: v.id("inventoryItems") },
  handler: async (ctx, { inventoryItemId }): Promise<InventoryAuditEntry[]> => {
    const item = await ctx.runQuery(api.queries.getInventoryItem, {
      id: inventoryItemId,
    });
    if (!item) {
      throw new ConvexError(
        "Inventory history is unavailable. Check your workspace access and try again.",
      );
    }

    return ctx.runQuery(internal.inventoryAudit.readForItem, {
      tenantId: item.tenantId,
      inventoryItemId: String(inventoryItemId),
    });
  },
});

/** Internal raw-event read; callers must establish tenant policy first. */
export const readForItem = internalQuery({
  args: { tenantId: v.string(), inventoryItemId: v.string() },
  handler: async (ctx, args): Promise<InventoryAuditEntry[]> => {
    const normalizedId = ctx.db.normalizeId(
      "inventoryItems",
      args.inventoryItemId,
    );
    if (!normalizedId) return [];

    const item = await ctx.db.get(normalizedId);
    if (!item || item.tenantId !== args.tenantId) return [];

    const [itemEvents, ...reservationEventGroups] = await Promise.all([
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", args.inventoryItemId))
        .collect(),
      ...RESERVATION_EVENT_TYPES.map((type) =>
        ctx.db
          .query("manifestEvents")
          .withIndex("by_type", (q) => q.eq("type", type))
          .collect(),
      ),
    ]);

    const directEvents = itemEvents.filter((event) => {
      const payload = eventPayload(event);
      return (
        event.entity === "InventoryItem" &&
        INVENTORY_ITEM_EVENT_TYPES.has(event.type) &&
        payload.tenantId === args.tenantId
      );
    });
    const reservationEvents = reservationEventGroups.flat().filter((event) => {
      const payload = eventPayload(event);
      return (
        payload.tenantId === args.tenantId &&
        payload.inventoryItemId === args.inventoryItemId
      );
    });

    const all = [...directEvents, ...reservationEvents];
    const entries = all
      .map(normalizeEvent)
      .filter((entry): entry is InventoryAuditEntry => entry !== null)
      .sort(
        (left, right) =>
          left.occurredAt - right.occurredAt ||
          left.eventId.localeCompare(right.eventId),
      );

    // Show the event's title and the person's name, not their raw ids.
    const eventIdByEntry = new Map(
      all.map((event) => [
        String(event._id),
        textValue(eventPayload(event).eventId),
      ]),
    );
    const titles = new Map<string, string | null>();
    const names = new Map<string, string | null>();
    for (const entry of entries) {
      const eventRef = eventIdByEntry.get(entry.eventId);
      if (eventRef && !titles.has(eventRef)) {
        const id = ctx.db.normalizeId("events", eventRef);
        const row = id ? await ctx.db.get(id) : null;
        titles.set(
          eventRef,
          row && row.tenantId === args.tenantId ? row.title : null,
        );
      }
      if (entry.actorId && !names.has(entry.actorId)) {
        const person = (
          await ctx.db
            .query("people")
            .withIndex("by_authSubjectId", (q) =>
              q.eq("authSubjectId", entry.actorId),
            )
            .collect()
        ).find((row) => row.tenantId === args.tenantId);
        names.set(
          entry.actorId,
          person ? `${person.givenName} ${person.familyName}`.trim() : null,
        );
      }
      entry.eventTitle = eventRef ? (titles.get(eventRef) ?? null) : null;
      entry.actorName = entry.actorId
        ? (names.get(entry.actorId) ?? null)
        : null;
    }
    return entries;
  },
});

function normalizeEvent(
  event: Doc<"manifestEvents">,
): InventoryAuditEntry | null {
  const payload = eventPayload(event);
  const actorId = textValue(payload.actorId);
  const unit = textValue(payload.unit) ?? "unit";
  const base = {
    eventId: String(event._id),
    eventType: event.type,
    unit,
    actorId,
    occurredAt: event.createdAt,
  };

  if (event.type === "InventoryReserved") {
    const quantity = numberValue(payload.quantity);
    return {
      ...base,
      action: "Reserved",
      measure: "reserved",
      quantityBefore: 0,
      quantityAfter: quantity,
      delta: quantity,
      reason: referenceLabel("Event", payload.eventId),
      referenceId: textValue(payload.inventoryReservationId),
    };
  }

  if (
    event.type === "InventoryReservationReleased" ||
    event.type === "InventoryReservationConsumed"
  ) {
    const quantity = numberValue(payload.quantity);
    const released = event.type === "InventoryReservationReleased";
    return {
      ...base,
      action: released ? "Reservation released" : "Reservation consumed",
      measure: "reserved",
      quantityBefore: quantity,
      quantityAfter: 0,
      delta: -quantity,
      reason: released
        ? textValue(payload.reason) || "Reservation released"
        : referenceLabel("Event", payload.eventId),
      referenceId: textValue(payload.inventoryReservationId),
    };
  }

  // An opening starts from nothing. Older opening events stored the opening
  // amount as the "before" value, which hid it from the running total.
  const quantityBefore =
    event.type === "InventoryItemOpened"
      ? 0
      : numberValue(payload.previousQuantity);
  const quantityAfter = numberValue(payload.quantityOnHand);
  let action: string;
  let reason: string;
  let referenceId: string | null = null;

  switch (event.type) {
    case "InventoryItemOpened":
      action = "Opening balance";
      reason = "Stock line opened";
      break;
    case "InventoryStockReceived":
      action = "Stock received";
      reason = `${formatQuantity(numberValue(payload.receivedQuantity))} ${unit} received`;
      break;
    case "InventoryRecounted":
      action = "Recount";
      reason = "Physical count recorded";
      break;
    case "InventoryTransferredOut":
      action = "Transfer out";
      referenceId = textValue(payload.destinationLocationId);
      reason = referenceLabel("Destination", payload.destinationLocationId);
      break;
    case "InventoryTransferredIn":
      action = "Transfer in";
      referenceId = textValue(payload.sourceLocationId);
      reason = referenceLabel("Source", payload.sourceLocationId);
      break;
    case "InventoryQuantityAdjusted": {
      reason = textValue(payload.reason) || "Quantity adjusted";
      const normalizedReason = reason.trim().toLocaleLowerCase();
      action =
        normalizedReason === "waste"
          ? "Waste"
          : normalizedReason === "reservation consumed"
            ? "Issued"
            : normalizedReason === "returned from event"
              ? "Returned"
              : "Adjustment";
      break;
    }
    default:
      return null;
  }

  return {
    ...base,
    action,
    measure: "on_hand",
    quantityBefore,
    quantityAfter,
    delta: quantityAfter - quantityBefore,
    reason,
    referenceId,
  };
}

function eventPayload(event: Doc<"manifestEvents">): Record<string, unknown> {
  return event.payload && typeof event.payload === "object"
    ? (event.payload as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function referenceLabel(label: string, value: unknown): string {
  const reference = textValue(value);
  return reference ? `${label} ${reference}` : label;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value);
}
