import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * One outside transaction is counted once (PL-ACCOUNTING, BE-15.2-01/04,
 * PR05-07). Runs inside the writing transaction (`handleManifestEvent`), so a
 * refusal rolls the command back.
 *
 * - A provider payment id (Stripe, QuickBooks, TPP ...) belongs to one live
 *   Capsule payment per provider and provider account. Recording or matching
 *   it a second time is refused, so a replayed webhook, a second staff sync or
 *   a double click never makes a second payment.
 * - One Capsule payment is matched by one imported payment row. Matching a
 *   second row to the same payment is refused; the person picks another
 *   payment or retires the first match.
 *
 * Why a seam: a command cannot read its sibling rows and the Convex
 * projection does not enforce `unique`. Both checks are indexed point reads
 * (manifest.config.yaml: `by_tenantId_and_externalPaymentId`,
 * `by_tenantId_and_capsuleId`).
 */
export async function assertProviderPaymentUnused(
  ctx: MutationCtx,
  paymentId: Id<"payments">,
): Promise<void> {
  const payment = await ctx.db.get(paymentId);
  const externalId = payment?.externalPaymentId;
  if (!payment || payment.deletedAt != null || !externalId) return;
  const holders = await ctx.db
    .query("payments")
    .withIndex("by_tenantId_and_externalPaymentId", (q) =>
      q.eq("tenantId", payment.tenantId).eq("externalPaymentId", externalId),
    )
    .take(20);
  const other = holders.find(
    (row) =>
      row._id !== payment._id &&
      row.deletedAt == null &&
      (row.externalSource ?? null) === (payment.externalSource ?? null) &&
      (row.providerAccount ?? null) === (payment.providerAccount ?? null),
  );
  if (other) {
    throw new Error(
      `Outside payment ${externalId} is already on another Capsule payment. Open that payment instead of adding it again.`,
    );
  }
}

/** A reconciliation match (Payment.markMatched) claims its outside payment once. */
export async function assertMatchedPaymentUnclaimed(
  ctx: MutationCtx,
  paymentId: Id<"payments">,
): Promise<void> {
  const payment = await ctx.db.get(paymentId);
  const matchedId = payment?.matchedExternalId;
  if (!payment || payment.deletedAt != null || !matchedId) return;
  const holders = await ctx.db
    .query("payments")
    .withIndex("by_tenantId_and_matchedExternalId", (q) =>
      q.eq("tenantId", payment.tenantId).eq("matchedExternalId", matchedId),
    )
    .take(20);
  const other = holders.find(
    (row) =>
      row._id !== payment._id &&
      row.deletedAt == null &&
      row.reconciliationStatus !== "disputed" &&
      (row.matchedSource ?? null) === (payment.matchedSource ?? null),
  );
  if (other) {
    throw new Error(
      `Outside payment ${matchedId} is already matched to another Capsule payment. One outside payment can be matched once.`,
    );
  }
}

export async function assertImportedPaymentMatchedOnce(
  ctx: MutationCtx,
  linkId: Id<"externalRecordLinks">,
): Promise<void> {
  const link = await ctx.db.get(linkId);
  if (
    !link ||
    link.deletedAt != null ||
    link.recordType !== "payment" ||
    link.capsuleEntity !== "payment" ||
    !link.capsuleId
  ) {
    return;
  }
  const capsuleId = link.capsuleId;
  const holders = await ctx.db
    .query("externalRecordLinks")
    .withIndex("by_tenantId_and_capsuleId", (q) =>
      q.eq("tenantId", link.tenantId).eq("capsuleId", capsuleId),
    )
    .take(20);
  const other = holders.find(
    (row) =>
      row._id !== link._id &&
      row.deletedAt == null &&
      row.recordType === "payment" &&
      row.capsuleEntity === "payment" &&
      row.conflictStatus !== "superseded",
  );
  if (other) {
    throw new Error(
      `This Capsule payment is already matched to imported payment ${other.externalId}. Pick another payment, or undo that match first.`,
    );
  }
}
