/**
 * AUTHOR SEAM — a packed pack list books a delivery only for a Drop Off event
 * (#377). In catering a "delivery" is the Drop Off service style; a full or
 * limited service event's truck goes on the event rig instead. An event with
 * no service style yet keeps the delivery, so nothing goes missing for events
 * nobody has sorted.
 *
 * Replaces the old `on PackListPacked run Delivery.schedule` reaction, which
 * could not look at the event's style. Same steps: one delivery per pack
 * list, scheduled again when the list is packed again.
 */
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type PackedPayload = {
  packListId?: unknown;
  eventId?: unknown;
  destination?: unknown;
  windowStartsAt?: unknown;
  windowEndsAt?: unknown;
};

/** "Drop Off", "Drop-Off", "dropoff" all count. */
export function isDropOffStyleName(name: string | null | undefined): boolean {
  return (name ?? "").toLowerCase().replace(/[^a-z]/g, "") === "dropoff";
}

/** True when the event is Drop Off or has no service style yet. */
export async function eventTakesDelivery(
  ctx: MutationCtx,
  event: Doc<"events">,
): Promise<boolean> {
  const style = event.serviceStyleId
    ? await ctx.db.get(event.serviceStyleId as Id<"serviceStyles">)
    : null;
  const name =
    style && style.tenantId === event.tenantId
      ? style.name
      : (event.serviceStyleName ?? null);
  if (!name || !name.trim()) return true;
  return isDropOffStyleName(name);
}

export async function scheduleDropOffDelivery(
  ctx: MutationCtx,
  payload: PackedPayload,
): Promise<void> {
  const list = await ctx.db.get(String(payload.packListId) as Id<"packLists">);
  if (!list) return;
  const event = await ctx.db.get(list.eventId as Id<"events">);
  if (!event || event.tenantId !== list.tenantId) return;
  if (!(await eventTakesDelivery(ctx, event))) return;
  const args = {
    packListId: String(payload.packListId),
    eventId: String(payload.eventId),
    destination: String(payload.destination),
    windowStartsAt: Number(payload.windowStartsAt),
    windowEndsAt: Number(payload.windowEndsAt),
  };
  const existing = (
    await ctx.db
      .query("deliveries")
      .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
      .collect()
  )
    .filter((row) => row.deletedAt == null && row.tenantId === list.tenantId)
    .sort((a, b) => (String(a._id) < String(b._id) ? -1 : 1))[0];
  if (existing) {
    await ctx.runMutation(api.mutations.Delivery_schedule, {
      docId: existing._id,
      version: existing.version,
      ...args,
    });
    return;
  }
  await ctx.runMutation(api.mutations.Delivery_createViaSchedule, args);
}
