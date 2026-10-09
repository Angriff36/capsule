/**
 * AUTHOR SEAM — past shifts from a Nowsta Time & Attendance export
 * (PL-REPLACEMENT-PROOF, Nowsta history). The file is read in the browser
 * (src/lib/nowstaShiftHistory.ts); this seam finds each row's Capsule event
 * and writes one finished shift per row.
 *
 * History only: `bringIn` writes the Shift and its import link in one
 * transaction and emits no Manifest event, so no reaction runs — no schedule
 * notice, text or phone alert, time-off check or staffing sync. (Shift's one
 * create step, `schedule`, makes a coming shift and announces it; a shift that
 * already happened cannot go through it.) No time entry is made, so old
 * Nowsta hours never reach the time sheet or a payroll file. Only shifts that
 * are over are brought in. A row brought in before is never written twice.
 */
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  getAuthContext,
  requireTenant,
  type AppAuthContext,
} from "./lib/authContext";
import { buildLinkKey } from "./lib/culinaryModel/importMapping";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";

const SOURCE_SYSTEM = "nowsta";
const RECORD_TYPE = "shift";
/** Rows per `match` call; the browser sends a long file in parts. */
export const NOWSTA_MATCH_ROWS = 200;

// The roles that schedule shifts (convex/workforceScheduling.ts).
const WORKFORCE_MANAGER_ROLES = new Set([
  "workforce_manager",
  "admin",
  "owner",
  "system",
]);

const canBringIn = (auth: AppAuthContext) =>
  WORKFORCE_MANAGER_ROLES.has(auth.role) &&
  !orgCapabilityDeniesAction(
    "workforceManageAccess",
    auth.disabledCapabilities,
  );

const norm = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

async function findLink(
  ctx: QueryCtx,
  tenantId: string,
  externalId: string,
): Promise<Doc<"externalRecordLinks"> | null> {
  const linkKey = buildLinkKey({
    sourceSystem: SOURCE_SYSTEM,
    sourceAccount: null,
    recordType: RECORD_TYPE,
    externalId,
    role: null,
    ordinal: 0,
  });
  const rows = await ctx.db
    .query("externalRecordLinks")
    .withIndex("by_linkKey", (q) => q.eq("linkKey", linkKey))
    .collect();
  return (
    rows.find((row) => row.tenantId === tenantId && row.deletedAt == null) ??
    null
  );
}

/**
 * For each row: was it brought in before, and which Capsule events have its
 * event name on its day. Null when the person may not schedule shifts.
 */
export const match = query({
  args: {
    rows: v.array(
      v.object({
        externalId: v.string(),
        dayStart: v.number(),
        dayEnd: v.number(),
        eventName: v.string(),
      }),
    ),
  },
  handler: async (ctx, { rows }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canBringIn(auth)) return null;
    if (rows.length > NOWSTA_MATCH_ROWS) {
      throw new ConvexError(
        `Send at most ${NOWSTA_MATCH_ROWS} rows at a time.`,
      );
    }
    const tenantId = auth.tenantId;
    const days = new Map<string, Promise<Doc<"events">[]>>();
    const eventsOn = (dayStart: number, dayEnd: number) => {
      const key = `${dayStart}-${dayEnd}`;
      let found = days.get(key);
      if (!found) {
        found = ctx.db
          .query("events")
          .withIndex("by_tenantId_and_startsAt", (q) =>
            q
              .eq("tenantId", tenantId)
              .gte("startsAt", dayStart)
              .lt("startsAt", dayEnd),
          )
          .collect();
        days.set(key, found);
      }
      return found;
    };
    const out: Array<{
      externalId: string;
      imported: boolean;
      eventIds: string[];
    }> = [];
    for (const row of rows) {
      const link = await findLink(ctx, tenantId, row.externalId);
      const events = await eventsOn(row.dayStart, row.dayEnd);
      out.push({
        externalId: row.externalId,
        imported: Boolean(link?.capsuleId),
        eventIds: events
          .filter(
            (event) =>
              event.deletedAt == null &&
              norm(event.title) === norm(row.eventName),
          )
          .map((event) => event._id),
      });
    }
    return out;
  },
});

/** Write one past Nowsta shift and its import link. */
export const bringIn = mutation({
  args: {
    externalId: v.string(),
    personId: v.string(),
    eventId: v.string(),
    role: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    actualStartsAt: v.optional(v.number()),
    actualEndsAt: v.optional(v.number()),
    /** The row's columns, as read (pay columns are never sent). */
    rawSourceData: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ shiftId: Id<"shifts">; already: boolean }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!canBringIn(auth)) {
      throw new ConvexError(
        "Only people who schedule shifts can bring in Nowsta shifts.",
      );
    }
    const existing = await findLink(ctx, tenantId, args.externalId);
    if (existing?.capsuleId) {
      return { shiftId: existing.capsuleId as Id<"shifts">, already: true };
    }
    const personId = ctx.db.normalizeId("people", args.personId);
    const person = personId ? await ctx.db.get(personId) : null;
    if (
      !personId ||
      !person ||
      person.tenantId !== tenantId ||
      person.deletedAt != null
    ) {
      throw new ConvexError("This worker is not on the team.");
    }
    const eventId = ctx.db.normalizeId("events", args.eventId);
    const event = eventId ? await ctx.db.get(eventId) : null;
    if (
      !eventId ||
      !event ||
      event.tenantId !== tenantId ||
      event.deletedAt != null
    ) {
      throw new ConvexError("The event for this shift is not found.");
    }
    if (!(args.endsAt > args.startsAt)) {
      throw new ConvexError("This shift's end has to be after its start.");
    }
    const actual =
      args.actualStartsAt != null &&
      args.actualEndsAt != null &&
      args.actualEndsAt >= args.actualStartsAt
        ? { startedAt: args.actualStartsAt, completedAt: args.actualEndsAt }
        : {};
    const now = Date.now();
    if ((actual.completedAt ?? args.endsAt) > now) {
      throw new ConvexError(
        "This shift is still ahead. Plan coming shifts in Capsule.",
      );
    }
    const shiftId = await ctx.db.insert("shifts", {
      tenantId,
      deletedAt: null,
      personId,
      eventId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      role: args.role.trim() || undefined,
      status: "completed",
      scheduledAt: now,
      ...actual,
      eventStaffingSourceIds: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    const linkKey = buildLinkKey({
      sourceSystem: SOURCE_SYSTEM,
      sourceAccount: null,
      recordType: RECORD_TYPE,
      externalId: args.externalId,
      role: null,
      ordinal: 0,
    });
    await ctx.db.insert("externalRecordLinks", {
      tenantId,
      deletedAt: null,
      sourceSystem: SOURCE_SYSTEM,
      recordType: RECORD_TYPE,
      externalId: args.externalId,
      linkKey,
      capsuleEntity: "shift",
      capsuleId: shiftId,
      verified: false,
      rawSourceData: args.rawSourceData,
      conflictStatus: "resolved",
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
    return { shiftId, already: false };
  },
});
