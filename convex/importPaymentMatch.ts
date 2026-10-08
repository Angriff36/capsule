// PL-ACCOUNTING (PR05-07, CF-6.4-02, BE-15.2-04/05): match imported payment
// rows to Capsule payments.
//
// One match writes three things in one transaction, as the signed-in person:
// the import row points at the payment (ExternalRecordLink.updateCapsuleId),
// the payment records the outside id it was matched to (Payment.markMatched),
// and the row leaves the queue (ExternalRecordLink.resolveConflict). The
// seam in convex/lib/paymentAccounting.ts refuses a second row on the same
// payment and a second payment on the same outside id, so nothing is ever
// counted twice.
//
// `matchSameIdPayments` only matches rows whose id is already on exactly one
// payment. Rows that merely look similar (same amount, near date) are never
// matched here; a person picks them one by one with `matchImportedPayment`.

import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  paymentMatchCandidates,
  readImportedPayment,
  type MatchablePayment,
} from "../src/lib/paymentMatchCandidates";

type PaymentSource =
  "tpp_legacy" | "quickbooks_online" | "nowsta" | "stripe" | "manual" | "other";

const PAYMENT_SOURCE: Record<string, PaymentSource> = {
  tpp_legacy: "tpp_legacy",
  quickbooks_online: "quickbooks_online",
  stripe: "stripe",
};

const MAX_ROWS_PER_RUN = 500;

function isOpenPaymentRow(link: Doc<"externalRecordLinks">): boolean {
  return (
    link.deletedAt == null &&
    link.recordType === "payment" &&
    link.capsuleEntity === "payment" &&
    link.conflictStatus === "pending_conflict" &&
    !link.capsuleId
  );
}

async function applyMatch(
  ctx: MutationCtx,
  link: Doc<"externalRecordLinks">,
  paymentId: Id<"payments">,
  note: string,
): Promise<void> {
  await ctx.runMutation(api.mutations.ExternalRecordLink_updateCapsuleId, {
    docId: link._id,
    capsuleId: String(paymentId),
  });
  await ctx.runMutation(api.mutations.Payment_markMatched, {
    docId: paymentId,
    source: PAYMENT_SOURCE[link.sourceSystem] ?? "other",
    externalPaymentId: link.externalId,
    notes: note,
  });
  await ctx.runMutation(api.mutations.ExternalRecordLink_resolveConflict, {
    docId: link._id,
    conflictStatus: "resolved",
    resolutionNote: note,
  });
}

/** A person matches one imported payment row to the payment they chose. */
export const matchImportedPayment = mutation({
  args: {
    linkId: v.id("externalRecordLinks"),
    paymentId: v.id("payments"),
  },
  handler: async (ctx, { linkId, paymentId }): Promise<void> => {
    const auth = await getAuthContext(ctx);
    const link = await ctx.db.get(linkId);
    if (!link || !auth.tenantId || link.tenantId !== auth.tenantId) {
      throw new Error("Import item not found");
    }
    if (!isOpenPaymentRow(link)) {
      throw new Error("This imported payment is already matched or closed.");
    }
    const payment = await ctx.db.get(paymentId);
    if (
      !payment ||
      payment.tenantId !== auth.tenantId ||
      payment.deletedAt != null
    ) {
      throw new Error("Pick one of your payments.");
    }
    await applyMatch(
      ctx,
      link,
      paymentId,
      `Matched by hand to imported payment ${link.externalId}`,
    );
  },
});

async function paymentsWithId(
  ctx: MutationCtx,
  tenantId: string,
  id: string,
): Promise<Doc<"payments">[]> {
  const own = await ctx.db
    .query("payments")
    .withIndex("by_tenantId_and_externalPaymentId", (q) =>
      q.eq("tenantId", tenantId).eq("externalPaymentId", id),
    )
    .take(10);
  const matched = await ctx.db
    .query("payments")
    .withIndex("by_tenantId_and_matchedExternalId", (q) =>
      q.eq("tenantId", tenantId).eq("matchedExternalId", id),
    )
    .take(10);
  return [...own, ...matched];
}

async function isPaymentTaken(
  ctx: MutationCtx,
  tenantId: string,
  paymentId: string,
): Promise<boolean> {
  const holders = await ctx.db
    .query("externalRecordLinks")
    .withIndex("by_tenantId_and_capsuleId", (q) =>
      q.eq("tenantId", tenantId).eq("capsuleId", paymentId),
    )
    .take(20);
  return holders.some(
    (row) =>
      row.deletedAt == null &&
      row.recordType === "payment" &&
      row.capsuleEntity === "payment" &&
      row.conflictStatus !== "superseded",
  );
}

/**
 * Matches every waiting imported payment whose id is already on exactly one
 * Capsule payment. Look-alikes are left for a person.
 */
export const matchSameIdPayments = mutation({
  // One press works one page of the imported payment rows; `cursor` (from
  // the last press) carries on where it stopped. Reading every import row
  // of the company at once went past the per-call read limit.
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (
    ctx,
    { cursor },
  ): Promise<{
    matched: number;
    left: number;
    more: boolean;
    cursor: string | null;
  }> => {
    const auth = await getAuthContext(ctx);
    const tenantId = auth.tenantId;
    if (!tenantId) throw new Error("Sign in to a workspace first.");
    const page = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_capsuleEntity", (q) =>
        q.eq("tenantId", tenantId).eq("capsuleEntity", "payment"),
      )
      .paginate({ numItems: MAX_ROWS_PER_RUN, cursor: cursor ?? null });
    const rows = page.page.filter(isOpenPaymentRow);

    let matched = 0;
    for (const link of rows) {
      const facts = readImportedPayment(link);
      const found = new Map<string, Doc<"payments">>();
      for (const id of [facts.externalId, facts.providerTransactionId]) {
        if (!id) continue;
        for (const payment of await paymentsWithId(ctx, tenantId, id))
          found.set(String(payment._id), payment);
      }
      if (found.size === 0) continue;
      const taken = new Set<string>();
      for (const id of found.keys())
        if (await isPaymentTaken(ctx, tenantId, id)) taken.add(id);
      const { exactPaymentId } = paymentMatchCandidates(
        facts,
        [...found.values()].map((payment): MatchablePayment => ({
          ...payment,
          _id: String(payment._id),
        })),
        taken,
      );
      if (!exactPaymentId) continue;
      await applyMatch(
        ctx,
        link,
        exactPaymentId as Id<"payments">,
        `Matched by the same id ${link.externalId}`,
      );
      matched += 1;
    }
    return {
      matched,
      left: rows.length - matched,
      more: !page.isDone,
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});
