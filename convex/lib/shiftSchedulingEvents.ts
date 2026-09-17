import { ConvexError } from "convex/values";
import { findApprovedTimeOffConflict } from "../../src/lib/timeOff";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

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
