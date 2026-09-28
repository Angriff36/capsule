import { ConvexError } from "convex/values";
import { findApprovedTimeOffConflict } from "../../src/lib/timeOff";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { readCrewWindow } from "./eventStaffingOperations";

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * CF-9.1 guards for NEW staffing (assign, post, claim, fill), run inside the
 * generated command's transaction so a refusal writes nothing:
 * - a cancelled event cannot be staffed;
 * - a finished event can only be staffed with a written reason (recording who
 *   worked after the fact) - only an assignment carries one;
 * - approved time off over the work window is refused, naming the person.
 * A double booking on another event is NOT refused; the roster shows it.
 */
export async function validateNewEventStaffing(
  ctx: MutationCtx,
  entity: "EventAssignment" | "EventStaffNeed",
  id: string,
  personId: Id<"people"> | undefined,
): Promise<void> {
  const row =
    entity === "EventAssignment"
      ? await ctx.db.get(id as Id<"eventAssignments">)
      : await ctx.db.get(id as Id<"eventStaffNeeds">);
  if (!row) return;
  const event = await ctx.db.get(row.eventId);
  if (!event) return;
  if (event.stage === "cancelled")
    throw new ConvexError(
      `${event.title} is cancelled, so no one can be staffed on it.`,
    );
  if (event.stage === "completed" || event.stage === "closed_out") {
    const reason =
      "overrideReason" in row ? row.overrideReason?.trim() : undefined;
    if (!reason)
      throw new ConvexError(
        `${event.title} has already finished. To record who worked it, give a reason.`,
      );
    return;
  }
  if (!personId) return;
  const follows =
    row.followsEventTiming ?? (row.startsAt == null && row.endsAt == null);
  const window = follows
    ? await readCrewWindow(ctx, row.eventId, row)
    : { startsAt: row.startsAt ?? null, endsAt: row.endsAt ?? null };
  if (window.startsAt == null || window.endsAt == null) return;
  const requests = await ctx.db
    .query("timeOffRequests")
    .withIndex("by_personId", (q) => q.eq("personId", personId))
    .collect();
  const away = findApprovedTimeOffConflict(
    requests.filter((request) => request.tenantId === row.tenantId),
    { personId, startsAt: window.startsAt, endsAt: window.endsAt },
  );
  if (!away) return;
  const person = await ctx.db.get(personId);
  const name = person
    ? `${person.givenName} ${person.familyName}`.trim()
    : "This person";
  throw new ConvexError(
    `${name} has approved time off from ${day.format(away.startsAt!)} through ${day.format(away.endsAt! - 1)}, during ${event.title}. Pick someone else or change the times.`,
  );
}

/**
 * Cross-row scheduling check inside the generated command's transaction.
 *
 * Shift.schedule owns its prerequisites and writes. Until the projection can
 * hydrate nested time-off collections (#75), its event callback supplies this
 * read. Throwing rolls back the Shift, event receipt and idempotency receipt
 * for React, HTTP, MCP and nested generated-command callers alike.
 */
export async function validateScheduledShift(
  ctx: MutationCtx,
  shiftId: Id<"shifts">,
): Promise<void> {
  const shift = await validateShiftWindow(ctx, shiftId);
  const { personId, startsAt, endsAt } = shift;
  const requests = await ctx.db.query("timeOffRequests")
    .withIndex("by_personId", (q) => q.eq("personId", personId)).collect();
  if (findApprovedTimeOffConflict(
    requests.filter((row) => row.tenantId === shift.tenantId),
    { personId, startsAt: startsAt!, endsAt: endsAt! },
  )) {
    throw new ConvexError(
      "This shift overlaps approved time off. Choose another staff member or adjust the shift.",
    );
  }
}

/** Unknown planning dates are allowed; non-finite or reversed dates are not. */
export async function validateShiftWindow(
  ctx: MutationCtx,
  shiftId: Id<"shifts">,
  allowIncomplete = false,
) {
  const shift = await ctx.db.get(shiftId);
  if (!shift) throw new Error("Scheduled shift not found");
  const { startsAt, endsAt } = shift;
  if (
    (!allowIncomplete && (startsAt == null || endsAt == null)) ||
    (startsAt != null && !Number.isFinite(startsAt)) ||
    (endsAt != null && !Number.isFinite(endsAt)) ||
    (startsAt != null && endsAt != null && endsAt <= startsAt)
  ) {
    throw new ConvexError("Shift end must be after its start.");
  }
  return shift;
}
