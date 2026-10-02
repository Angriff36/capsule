// PL-CONNECTIONS (AC-113, AC-114, AC-121): what the Google Calendar connection
// is doing, in the words a manager needs. Read side only; the steps live in
// convex/googleCalendar.ts.
//
// - "Connected" is not "in step": a fresh connect says it is waiting for its
//   first sync until a full run comes back clean (AC-113).
// - Last SUCCESSFUL sync and last attempt are separate answers.
// - Backlog = events that belong on the calendar and are not there yet, plus
//   the events whose last send failed (each one can be retried by itself).
// - The event page asks only about its own event (AC-121).
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { eventInCalendarBasis } from "./lib/googleCalendarBasis";
import {
  CALENDAR_ELIGIBLE_STAGES,
  CALENDAR_EVENT_ENTITY,
  CONNECTION_ENTITY,
  asRecord,
  canManage,
  latestActiveConnection,
  parseSyncState,
  type EventSyncState,
} from "./googleCalendar";

export type CalendarHealthState =
  | "not_connected"
  | "waiting_first_sync"
  | "in_step"
  | "needs_attention"
  | "needs_reconnect";

export interface CalendarFailedEvent {
  eventId: string;
  title: string;
  startsAt: number | null;
  error: string;
  at: number;
}

export interface CalendarHealth {
  state: CalendarHealthState;
  lastSuccessfulSyncAt: number | null;
  lastAttemptAt: number | null;
  basis: {
    startsFrom: number;
    includePast: boolean;
    fieldsOwnedByCapsule: string[];
  } | null;
  scopes: string | null;
  waitingCount: number;
  failed: CalendarFailedEvent[];
  canManage: boolean;
}

function belongsOnCalendar(event: Doc<"events">): boolean {
  return (
    event.deletedAt == null &&
    CALENDAR_ELIGIBLE_STAGES.has(String(event.stage)) &&
    event.startsAt != null &&
    event.endsAt != null
  );
}

export const connectionHealth = query({
  args: {},
  handler: async (ctx): Promise<CalendarHealth> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
      .collect();
    const connection = latestActiveConnection(rows);
    const empty: CalendarHealth = {
      state: "not_connected",
      lastSuccessfulSyncAt: null,
      lastAttemptAt: null,
      basis: null,
      scopes: null,
      waitingCount: 0,
      failed: [],
      canManage: canManage(auth.role),
    };
    if (!connection) return empty;

    const runs = rows
      .filter(
        (row) =>
          row.entity === CONNECTION_ENTITY &&
          row.type === "GoogleCalendarReconciled" &&
          asRecord(row.payload).connectionId === connection.connectionId,
      )
      .sort((left, right) => right.createdAt - left.createdAt);
    const lastAttempt = runs[0] ?? null;
    const lastSuccess =
      runs.find((row) => asRecord(row.payload).status === "ok") ?? null;

    const [events, syncRows] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("manifestEvents")
        .withIndex("by_entity", (q) => q.eq("entity", CALENDAR_EVENT_ENTITY))
        .collect(),
    ]);
    const latestByEvent = new Map<string, EventSyncState>();
    for (const row of syncRows.sort(
      (left, right) => right.createdAt - left.createdAt,
    )) {
      if (asRecord(row.payload).tenantId !== tenantId) continue;
      const state = parseSyncState(row.payload);
      if (state && !latestByEvent.has(state.eventId)) {
        latestByEvent.set(state.eventId, state);
      }
    }

    let waitingCount = 0;
    const failed: CalendarFailedEvent[] = [];
    for (const event of events) {
      const eventId = String(event._id);
      const state = latestByEvent.get(eventId);
      if (state?.status === "failed") {
        failed.push({
          eventId,
          title: event.title,
          startsAt: event.startsAt ?? null,
          error: state.error ?? "Google Calendar did not accept it.",
          at: state.syncedAt,
        });
        continue;
      }
      if (!belongsOnCalendar(event)) continue;
      const managed = state != null && state.status !== "deleted";
      if (
        !managed &&
        !eventInCalendarBasis(connection.basis, event.endsAt as number)
      ) {
        continue;
      }
      if (
        state?.status !== "synced" ||
        state.connectionId !== connection.connectionId
      ) {
        waitingCount += 1;
      }
    }
    failed.sort((left, right) => right.at - left.at);

    const lastStatus = String(asRecord(lastAttempt?.payload).status ?? "");
    const state: CalendarHealthState =
      lastStatus === "needs_reconnect"
        ? "needs_reconnect"
        : failed.length > 0 || lastStatus === "partial"
          ? "needs_attention"
          : lastSuccess == null
            ? "waiting_first_sync"
            : "in_step";

    return {
      state,
      lastSuccessfulSyncAt: lastSuccess?.createdAt ?? null,
      lastAttemptAt: lastAttempt?.createdAt ?? null,
      basis: connection.basis
        ? {
            startsFrom: connection.basis.startsFrom,
            includePast: connection.basis.includePast,
            fieldsOwnedByCapsule: connection.basis.fieldsOwnedByCapsule,
          }
        : null,
      scopes: connection.scopes,
      waitingCount,
      failed: failed.slice(0, 50),
      canManage: canManage(auth.role),
    };
  },
});

/**
 * AC-121: the calendar answer for one event. Null when Google Calendar is not
 * connected or Capsule never tried to send this event. A failed send shows on
 * the event until a later send succeeds.
 */
export const eventSyncMarker = query({
  args: { eventId: v.id("events") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    status: "synced" | "deleted" | "failed";
    error: string | null;
    at: number;
    canRetry: boolean;
  } | null> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    const tenantRows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
      .collect();
    if (!latestActiveConnection(tenantRows)) return null;
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", String(args.eventId)))
      .collect();
    const latest = rows
      .filter(
        (row) =>
          row.entity === CALENDAR_EVENT_ENTITY &&
          asRecord(row.payload).tenantId === tenantId,
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    const state = latest ? parseSyncState(latest.payload) : null;
    if (!state) return null;
    return {
      status: state.status,
      error: state.error,
      at: state.syncedAt,
      canRetry: canManage(auth.role),
    };
  },
});
