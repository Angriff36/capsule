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
  const shift = await ctx.db.get(shiftId);
  if (!shift) throw new Error("Scheduled shift not found");
  const { personId, startsAt, endsAt } = shift;
  if (
    startsAt == null || endsAt == null ||
    !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt
  ) {
    throw new ConvexError("Shift end must be after its start.");
  }
  const requests = await ctx.db.query("timeOffRequests")
    .withIndex("by_personId", (q) => q.eq("personId", personId)).collect();
  if (findApprovedTimeOffConflict(
    requests.filter((row) => row.tenantId === shift.tenantId),
    { personId, startsAt, endsAt },
  )) {
    throw new ConvexError(
      "This shift overlaps approved time off. Choose another staff member or adjust the shift.",
    );
  }
}
