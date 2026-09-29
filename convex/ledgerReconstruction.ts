// PL-FINANCIAL-RECONSTRUCTION (AC-086, PR05-03): rebuild old invoices from
// the records an import kept, as a preview finance can check.
//
// The preview reads only what the import kept (event, client and money
// links) plus the lines and tax on the Capsule event's own proposal. It
// writes nothing. "Save as checked" keeps the checked preview as one import
// item ("invoice_reconstruction") with who checked it and when. It makes no
// invoice, payment, email or job: old money stays apart from live invoices
// and never starts a reminder or a charge (PR05-08).

import { v } from "convex/values";
import {
  previewLedgerReconstruction,
  type ReconstructedInvoice,
  type ReconstructionEvent,
  type ReconstructionEventDetail,
  type ReconstructionMoneyRow,
} from "../src/lib/ledgerReconstruction";
import type { FinancialRowClass } from "../src/lib/financialRowClass";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getAuthContext, type AppAuthContext } from "./lib/authContext";
import { canRead } from "./search";

export const RECONSTRUCTION_RECORD_TYPE = "invoice_reconstruction";

export interface ReconstructionReview {
  key: string;
  linkId: string;
  checkedAt: number | null;
  checkedBy: string | null;
  /** The balance when it was checked; a different one now means new rows. */
  unpaidBalance: number | null;
}

async function requireFinance(ctx: QueryCtx): Promise<AppAuthContext> {
  const auth = await getAuthContext(ctx);
  // The same people who may see invoices. Saving also needs import access;
  // the import item's own write check enforces that.
  if (!auth.tenantId || !canRead(auth, ["financeAccess", "manageAccess"])) {
    throw new Error(
      "Only finance staff and managers can rebuild old invoices.",
    );
  }
  return auth;
}

function parse<T>(raw: string | undefined | null): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function eventDetail(
  ctx: QueryCtx,
  tenantId: string,
  eventId: string,
): Promise<ReconstructionEventDetail | null> {
  const proposals = (
    await ctx.db
      .query("proposals")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId as Id<"events">))
      .collect()
  ).filter(
    (row) =>
      row.tenantId === tenantId &&
      row.deletedAt == null &&
      row.status !== "superseded",
  );
  const proposal =
    proposals.find((row) => row.status === "accepted") ??
    proposals.sort((a, b) => b._creationTime - a._creationTime)[0];
  if (!proposal) return null;
  const lines = (
    await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", proposal._id))
      .collect()
  )
    .filter(
      (line) =>
        line.tenantId === tenantId &&
        line.deletedAt == null &&
        line.removedAt == null,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((line) => ({ description: line.description, amount: line.amount }));
  return {
    source: `proposal ${proposal.proposalNumber || proposal.title || proposal._id}`,
    lines,
    taxAmount: proposal.taxAmount,
  };
}

async function buildPreview(
  ctx: QueryCtx,
  tenantId: string,
  sourceSystem: string,
): Promise<{
  invoices: ReconstructedInvoice[];
  reviews: ReconstructionReview[];
}> {
  const links = (
    await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).filter(
    (link) =>
      link.deletedAt == null &&
      link.sourceSystem === sourceSystem &&
      link.conflictStatus !== "superseded",
  );
  const clientByContact = new Map(
    links
      .filter((link) => link.recordType === "contact" && link.capsuleId)
      .map((link) => [link.externalId, link.capsuleId]),
  );
  const countedAs = new Map(
    links
      .filter((link) => link.recordType === "payment_transaction")
      .map((link) => [
        link.externalId,
        parse<{ paymentId?: string }>(link.rawSourceData)?.paymentId ?? null,
      ]),
  );

  const events: ReconstructionEvent[] = [];
  const eventDetails: Record<string, ReconstructionEventDetail> = {};
  for (const link of links.filter((row) => row.recordType === "event")) {
    const raw = parse<{
      clientId?: string;
      title?: string;
      startsAt?: number;
      quotedRevenue?: number;
      depositAmount?: number;
    }>(link.rawSourceData);
    const event = link.capsuleId
      ? ((await ctx.db.get(
          link.capsuleId as Id<"events">,
        )) as Doc<"events"> | null)
      : null;
    const liveEvent =
      event && event.tenantId === tenantId && event.deletedAt == null
        ? event
        : null;
    events.push({
      sourceEventId: link.externalId,
      eventId: liveEvent?._id ?? null,
      clientId:
        liveEvent?.clientId ??
        (raw?.clientId ? clientByContact.get(raw.clientId) : null) ??
        null,
      title: liveEvent?.title ?? raw?.title ?? null,
      startsAt: raw?.startsAt ?? null,
      quotedRevenue: raw?.quotedRevenue ?? null,
      depositAmount: raw?.depositAmount ?? null,
    });
    if (liveEvent) {
      const detail = await eventDetail(ctx, tenantId, liveEvent._id);
      if (detail) eventDetails[liveEvent._id] = detail;
    }
  }

  const moneyRows: ReconstructionMoneyRow[] = [];
  for (const link of links.filter((row) => row.recordType === "payment")) {
    const raw = parse<{
      invoiceId?: string;
      eventId?: string;
      amount?: number;
      rowClass?: FinancialRowClass;
      paymentType?: string;
      recordedAt?: number;
      providerTransactionId?: string;
    }>(link.rawSourceData);
    if (!raw || typeof raw.amount !== "number") continue;
    const counted = raw.providerTransactionId
      ? countedAs.get(raw.providerTransactionId)
      : null;
    moneyRows.push({
      rowId: link.externalId,
      invoiceNumber: raw.invoiceId ?? null,
      sourceEventId: raw.eventId ?? null,
      amount: raw.amount,
      rowClass: raw.rowClass ?? "payment",
      paymentType: raw.paymentType ?? null,
      recordedAt: raw.recordedAt ?? null,
      sameMoneyAs: counted && counted !== link.externalId ? counted : null,
    });
  }

  const organization = (
    await ctx.db
      .query("organizations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).find((row) => row.deletedAt == null);
  const code = organization?.defaultCurrencyCode?.trim().toUpperCase();

  const invoices = previewLedgerReconstruction({
    events,
    moneyRows,
    eventDetail: eventDetails,
    companyCurrency: code && code.length === 3 ? code : "USD",
  });
  const reviews = links
    .filter((link) => link.recordType === RECONSTRUCTION_RECORD_TYPE)
    .map((link) => ({
      key: link.externalId,
      linkId: link._id,
      checkedAt: link.decidedAt ?? null,
      checkedBy:
        parse<{ checkedBy?: string }>(link.metadata)?.checkedBy ?? null,
      unpaidBalance:
        parse<{ unpaidBalance?: number | null }>(link.rawSourceData)
          ?.unpaidBalance ?? null,
    }));
  return { invoices, reviews };
}

/** Preview of every old invoice the kept records describe. Writes nothing. */
export const preview = query({
  args: { sourceSystem: v.optional(v.string()) },
  handler: async (ctx, { sourceSystem }) => {
    const auth = await requireFinance(ctx);
    return await buildPreview(ctx, auth.tenantId, sourceSystem ?? "tpp_legacy");
  },
});

/**
 * Keep one checked preview. The preview is worked out again here, so what is
 * kept is what the records say now, not what the screen sent. Saving again
 * replaces the earlier check.
 */
export const saveChecked = mutation({
  args: { key: v.string(), sourceSystem: v.optional(v.string()) },
  handler: async (ctx, { key, sourceSystem }): Promise<{ linkId: string }> => {
    const auth = await requireFinance(ctx);
    const system = sourceSystem ?? "tpp_legacy";
    const { invoices, reviews } = await buildPreview(
      ctx,
      auth.tenantId,
      system,
    );
    const invoice = invoices.find((row) => row.key === key);
    if (!invoice)
      throw new Error("That old invoice is no longer in the records.");
    for (const earlier of reviews.filter((row) => row.key === key)) {
      await ctx.runMutation(api.mutations.ExternalRecordLink_retire, {
        docId: earlier.linkId as Id<"externalRecordLinks">,
      });
    }
    const created = (await ctx.runMutation(
      api.mutations.ExternalRecordLink_createViaLink,
      {
        sourceSystem: system,
        recordType: RECONSTRUCTION_RECORD_TYPE,
        externalId: key,
        capsuleEntity: "invoice",
        capsuleId: `checked:${key}`,
        rawSourceData: JSON.stringify(invoice),
        metadata: JSON.stringify({
          checkedBy: auth.personName ?? auth.id,
        }),
      },
    )) as { docId: Id<"externalRecordLinks"> };
    await ctx.runMutation(api.mutations.ExternalRecordLink_decide, {
      docId: created.docId,
      decision: "approved",
    });
    return { linkId: created.docId };
  },
});
