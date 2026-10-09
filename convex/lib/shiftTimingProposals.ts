/**
 * AUTHOR SEAM — a published shift is a promise to a person (spec §8.4
 * recalculation, PL-TIMING AC-430). When the event timing moves and the
 * person's week was already published (acknowledged or not), the staffing
 * re-plan does not move the shift. It stores a proposed change instead
 * (manifestEvents ledger, entity "ShiftTimingChange"), and a manager applies
 * it through the existing schedule path: the shift moves and the person's
 * week notice is published again, which asks them to acknowledge again.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { insertStepEvent } from "./commandAudit";

export const SHIFT_CHANGE_ENTITY = "ShiftTimingChange";
export const SHIFT_CHANGE_PROPOSED = "ShiftTimingChangeProposed";
export const SHIFT_CHANGE_APPLIED = "ShiftTimingChangeApplied";
export const SHIFT_CHANGE_KEPT = "ShiftTimingChangeKept";

export type ShiftTimes = { startsAt: number | null; endsAt: number | null };

export type ShiftChangeProposal = {
  tenantId: string;
  eventId: string;
  shiftId: string;
  personId: string;
  noticeId: string;
  acknowledged: boolean;
  from: ShiftTimes;
  to: ShiftTimes;
  sourceIds: string[];
  role: string;
  proposedAt: number;
};

export type ShiftChangeRow = {
  id: Id<"manifestEvents">;
  proposal: ShiftChangeProposal;
  /** applied / kept, or null while it waits for a manager. */
  resolution: "applied" | "kept" | null;
};

/** The published week notice that already told this person about the
 * shift, or null when nothing was published for that week. */
export async function publishedNoticeFor(
  ctx: QueryCtx,
  shift: Doc<"shifts">,
): Promise<Doc<"weeklyScheduleNotices"> | null> {
  const at = shift.startsAt;
  if (typeof at !== "number") return null;
  // Only notices for weeks that end after this shift starts.
  const notices = await ctx.db
    .query("weeklyScheduleNotices")
    .withIndex("by_personId_and_weekEndsAt", (q) =>
      q.eq("personId", shift.personId).gt("weekEndsAt", at),
    )
    .collect();
  return (
    notices
      .filter(
        (row) =>
          row.tenantId === shift.tenantId &&
          row.deletedAt == null &&
          row.publishedAt != null &&
          row.weekStartsAt <= at &&
          at < row.weekEndsAt,
      )
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))[0] ?? null
  );
}

/** Every proposal for one shift, oldest first, with its resolution. */
export async function readShiftChanges(
  ctx: QueryCtx,
  tenantId: string,
  shiftId: string,
): Promise<ShiftChangeRow[]> {
  const rows = (
    await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", shiftId))
      .collect()
  ).filter(
    (row) =>
      row.entity === SHIFT_CHANGE_ENTITY &&
      (row.payload as { tenantId?: unknown } | null)?.tenantId === tenantId,
  );
  const resolutions = new Map<string, "applied" | "kept">();
  for (const row of rows) {
    const proposalId = (row.payload as { proposalId?: unknown }).proposalId;
    if (typeof proposalId !== "string") continue;
    if (row.type === SHIFT_CHANGE_APPLIED) resolutions.set(proposalId, "applied");
    if (row.type === SHIFT_CHANGE_KEPT) resolutions.set(proposalId, "kept");
  }
  return rows
    .filter((row) => row.type === SHIFT_CHANGE_PROPOSED)
    .map((row) => ({
      id: row._id,
      proposal: (row.payload as { proposal: ShiftChangeProposal }).proposal,
      resolution: resolutions.get(String(row._id)) ?? null,
    }))
    .sort((a, b) => a.proposal.proposedAt - b.proposal.proposedAt);
}

const sameTimes = (a: ShiftTimes, b: ShiftTimes) =>
  (a.startsAt ?? null) === (b.startsAt ?? null) &&
  (a.endsAt ?? null) === (b.endsAt ?? null);

/**
 * Records a proposed change for a published shift. Asks once: the same new
 * times already waiting, or already kept by a manager, record nothing.
 */
export async function proposeShiftChange(
  ctx: MutationCtx,
  shift: Doc<"shifts">,
  notice: Doc<"weeklyScheduleNotices">,
  to: ShiftTimes & { sourceIds: string[]; role: string },
): Promise<boolean> {
  const history = await readShiftChanges(ctx, shift.tenantId, String(shift._id));
  const latest = history[history.length - 1];
  const target: ShiftTimes = { startsAt: to.startsAt, endsAt: to.endsAt };
  if (
    latest &&
    latest.resolution !== "applied" &&
    sameTimes(latest.proposal.to, target)
  ) {
    return false;
  }
  const now = Date.now();
  const proposal: ShiftChangeProposal = {
    tenantId: shift.tenantId,
    eventId: String(shift.eventId),
    shiftId: String(shift._id),
    personId: String(shift.personId),
    noticeId: String(notice._id),
    acknowledged: notice.acknowledgedAt != null,
    from: { startsAt: shift.startsAt ?? null, endsAt: shift.endsAt ?? null },
    to: target,
    sourceIds: to.sourceIds,
    role: to.role,
    proposedAt: now,
  };
  await insertStepEvent(ctx, {
    type: SHIFT_CHANGE_PROPOSED,
    entity: SHIFT_CHANGE_ENTITY,
    entityId: String(shift._id),
    payload: { tenantId: shift.tenantId, proposal },
    createdAt: now,
  });
  return true;
}

/** The proposal still waiting for this shift: the newest one, unresolved,
 * and not already matching the shift. */
export function waitingProposal(
  history: ShiftChangeRow[],
  shift: Doc<"shifts">,
): ShiftChangeRow | null {
  const latest = history[history.length - 1];
  if (!latest || latest.resolution != null) return null;
  if (shift.status !== "scheduled" || shift.deletedAt != null) return null;
  if (
    sameTimes(latest.proposal.to, {
      startsAt: shift.startsAt ?? null,
      endsAt: shift.endsAt ?? null,
    })
  )
    return null;
  return latest;
}
