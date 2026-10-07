/**
 * AUTHOR SEAM - what the automation did after one step.
 *
 * A step and every follow-up it set off run in ONE transaction, and that
 * transaction has ONE history row (convex/lib/commandAudit.ts) whose
 * occurredAt..lastOccurredAt holds every event row it wrote. The receipt is
 * read back from those rows: the records of other kinds that the step made
 * or changed, counted by kind, with a link to where each one is worked.
 *
 * The rows are already stored, so the receipt is kept for good: the
 * record's activity area reads it again at any time.
 */
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Most links kept for one kind of record. */
const MAX_LINKS = 25;

export type CascadeGroup = {
  entity: string;
  label: string;
  count: number;
  verb: "created" | "updated";
  href: string | null;
  links: { id: string; href: string }[];
};

export type CascadeReceipt = {
  id: string;
  /** The step's history row; one step has one receipt. */
  stepId: string;
  at: number;
  text: string;
  /** "12 purchase needs created, 1 pack list updated". */
  summary: string;
  actorUserId: string | null;
  groups: CascadeGroup[];
};

/** Where each kind of record is worked. A detail page wins over a list. */
const DETAIL: Record<string, (id: string) => string> = {
  Event: (id) => `/events/${id}`,
  PackList: (id) => `/logistics/pack-lists/${id}`,
  VendorOrder: (id) => `/inventory/orders/${id}`,
  Component: (id) => `/kitchen/components/${id}`,
  Ingredient: (id) => `/kitchen/ingredients/${id}`,
  Dish: (id) => `/kitchen/dishes/${id}`,
  Menu: (id) => `/kitchen/menus/${id}`,
};
const LIST: Record<string, string> = {
  PurchaseNeed: "/inventory/purchasing",
  PurchaseDraft: "/inventory/purchasing",
  IngredientDemand: "/inventory/demand",
  InventoryReservation: "/inventory/stock",
  ProductionBatch: "/kitchen/plan",
  PrepTask: "/kitchen/prep",
  Delivery: "/logistics/deliveries",
  PackListItem: "/logistics/pack-lists",
  VendorOrderLine: "/inventory/orders",
};

/** Bookkeeping rows nobody works by hand; the receipt leaves them out. */
const HIDDEN = new Set([
  "VendorOrderLineDemand",
  "EventIngredientContribution",
  "WeeklyPurchasingConfig",
]);

/** Kitchen words for record kinds whose code names read badly. */
const NAMES: Record<string, string> = {
  PurchaseNeed: "item to buy",
  IngredientDemand: "ingredient amount",
  VendorOrderLine: "order line",
  InventoryReservation: "stock hold",
  EventDish: "dish",
  ProductionBatch: "kitchen batch",
  PrepTask: "prep task",
};

/** "PurchaseNeed" -> "purchase need". */
function words(entity: string): string {
  return entity.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

/** "item to buy" -> "items to buy". */
function pluralName(entity: string, count: number): string {
  const name = NAMES[entity] ?? words(entity);
  const [head, ...rest] = name.split(" to ");
  return [plural(head, count), ...rest].join(" to ");
}

function plural(label: string, count: number): string {
  if (count === 1) return label;
  if (/[^aeiou]y$/.test(label)) return `${label.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/.test(label)) return `${label}es`;
  return `${label}s`;
}

/** "EventApproved" -> "Event approved". */
function plain(type: string): string {
  const text = words(type);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The history row named directly on this event; old unlinked rows stay hidden. */
async function stepFor(
  ctx: QueryCtx,
  tenantId: string,
  row: Doc<"manifestEvents">,
): Promise<Doc<"commandAuditRecords"> | null> {
  const commandAuditId = row.payload.commandAuditId;
  if (typeof commandAuditId !== "string") return null;
  const id = ctx.db.normalizeId("commandAuditRecords", commandAuditId);
  if (!id) return null;
  const step = await ctx.db.get(id);
  if (!step || step.tenantId !== tenantId) return null;
  const eventIds = step.manifestEventIds;
  if (!Array.isArray(eventIds) || !eventIds.includes(String(row._id))) return null;
  return step;
}

async function ownDoc(ctx: QueryCtx, tenantId: string, entityId: string) {
  try {
    const doc = (await ctx.db.get(entityId as Id<TableNames>)) as {
      tenantId?: unknown;
      createdAt?: unknown;
      _creationTime: number;
    } | null;
    return doc && doc.tenantId === tenantId ? doc : null;
  } catch {
    return null;
  }
}

/**
 * The receipt of the step that wrote `trigger`, or null when that step set
 * nothing else off. Only this workspace's records are counted.
 */
export async function cascadeReceiptFor(
  ctx: QueryCtx,
  tenantId: string,
  trigger: Doc<"manifestEvents">,
): Promise<CascadeReceipt | null> {
  const step = await stepFor(ctx, tenantId, trigger);
  if (!step || (step.eventCount ?? 1) <= 1) return null;
  const eventIds = step.manifestEventIds;
  if (!Array.isArray(eventIds)) return null;
  const rows = (
    await Promise.all(
      eventIds
        .filter((id): id is string => typeof id === "string")
        .map(async (id) => {
          const eventId = ctx.db.normalizeId("manifestEvents", id);
          return eventId ? await ctx.db.get(eventId) : null;
        }),
    )
  ).filter((row): row is Doc<"manifestEvents"> => row != null);

  const byEntity = new Map<string, Map<string, boolean>>();
  for (const row of rows) {
    if (row.entityId === trigger.entityId || HIDDEN.has(row.entity)) continue;
    const seen = byEntity.get(row.entity) ?? new Map<string, boolean>();
    if (seen.has(row.entityId)) continue;
    const doc = await ownDoc(ctx, tenantId, row.entityId);
    if (!doc) continue;
    const made =
      typeof doc.createdAt === "number" ? doc.createdAt : doc._creationTime;
    seen.set(row.entityId, made >= (step.occurredAt ?? trigger.createdAt));
    byEntity.set(row.entity, seen);
  }

  const groups: CascadeGroup[] = [];
  for (const [entity, ids] of byEntity) {
    for (const verb of ["created", "updated"] as const) {
      const list = [...ids]
        .filter(([, created]) => created === (verb === "created"))
        .map(([id]) => id);
      if (list.length === 0) continue;
      const detail = DETAIL[entity];
      groups.push({
        entity,
        label: pluralName(entity, list.length),
        count: list.length,
        verb,
        href: detail ? (list.length === 1 ? detail(list[0]) : null) : LIST[entity] ?? null,
        links: detail
          ? list.slice(0, MAX_LINKS).map((id) => ({ id, href: detail(id) }))
          : [],
      });
    }
  }
  if (groups.length === 0) return null;
  groups.sort(
    (a, b) =>
      Number(b.verb === "created") - Number(a.verb === "created") ||
      b.count - a.count,
  );
  return {
    id: String(trigger._id),
    stepId: String(step._id),
    at: trigger.createdAt,
    text: plain(trigger.type),
    summary: groups
      .map((group) => `${group.count} ${group.label} ${group.verb}`)
      .join(", "),
    actorUserId: step.actorUserId ?? null,
    groups,
  };
}
