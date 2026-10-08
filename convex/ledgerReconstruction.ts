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
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
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

// The same people who may see invoices. Saving also needs import access;
// the import item's own write check enforces that.
async function financeAuth(
  ctx: QueryCtx | ActionCtx,
): Promise<AppAuthContext | null> {
  const auth = await getAuthContext(ctx);
  return auth.tenantId && canRead(auth, ["financeAccess", "manageAccess"])
    ? auth
    : null;
}

async function requireFinance(
  ctx: QueryCtx | ActionCtx,
): Promise<AppAuthContext> {
  const auth = await financeAuth(ctx);
  if (!auth) {
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

/** The kinds of kept records the rebuild reads, in the order it reads them. */
const RECORD_TYPES = [
  "contact",
  "payment_transaction",
  "event",
  "payment",
  RECONSTRUCTION_RECORD_TYPE,
] as const;
type RecordType = (typeof RECORD_TYPES)[number];

/** One kept record, cut down to what the rebuild needs. */
type KeptRow =
  | { kind: "contact"; externalId: string; capsuleId: string }
  | {
      kind: "payment_transaction";
      externalId: string;
      paymentId: string | null;
    }
  | {
      kind: "event";
      event: ReconstructionEvent;
      /** The old client id, matched to a Capsule client once every page is read. */
      oldClientId: string | null;
      detail: ReconstructionEventDetail | null;
    }
  | {
      kind: "payment";
      row: ReconstructionMoneyRow;
      providerTransactionId: string | null;
    }
  | { kind: "review"; review: ReconstructionReview };

// Event rows also read the Capsule event and its proposal, so fewer per page.
const PAGE_SIZE: Record<RecordType, number> = {
  contact: 1000,
  payment_transaction: 1000,
  event: 100,
  payment: 500,
  [RECONSTRUCTION_RECORD_TYPE]: 1000,
};

/**
 * One page of one kind of kept record. Reading every kept record of the
 * company in one call went past the per-call read limit, so the rebuild
 * reads them page by page.
 */
export const keptRecordsPage = internalQuery({
  args: {
    tenantId: v.string(),
    sourceSystem: v.string(),
    recordType: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (
    ctx,
    { tenantId, sourceSystem, recordType, cursor },
  ): Promise<{ rows: KeptRow[]; isDone: boolean; continueCursor: string }> => {
    const type = recordType as RecordType;
    const page = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_recordType", (q) =>
        q.eq("tenantId", tenantId).eq("recordType", type),
      )
      .paginate({ numItems: PAGE_SIZE[type] ?? 500, cursor });
    const links = page.page.filter(
      (link) =>
        link.deletedAt == null &&
        link.sourceSystem === sourceSystem &&
        link.conflictStatus !== "superseded",
    );
    const rows: KeptRow[] = [];
    for (const link of links) {
      if (type === "contact") {
        if (link.capsuleId)
          rows.push({
            kind: "contact",
            externalId: link.externalId,
            capsuleId: link.capsuleId,
          });
      } else if (type === "payment_transaction") {
        rows.push({
          kind: "payment_transaction",
          externalId: link.externalId,
          paymentId:
            parse<{ paymentId?: string }>(link.rawSourceData)?.paymentId ??
            null,
        });
      } else if (type === "event") {
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
        rows.push({
          kind: "event",
          event: {
            sourceEventId: link.externalId,
            eventId: liveEvent?._id ?? null,
            clientId: liveEvent?.clientId ?? null,
            title: liveEvent?.title ?? raw?.title ?? null,
            startsAt: raw?.startsAt ?? null,
            quotedRevenue: raw?.quotedRevenue ?? null,
            depositAmount: raw?.depositAmount ?? null,
          },
          oldClientId: raw?.clientId ?? null,
          detail: liveEvent
            ? await eventDetail(ctx, tenantId, liveEvent._id)
            : null,
        });
      } else if (type === "payment") {
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
        rows.push({
          kind: "payment",
          row: {
            rowId: link.externalId,
            invoiceNumber: raw.invoiceId ?? null,
            sourceEventId: raw.eventId ?? null,
            amount: raw.amount,
            rowClass: raw.rowClass ?? "payment",
            paymentType: raw.paymentType ?? null,
            recordedAt: raw.recordedAt ?? null,
            sameMoneyAs: null,
          },
          providerTransactionId: raw.providerTransactionId ?? null,
        });
      } else {
        rows.push({
          kind: "review",
          review: {
            key: link.externalId,
            linkId: link._id,
            checkedAt: link.decidedAt ?? null,
            checkedBy:
              parse<{ checkedBy?: string }>(link.metadata)?.checkedBy ?? null,
            unpaidBalance:
              parse<{ unpaidBalance?: number | null }>(link.rawSourceData)
                ?.unpaidBalance ?? null,
          },
        });
      }
    }
    return { rows, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

/** The company's own currency code, when it has a good one. */
export const companyCurrency = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }): Promise<string | null> => {
    const organization = (
      await ctx.db
        .query("organizations")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    ).find((row) => row.deletedAt == null);
    const code = organization?.defaultCurrencyCode?.trim().toUpperCase();
    return code && code.length === 3 ? code : null;
  },
});

async function buildPreview(
  ctx: ActionCtx,
  tenantId: string,
  sourceSystem: string,
): Promise<{
  invoices: ReconstructedInvoice[];
  reviews: ReconstructionReview[];
}> {
  const kept: KeptRow[] = [];
  for (const recordType of RECORD_TYPES) {
    let cursor: string | null = null;
    for (;;) {
      const page: {
        rows: KeptRow[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.ledgerReconstruction.keptRecordsPage, {
        tenantId,
        sourceSystem,
        recordType,
        cursor,
      });
      kept.push(...page.rows);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
  }

  const clientByContact = new Map<string, string>();
  const countedAs = new Map<string, string | null>();
  for (const row of kept) {
    if (row.kind === "contact")
      clientByContact.set(row.externalId, row.capsuleId);
    if (row.kind === "payment_transaction")
      countedAs.set(row.externalId, row.paymentId);
  }
  const events: ReconstructionEvent[] = [];
  const eventDetails: Record<string, ReconstructionEventDetail> = {};
  const moneyRows: ReconstructionMoneyRow[] = [];
  const reviews: ReconstructionReview[] = [];
  for (const row of kept) {
    if (row.kind === "event") {
      events.push({
        ...row.event,
        clientId:
          row.event.clientId ??
          (row.oldClientId ? clientByContact.get(row.oldClientId) : null) ??
          null,
      });
      if (row.event.eventId && row.detail)
        eventDetails[row.event.eventId] = row.detail;
    } else if (row.kind === "payment") {
      const counted = row.providerTransactionId
        ? countedAs.get(row.providerTransactionId)
        : null;
      moneyRows.push({
        ...row.row,
        sameMoneyAs: counted && counted !== row.row.rowId ? counted : null,
      });
    } else if (row.kind === "review") {
      reviews.push(row.review);
    }
  }

  const code = await ctx.runQuery(
    internal.ledgerReconstruction.companyCurrency,
    { tenantId },
  );
  const invoices = previewLedgerReconstruction({
    events,
    moneyRows,
    eventDetail: eventDetails,
    companyCurrency: code ?? "USD",
  });
  return { invoices, reviews };
}

/**
 * Preview of every old invoice the kept records describe. Writes nothing.
 * Null for people who may not see invoices, so the screen hides the section.
 * It is an action because it reads the kept records page by page.
 */
export const preview = action({
  args: { sourceSystem: v.optional(v.string()) },
  handler: async (
    ctx,
    { sourceSystem },
  ): Promise<{
    invoices: ReconstructedInvoice[];
    reviews: ReconstructionReview[];
  } | null> => {
    const auth = await financeAuth(ctx);
    if (!auth) return null;
    return await buildPreview(ctx, auth.tenantId, sourceSystem ?? "tpp_legacy");
  },
});

/** Keep one checked invoice; an earlier check of the same invoice is retired. */
export const keepCheck = internalMutation({
  args: {
    key: v.string(),
    sourceSystem: v.string(),
    invoice: v.string(),
    checkedBy: v.string(),
  },
  handler: async (
    ctx,
    { key, sourceSystem, invoice, checkedBy },
  ): Promise<{ linkId: Id<"externalRecordLinks"> }> => {
    const auth = await requireFinance(ctx);
    const earlier = (
      await ctx.db
        .query("externalRecordLinks")
        .withIndex("by_tenantId_and_recordType", (q) =>
          q
            .eq("tenantId", auth.tenantId)
            .eq("recordType", RECONSTRUCTION_RECORD_TYPE),
        )
        .collect()
    ).filter(
      (link) =>
        link.externalId === key &&
        link.deletedAt == null &&
        link.sourceSystem === sourceSystem &&
        link.conflictStatus !== "superseded",
    );
    for (const link of earlier) {
      await ctx.runMutation(api.mutations.ExternalRecordLink_retire, {
        docId: link._id,
      });
    }
    const created = (await ctx.runMutation(
      api.mutations.ExternalRecordLink_createViaLink,
      {
        sourceSystem,
        recordType: RECONSTRUCTION_RECORD_TYPE,
        externalId: key,
        capsuleEntity: "invoice",
        capsuleId: `checked:${key}`,
        rawSourceData: invoice,
        metadata: JSON.stringify({ checkedBy }),
      },
    )) as { docId: Id<"externalRecordLinks"> };
    await ctx.runMutation(api.mutations.ExternalRecordLink_decide, {
      docId: created.docId,
      decision: "approved",
    });
    return { linkId: created.docId };
  },
});

/**
 * Keep one checked preview. The preview is worked out again here, so what is
 * kept is what the records say now, not what the screen sent. Saving again
 * replaces the earlier check.
 */
export const saveChecked = action({
  args: { key: v.string(), sourceSystem: v.optional(v.string()) },
  handler: async (ctx, { key, sourceSystem }): Promise<{ linkId: string }> => {
    const auth = await requireFinance(ctx);
    const system = sourceSystem ?? "tpp_legacy";
    const { invoices } = await buildPreview(ctx, auth.tenantId, system);
    const invoice = invoices.find((row) => row.key === key);
    if (!invoice)
      throw new Error("That old invoice is no longer in the records.");
    return await ctx.runMutation(internal.ledgerReconstruction.keepCheck, {
      key,
      sourceSystem: system,
      invoice: JSON.stringify(invoice),
      checkedBy: auth.personName ?? auth.id,
    });
  },
});
