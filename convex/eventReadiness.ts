/**
 * AUTHOR SEAM — live Event readiness projection (AC-401 first slice).
 *
 * Readiness is computed on every read from the live child tables — it is never
 * stored on the Event and never gates a command. Any authenticated member of
 * the tenant with a real role may read it (same audience as crew briefing);
 * there is no specialty readiness role. A foreign or missing event returns
 * null without revealing existence.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  projectEventReadiness,
  type EventReadinessFacts,
} from "./lib/eventReadinessProjection";

const live = (row: { deletedAt?: unknown }) => row.deletedAt == null;

async function byEvent(
  ctx: { db: any },
  table: string,
  tenantId: string,
  eventId: string,
): Promise<any[]> {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_eventId", (q: any) => q.eq("eventId", eventId))
    .collect();
  return rows.filter(
    (row: any) => row.tenantId === tenantId && live(row),
  ) as any[];
}

/** A packet issue row is open when its issueJson parses to {status:"open"}. */
function isOpenPacketIssue(row: any): boolean {
  if (typeof row.issueJson !== "string" || row.issueJson.length === 0)
    return false;
  try {
    const parsed = JSON.parse(row.issueJson);
    return (
      !!parsed &&
      typeof parsed === "object" &&
      (parsed as { status?: unknown }).status === "open"
    );
  } catch {
    return false;
  }
}

export const getEventReadiness = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth || auth.role === "anonymous" || !auth.tenantId) return null;
    const tenantId = auth.tenantId;

    const id = ctx.db.normalizeId("events", eventId);
    if (id == null) return null;
    const event: any = await ctx.db.get(id);
    if (!event || event.tenantId !== tenantId || event.deletedAt != null)
      return null;

    const [
      eventDishes,
      eventAssignments,
      prepTasks,
      packLists,
      deliveries,
      purchaseNeeds,
      eventPacketIssues,
      eventCloseouts,
    ] = await Promise.all([
      byEvent(ctx, "eventDishes", tenantId, id),
      byEvent(ctx, "eventAssignments", tenantId, id),
      byEvent(ctx, "prepTasks", tenantId, id),
      byEvent(ctx, "packLists", tenantId, id),
      byEvent(ctx, "deliveries", tenantId, id),
      byEvent(ctx, "purchaseNeeds", tenantId, id),
      byEvent(ctx, "eventPacketIssues", tenantId, id),
      byEvent(ctx, "eventCloseouts", tenantId, id),
    ]);

    const presentId = (value: unknown): string | null => {
      const raw = value == null ? "" : String(value);
      return raw.trim().length > 0 ? raw : null;
    };

    const closeout = eventCloseouts.length > 0 ? eventCloseouts[0] : null;
    const facts: EventReadinessFacts = {
      eventId: id,
      stage: event.stage ?? "",
      clientId: presentId(event.clientId),
      venueId: presentId(event.venueId),
      serviceStyleId: presentId(event.serviceStyleId),
      expectedHeadcount:
        typeof event.expectedHeadcount === "number"
          ? event.expectedHeadcount
          : null,
      quotedPrice:
        typeof event.quotedPrice === "number" ? event.quotedPrice : null,
      hasMenuDishes: eventDishes.some(
        (row: any) => row.deletedAt == null && row.removedAt == null,
      ),
      assignedStaffIds: eventAssignments
        .filter((row: any) => row.status !== "unassigned")
        .map((row: any) => String(row.personId)),
      openPrepTaskIds: prepTasks
        .filter(
          (row: any) =>
            row.status !== "completed" && row.status !== "cancelled",
        )
        .map((row: any) => String(row._id)),
      inFlightPackListIds: packLists
        .filter(
          (row: any) =>
            row.status !== "draft" &&
            row.status !== "dispatched" &&
            row.status !== "cancelled",
        )
        .map((row: any) => String(row._id)),
      inFlightDeliveryIds: deliveries
        .filter(
          (row: any) =>
            row.status !== "delivered" &&
            row.status !== "cancelled" &&
            row.status !== "failed",
        )
        .map((row: any) => String(row._id)),
      openPurchaseNeedIds: purchaseNeeds
        .filter((row: any) => row.status === "open")
        .map((row: any) => String(row._id)),
      openPacketIssueIds: eventPacketIssues
        .filter(isOpenPacketIssue)
        .map((row: any) => String(row._id)),
      closeoutId: closeout ? String(closeout._id) : null,
      closeoutStatus: closeout ? (closeout.status ?? null) : null,
    };

    return projectEventReadiness(facts);
  },
});
