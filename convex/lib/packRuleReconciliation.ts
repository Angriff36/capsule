/**
 * Pack-rule reconciliation (spec §13.2): keeps an event's live pack list in
 * step with every fact that asks for equipment - menu, dish notes, service
 * style, guest count, venue and bar answers, equipment holds.
 *
 * Runs inside the command that changed the fact (operationalEvents.ts) or
 * from the pack list's refresh button. The planner (src/lib/packRules.ts)
 * says what the facts ask for; this writes it through the generated
 * PackListItem commands, one stable line per generation key:
 * - a line nobody touched follows the new amount;
 * - a line whose amount was set by hand, an excluded line and a packed count
 *   stay as they are (the command keeps them);
 * - a line no source asks for any more retires unless something was packed;
 * - kit lines that grow with guests follow the guest count.
 * A replay with the same facts writes nothing.
 */
import { ConvexError } from "convex/values";
import {
  kitLineQuantity,
  planPackLines,
  serializePackSources,
  type PackRentalInput,
  type PackRuleInput,
} from "../../src/lib/packRules";
import { unresolvedReasons } from "../../src/lib/packReadiness";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getAuthContext } from "./authContext";

/** Roles the pack list write policy admits (logistics, kitchen, event, sales
 * access or a manager). Others change facts without touching the list; the
 * list catches up on the next refresh. */
const PACK_WRITE_ROLES = new Set([
  "kitchen_staff", "kitchen_lead", "sales_staff", "event_staff",
  "logistics_staff", "driver", "manager", "kitchen_manager", "sales_manager",
  "event_manager", "inventory_manager", "logistics_manager",
  "workforce_manager", "finance_manager", "admin", "owner", "system",
]);

export function canWritePackLists(role: string): boolean {
  return PACK_WRITE_ROLES.has(role);
}

const LIVE_LIST = new Set(["draft", "packing", "packed", "loaded"]);

type EventRow = Doc<"events">;

function eventFacts(event: EventRow, venue: Doc<"venues"> | null) {
  return {
    barService: event.barService,
    beveragesOnMenu: event.beveragesOnMenu,
    beverageDispensers: event.beverageDispensers,
    beverageTableSetup: event.beverageTableSetup,
    tablesideWater: event.tablesideWater,
    placeSettings: event.placeSettings,
    mangiaDisposables: event.mangiaDisposables,
    servingwareSource: event.servingwareSource,
    servingwareKit: event.servingwareKit,
    linenColorTables: event.linenColorTables,
    guestTableSetup: event.guestTableSetup,
    buffetTableSetup: event.buffetTableSetup,
    appetizerTableSetup: event.appetizerTableSetup,
    eventRentals: event.eventRentals,
    decorKit: event.decorKit,
    scullery: event.scullery,
    powerOnsite: event.powerOnsite,
    waterOnsite: event.waterOnsite,
    handwashing: event.handwashing,
    venueSurface: event.venueSurface,
    tentAndFlooring: event.tentAndFlooring,
    rainPlan: event.rainPlan,
    venueHasStairs: venue?.hasStairs ?? null,
    venuePowerAvailable: venue?.powerAvailable ?? null,
    venueWaterAccess: venue?.waterAccess ?? null,
    venueLoadIn: venue?.loadInInstructions ?? null,
  };
}

async function readRules(ctx: MutationCtx, tenantId: string): Promise<PackRuleInput[]> {
  const rows = await ctx.db.query("packRules")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId)).collect();
  return rows
    .filter((row) => row.deletedAt == null && row.status === "active" && row.definedAt != null)
    .map((row) => ({
      id: row._id,
      trigger: row.trigger,
      dishId: row.dishId ?? null,
      serviceStyleId: row.serviceStyleId ?? null,
      matchFact: row.matchFact ?? null,
      matchText: row.matchText ?? null,
      description: row.description,
      category: row.category,
      unit: row.unit,
      baseQuantity: Number(row.baseQuantity),
      scaleBy: row.scaleBy,
      perUnits: row.perUnits ?? null,
      sparePercent: Number(row.sparePercent ?? 0),
      ownership: row.ownership,
      returnRequired: row.returnRequired !== false,
      returnNote: row.returnNote ?? null,
      requiredCapability: row.requiredCapability === true,
      ruleVersion: Number(row.ruleVersion ?? 1),
    }) as PackRuleInput);
}

async function readRentals(ctx: MutationCtx, event: EventRow): Promise<PackRentalInput[]> {
  const holds = await ctx.db.query("equipmentReservations")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id)).collect();
  const out: PackRentalInput[] = [];
  for (const hold of holds) {
    if (hold.tenantId !== event.tenantId || hold.deletedAt != null) continue;
    if (hold.status !== "reserved" && hold.status !== "checked_out") continue;
    const equipment = await ctx.db.get(hold.equipmentId as Id<"equipments">);
    if (!equipment || equipment.tenantId !== event.tenantId) continue;
    out.push({
      reservationId: hold._id,
      equipmentId: equipment._id,
      name: equipment.name,
      category: equipment.category,
      quantity: Number(hold.quantity),
      ownership: equipment.ownership === "rented" ? "rented" : "owned",
    });
  }
  return out;
}

/** Bring every live pack list of the event up to date with its facts. */
export async function reconcileEventPackRules(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  const auth = await getAuthContext(ctx);
  if (!PACK_WRITE_ROLES.has(auth.role)) return;
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null) return;
  const lists = (await ctx.db.query("packLists")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect())
    .filter((row) => row.tenantId === event.tenantId && row.deletedAt == null &&
      row.openedAt != null && LIVE_LIST.has(row.status));
  if (lists.length === 0) return;
  const venue = event.venueId ? await ctx.db.get(event.venueId) : null;
  const style = event.serviceStyleId
    ? await ctx.db.get(event.serviceStyleId as Id<"serviceStyles">) : null;
  const dishRows = (await ctx.db.query("eventDishes")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect())
    .filter((row) => row.tenantId === event.tenantId && row.deletedAt == null && row.removedAt == null);
  const dishes = [];
  for (const row of dishRows) {
    const dish = await ctx.db.get(row.dishId as Id<"dishes">);
    dishes.push({
      eventDishId: row._id,
      dishId: row.dishId,
      dishName: row.dishName ?? dish?.name ?? "Dish",
      servings: Number(row.quantityServings ?? 0),
      note: row.specialInstructions ?? null,
    });
  }
  const headcount = Number(event.expectedHeadcount ?? 0);
  const plan = planPackLines({
    event: {
      eventId,
      headcount,
      serviceStyleId: event.serviceStyleId ?? null,
      serviceStyleName: style && style.tenantId === event.tenantId ? style.name : null,
      facts: venue && venue.tenantId === event.tenantId ? eventFacts(event, venue) : eventFacts(event, null),
    },
    dishes,
    rules: await readRules(ctx, event.tenantId),
    rentals: await readRentals(ctx, event),
  });
  for (const list of lists) await reconcileList(ctx, list, plan, headcount);
}

async function reconcileList(
  ctx: MutationCtx,
  list: Doc<"packLists">,
  plan: ReturnType<typeof planPackLines>,
  headcount: number,
): Promise<void> {
  // A packed or loaded list still takes new needs (the command reopens
  // packing); a dispatched or cancelled one is history and never reaches here.
  if (list.status === "dispatched" || list.status === "cancelled") return;
  const items = (await ctx.db.query("packListItems")
    .withIndex("by_packListId", (q) => q.eq("packListId", list._id)).collect())
    .filter((row) => row.tenantId === list.tenantId && row.deletedAt == null);
  const byKey = new Map(items.filter((row) => row.generationKey != null)
    .map((row) => [row.generationKey as string, row]));
  const wanted = new Set<string>();
  let reopened = list.status === "draft" || list.status === "packing";
  for (const line of plan) {
    wanted.add(line.key);
    const sourcesJson = serializePackSources(line.sources);
    const row = byKey.get(line.key);
    const args = {
      packListId: list._id,
      generationKey: line.key,
      category: line.category,
      ownership: line.ownership,
      returnRequired: line.returnRequired,
      returnNote: line.returnNote ?? undefined,
      requiredCapability: line.requiredCapability,
      generatedQuantity: line.quantity,
      sourcesJson,
    };
    if (!row) {
      // A new need on a packed or loaded list reopens packing first, the same
      // as a new dish container does.
      if (!reopened) {
        const fresh = await ctx.db.get(list._id);
        await ctx.runMutation(api.mutations.PackList_acknowledgePackingRequirement, {
          docId: list._id, version: fresh?.version, additionalRequired: true,
        });
        reopened = true;
      }
      const created = (await ctx.runMutation(api.mutations.PackListItem_createViaAddItem, {
        packListId: list._id,
        description: line.description,
        requiredQuantity: line.quantity,
        unit: line.unit,
      })) as { docId: Id<"packListItems"> };
      await ctx.runMutation(api.mutations.PackListItem_applyGenerated, {
        ...args, docId: created.docId,
      });
      continue;
    }
    const same = Number(row.generatedQuantity ?? -1) === line.quantity &&
      row.sourcesJson === sourcesJson && row.retiredAt == null &&
      row.category === line.category && (row.returnNote ?? null) === line.returnNote &&
      (row.requiredCapability === true) === line.requiredCapability;
    if (same) continue;
    await ctx.runMutation(api.mutations.PackListItem_applyGenerated, {
      ...args, docId: row._id, version: row.version,
    });
  }
  for (const row of byKey.values()) {
    if (wanted.has(row.generationKey as string) || row.retiredAt != null) continue;
    if (Number(row.generatedQuantity ?? 0) === 0 && row.sourcesJson === "[]") continue;
    await ctx.runMutation(api.mutations.PackListItem_applyGenerated, {
      docId: row._id,
      version: row.version,
      packListId: list._id,
      generationKey: row.generationKey as string,
      category: row.category ?? "other",
      ownership: row.ownership ?? "owned",
      returnRequired: row.returnRequired !== false,
      returnNote: row.returnNote ?? undefined,
      requiredCapability: row.requiredCapability === true,
      generatedQuantity: 0,
      sourcesJson: "[]",
    });
  }
  await syncKitLines(ctx, items, headcount);
}

async function syncKitLines(
  ctx: MutationCtx,
  items: Doc<"packListItems">[],
  headcount: number,
): Promise<void> {
  for (const row of items) {
    if (row.serviceStyleKitItemId == null || row.followsDishServings === false) continue;
    const kit = await ctx.db.get(row.serviceStyleKitItemId as Id<"serviceStyleKitItems">);
    if (!kit || kit.tenantId !== row.tenantId || kit.guestsPerUnit == null) continue;
    const wanted = kitLineQuantity({
      baseQuantity: Number(kit.baseQuantity),
      guestsPerUnit: kit.guestsPerUnit,
      sparePercent: kit.sparePercent ?? null,
    }, headcount);
    if (Number(row.requiredQuantity) === wanted) continue;
    await ctx.runMutation(api.mutations.PackListItem_syncKitGuests, {
      docId: row._id, version: row.version, requiredQuantity: wanted,
    });
  }
}

const EVENT_FACT_CHANGES: Record<string, string[]> = {
  Event: [
    "EventApproved", "EventHeadcountChanged", "EventServiceStyleChanged",
    "EventVenueChanged", "EventSetupNotesUpdated", "EventDaySheetUpdated",
    "EventTaskBreakdownUpdated",
  ],
  EventDish: [
    "EventDishAdded", "EventDishConfirmedFromProposal", "EventDishServingsAdjusted",
    "EventDishInstructionsUpdated", "EventDishRemoved",
  ],
  EquipmentReservation: ["EquipmentReserved", "EquipmentReservationCancelled"],
  PackList: ["PackListOpened"],
};

/** The event whose pack list a command event can change, or null. */
export function packFactEventId(event: {
  entity: string;
  type: string;
  entityId: string;
  payload: Record<string, unknown>;
}): Id<"events"> | null {
  if (!EVENT_FACT_CHANGES[event.entity]?.includes(event.type)) return null;
  const id = event.entity === "Event" ? event.entityId : event.payload.eventId;
  return typeof id === "string" && id.length > 0 ? (id as Id<"events">) : null;
}

/** PackListItem.assignLoad callback: the truck must be on the line's event
 * now (an update command cannot read a NEW relation id). */
export async function validatePackLoadAssignment(
  ctx: MutationCtx,
  itemId: Id<"packListItems">,
): Promise<void> {
  const item = await ctx.db.get(itemId);
  if (!item?.loadAssignmentId) return;
  const list = await ctx.db.get(item.packListId as Id<"packLists">);
  const rig = await ctx.db.get(item.loadAssignmentId as Id<"eventVehicleAssignments">);
  if (!list || !rig || rig.tenantId !== item.tenantId || rig.deletedAt != null ||
    rig.activeEventId !== list.eventId)
    throw new ConvexError("That truck is not on this event. Pick one of the event's trucks.");
}

/** PackList.markPacked callback: refuse while a missing or must-have line
 * has nothing covering it (AC-527/AC-539). Names every such line. */
export async function validatePackReadiness(
  ctx: MutationCtx,
  packListId: Id<"packLists">,
): Promise<void> {
  const list = await ctx.db.get(packListId);
  if (!list) return;
  const items = await ctx.db.query("packListItems")
    .withIndex("by_packListId", (q) => q.eq("packListId", packListId)).collect();
  const reasons = unresolvedReasons(items.filter((row) => row.tenantId === list.tenantId));
  if (reasons.length === 0) return;
  throw new ConvexError(`This pack list can't be marked packed yet. ${reasons.join(" ")}`);
}
