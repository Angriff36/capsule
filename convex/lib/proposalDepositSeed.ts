import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";
import {
  frozenPaymentSchedule,
  proposalPaymentSchedule,
} from "../../src/lib/proposalPaymentSchedule";

/**
 * AC-654: the event's new draft invoice asks for the deposit the client
 * accepted, and its balance reminder follows the accepted due days. Read
 * from the accepted revision (what the client saw); a proposal accepted
 * without one uses its own fields. Only an untouched draft with no deposit
 * yet; never more than the invoice total. Nothing is charged.
 */
export async function applyAcceptedDeposit(
  ctx: MutationCtx,
  event: Doc<"events">,
  proposal: Doc<"proposals">,
): Promise<void> {
  const revision = proposal.acceptedRevisionId
    ? await ctx.db.get(proposal.acceptedRevisionId as Id<"proposalRevisions">)
    : null;
  let frozen: unknown = undefined;
  if (revision && revision.tenantId === proposal.tenantId && revision.snapshot) {
    try {
      frozen = (JSON.parse(revision.snapshot) as { paymentSchedule?: unknown }).paymentSchedule;
    } catch {
      frozen = undefined;
    }
  }
  const schedule =
    frozen !== undefined
      ? frozenPaymentSchedule(frozen)
      : proposalPaymentSchedule({
          total: Number(proposal.total ?? 0),
          depositPercent: proposal.depositPercent,
          balanceDueDaysBefore: proposal.balanceDueDaysBefore,
          eventDate: proposal.eventDate,
        });
  if (!schedule) return;
  const invoices = (
    await ctx.db
      .query("invoices")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect()
  ).filter((row) => row.tenantId === event.tenantId && row.deletedAt == null && row.status !== "voided");
  if (invoices.length !== 1) return;
  const draft = invoices[0];
  if (draft.status !== "draft" || draft.depositAmount != null || draft.depositPaidAt != null) return;
  const total = Number(draft.total ?? 0);
  await TenantSystemCommandRunner.forTenant(ctx, event.tenantId).context.runMutation(
    api.mutations.Invoice_setDeposit,
    {
      docId: draft._id,
      version: draft.version,
      depositAmount: total > 0 ? Math.min(schedule.depositAmount, total) : schedule.depositAmount,
      balanceReminderLeadDays: schedule.balanceDueDaysBefore,
      idempotencyKey: `accepted-proposal-deposit:${draft._id}`,
    },
  );
}
