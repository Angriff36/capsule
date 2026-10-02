/**
 * AUTHOR SEAM — proposed time changes for published shifts (spec §8.4,
 * PL-TIMING AC-430). See convex/lib/shiftTimingProposals.ts.
 *
 * listEventShiftChanges shows the waiting changes for one event.
 * applyShiftTimingChange moves the shift and publishes the person's week
 * again (same generated commands as the roster page), so the person sees the
 * new time and acknowledges again. keepShiftTime leaves the shift as it was
 * and stops asking about those times.
 */
import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";
import {
  readShiftChanges,
  SHIFT_CHANGE_APPLIED,
  SHIFT_CHANGE_ENTITY,
  SHIFT_CHANGE_KEPT,
  SHIFT_CHANGE_PROPOSED,
  waitingProposal,
  type ShiftChangeProposal,
  type ShiftTimes,
} from "./lib/shiftTimingProposals";
import { insertStepEvent } from "./lib/commandAudit";

// Same people who publish the week on the roster page.
const WORKFORCE_MANAGE_ROLES = new Set([
  "workforce_manager",
  "admin",
  "owner",
  "system",
]);

export type WaitingShiftChange = {
  proposalId: string;
  shiftId: string;
  personId: string;
  personName: string;
  role: string;
  acknowledged: boolean;
  from: ShiftTimes;
  to: ShiftTimes;
  proposedAt: number;
};

async function requireManager(ctx: QueryCtx) {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId || !WORKFORCE_MANAGE_ROLES.has(auth.role)) {
    throw new ConvexError(
      "Only a workforce manager can send or keep shift time changes.",
    );
  }
  if (
    orgCapabilityDeniesAction(
      "workforceManageAccess",
      auth.disabledCapabilities,
    )
  ) {
    throw new ConvexError(
      "Workforce is switched off for this organization. Turn it back on under Administration → Permissions.",
    );
  }
  return auth.tenantId;
}

/** Waiting changes for an event; empty for anyone who cannot send them. */
export const listEventShiftChanges = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }): Promise<WaitingShiftChange[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !WORKFORCE_MANAGE_ROLES.has(auth.role)) return [];
    const id = ctx.db.normalizeId("events", eventId);
    const event = id ? await ctx.db.get(id) : null;
    if (!event || event.tenantId !== auth.tenantId) return [];
    const shifts = await ctx.db
      .query("shifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect();
    const waiting: WaitingShiftChange[] = [];
    for (const shift of shifts) {
      if (shift.tenantId !== auth.tenantId) continue;
      const row = waitingProposal(
        await readShiftChanges(ctx, auth.tenantId, String(shift._id)),
        shift,
      );
      if (!row) continue;
      const person = await ctx.db.get(shift.personId);
      waiting.push({
        proposalId: String(row.id),
        shiftId: String(shift._id),
        personId: String(shift.personId),
        personName:
          person && person.tenantId === auth.tenantId
            ? `${person.givenName} ${person.familyName}`.trim()
            : "Staff member",
        role: row.proposal.role,
        acknowledged: row.proposal.acknowledged,
        from: {
          startsAt: shift.startsAt ?? null,
          endsAt: shift.endsAt ?? null,
        },
        to: row.proposal.to,
        proposedAt: row.proposal.proposedAt,
      });
    }
    return waiting.sort((a, b) => a.personName.localeCompare(b.personName));
  },
});

async function loadWaiting(
  ctx: QueryCtx,
  tenantId: string,
  proposalId: string,
) {
  const rowId = ctx.db.normalizeId("manifestEvents", proposalId);
  const row = rowId ? await ctx.db.get(rowId) : null;
  const proposal =
    row &&
    row.entity === SHIFT_CHANGE_ENTITY &&
    row.type === SHIFT_CHANGE_PROPOSED
      ? (row.payload as { tenantId?: string; proposal: ShiftChangeProposal })
      : null;
  if (!proposal || proposal.tenantId !== tenantId) {
    throw new ConvexError("This shift change is not in your workspace.");
  }
  const shift = await ctx.db.get(proposal.proposal.shiftId as Id<"shifts">);
  if (!shift || shift.tenantId !== tenantId) {
    throw new ConvexError("This shift is not in your workspace.");
  }
  const waiting = waitingProposal(
    await readShiftChanges(ctx, tenantId, String(shift._id)),
    shift,
  );
  if (!waiting || String(waiting.id) !== proposalId) {
    throw new ConvexError(
      "This change was already handled or replaced by a newer one. Refresh to see the latest.",
    );
  }
  return { proposal: proposal.proposal, shift };
}

export const applyShiftTimingChange = mutation({
  args: {
    proposalId: v.string(),
    /** The person's week as they will see it (built on the manager's
     * screen, same as publishing the week on the roster page). */
    shiftSummary: v.string(),
  },
  handler: async (ctx, { proposalId, shiftSummary }) => {
    const tenantId = await requireManager(ctx);
    const { proposal, shift } = await loadWaiting(ctx, tenantId, proposalId);
    await ctx.runMutation(api.mutations.Shift_planEventTiming, {
      docId: shift._id,
      version: shift.version,
      ...(proposal.to.startsAt != null
        ? { startsAt: proposal.to.startsAt }
        : {}),
      ...(proposal.to.endsAt != null ? { endsAt: proposal.to.endsAt } : {}),
      eventStaffingSourceIds: proposal.sourceIds,
      role: proposal.role,
    });
    const notice = await ctx.db.get(
      proposal.noticeId as Id<"weeklyScheduleNotices">,
    );
    if (notice && notice.tenantId === tenantId && notice.deletedAt == null) {
      const personShifts = (
        await ctx.db
          .query("shifts")
          .withIndex("by_personId", (q) => q.eq("personId", notice.personId))
          .collect()
      ).filter(
        (row) =>
          row.tenantId === tenantId &&
          row.deletedAt == null &&
          ["scheduled", "started", "completed"].includes(row.status) &&
          typeof row.startsAt === "number" &&
          row.startsAt >= notice.weekStartsAt &&
          row.startsAt < notice.weekEndsAt,
      );
      await ctx.runMutation(
        api.mutations.WeeklyScheduleNotice_republishSchedule,
        {
          docId: notice._id,
          version: notice.version,
          ...(notice.recipientAuthSubjectId
            ? { recipientAuthSubjectId: notice.recipientAuthSubjectId }
            : {}),
          shiftCount: Math.max(personShifts.length, 1),
          shiftSummary,
        },
      );
    }
    await insertStepEvent(ctx, {
      type: SHIFT_CHANGE_APPLIED,
      entity: SHIFT_CHANGE_ENTITY,
      entityId: String(shift._id),
      payload: { tenantId, proposalId, at: Date.now() },
      createdAt: Date.now(),
    });
    return { applied: true };
  },
});

export const keepShiftTime = mutation({
  args: { proposalId: v.string() },
  handler: async (ctx, { proposalId }) => {
    const tenantId = await requireManager(ctx);
    const { shift } = await loadWaiting(ctx, tenantId, proposalId);
    await insertStepEvent(ctx, {
      type: SHIFT_CHANGE_KEPT,
      entity: SHIFT_CHANGE_ENTITY,
      entityId: String(shift._id),
      payload: { tenantId, proposalId, at: Date.now() },
      createdAt: Date.now(),
    });
    return { kept: true };
  },
});
