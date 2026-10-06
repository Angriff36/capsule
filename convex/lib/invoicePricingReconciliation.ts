/**
 * §8.2 invoice reconciliation for Event.changePricing (AC-388 invoice slice):
 * the approved event already carries one unsent draft invoice seeded from the
 * quoted price (invoice.manifest EventApproved cascade). When the price moves,
 * a draft still in that auto-made shape follows the new price through the
 * governed Invoice.followEventPrice command. Anything finance changed or
 * committed stays as it is: a draft with tax, discount, line items, a deposit,
 * a payment or a credit is flagged `invoice_review`; a sent or later invoice is
 * flagged `invoice_change_required` (a sent bill is history, AC-407).
 *
 * Only invoices whose total differs from the new price are in scope. Their
 * id + version are part of the input shape, so replaying the same price after
 * the draft followed is a no-op (nothing differs), and replaying it against an
 * unchanged flagged invoice finds the prior receipt and writes nothing.
 */
import { byLineDisplayOrder } from "../../src/lib/pricing";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";
import { calculateInvoiceTax, type InvoiceLineDraft } from "../../src/features/finance/invoiceTax";
import { LedgerMoney } from "../../src/lib/ledgerMoney";
import { eventReconciliationReceipt } from "./reconciliationReceipt";import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type PricingReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type InvoiceRow = Doc<"invoices">;

const isZero = (value: number | null | undefined) => value == null || Number(value) === 0;

/** True for a draft nobody has touched since the approval cascade made it. */
function followsEventPrice(invoice: InvoiceRow): boolean {
  const lines = invoice.lineItems as unknown;
  return (
    invoice.status === "draft" &&
    invoice.sentAt == null &&
    isZero(invoice.amountPaid) &&
    isZero(invoice.taxAmount) &&
    isZero(invoice.discountAmount) &&
    isZero(invoice.amountCredited) &&
    isZero(invoice.depositAmount) &&
    (lines == null || (Array.isArray(lines) && lines.length === 0))
  );
}

/** Identity + exactly-once receipting for the invoice side of an Event price
 * change. Writes invoices only through Invoice.followEventPrice. */
export class EventInvoicePricingReconciliation {
  /** Runs in the originating Event command's transaction. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: PricingReconcileTrigger,
    quotedPrice: number,
  ): Promise<void> {
    const event = await ctx.db.get(eventId);
    if (!event || event.deletedAt != null) return;
    const invoices = (await ctx.db
      .query("invoices")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as InvoiceRow[];
    const differing = invoices.filter(
      (row) =>
        row.tenantId === event.tenantId &&
        row.deletedAt == null &&
        row.status !== "voided" &&
        Number(row.total) !== quotedPrice,
    );
    if (differing.length === 0) return;
    const windows: TimingWindow[] = [
      { key: "stage:" + event.stage, startsAt: null, endsAt: null },
      { key: "price", startsAt: quotedPrice, endsAt: null },
      ...differing.map((row) => ({
        key: "invoice:" + String(row._id),
        startsAt: row.version,
        endsAt: null,
      })),
    ];
    const checkpoint = eventReconciliationReceipt.windowsCheckpoint(windows);
    const operationKey = eventReconciliationReceipt.operationKey(
      String(eventId),
      "invoice",
      checkpoint,
    );
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;

    let updatedCount = 0;
    const unresolved: ReconciliationReceiptOutput["unresolved"] = [];
    for (const invoice of differing) {
      if (followsEventPrice(invoice)) {
        // The command reads the event's price itself (AC-372).
        await ctx.runMutation(api.mutations.Invoice_followEventPrice, {
          docId: invoice._id,
          version: invoice.version,
        });
        updatedCount += 1;
        continue;
      }
      unresolved.push({
        code: invoice.status === "draft" ? "invoice_review" : "invoice_change_required",
        recordIds: [String(invoice._id)],
      });
    }
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["invoice"],
      createdCount: 0,
      updatedCount,
      retiredCount: 0,
      preservedCount: unresolved.length,
      exceptionCount: 0,
      unresolved,
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventInvoicePricingReconciliation = new EventInvoicePricingReconciliation();

/** Stages in which an event is booked and should carry its draft invoice. */
const INVOICED_STAGES = new Set(["approved", "sales_lock", "executing", "final", "completed"]);

/**
 * AC-618: an approved event with a quoted price above zero has exactly one
 * unsent draft invoice. Runs in the approving (or re-pricing) transaction.
 * A zero price makes nothing; any invoice already on the event (even a voided
 * one) means nothing more is made, so a retry or replay never adds a second.
 * The accepted proposal and its revision are recorded as the money's source.
 * Written through the governed Invoice.issue as the workspace's system role,
 * auto-numbered, and never sent.
 */
export async function ensureEventDraftInvoice(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  const event = await ctx.db.get(eventId);
  if (!event || event.deletedAt != null || !INVOICED_STAGES.has(event.stage)) return;
  const quotedPrice = Number(event.quotedPrice ?? 0);
  if (!(quotedPrice > 0)) return;
  const existing = await ctx.db
    .query("invoices")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  if (existing.some((row) => row.tenantId === event.tenantId && row.deletedAt == null)) return;
  const source = await acceptedProposalFor(ctx, event);
  await TenantSystemCommandRunner.forTenant(ctx, event.tenantId).context.runMutation(
    api.mutations.Invoice_createViaIssue,
    {
      clientId: event.clientId,
      eventId,
      invoiceSequence: 0,
      subtotal: quotedPrice,
      taxAmount: 0,
      discountAmount: 0,
      total: quotedPrice,
      ...(source
        ? {
            proposalId: String(source._id),
            ...(source.acceptedRevisionId
              ? { proposalRevisionId: String(source.acceptedRevisionId) }
              : {}),
          }
        : {}),
      idempotencyKey: `event-draft-invoice:${eventId}`,
    },
  );
}

/**
 * The client accepted a proposal booked onto an event: the event's quoted
 * price becomes the accepted total, so the money pages and the untouched
 * draft invoice show what the client agreed to. Only while the price can
 * still change (planning to approved); later stages keep their own process.
 */
export async function followAcceptedProposalPrice(
  ctx: MutationCtx,
  proposalId: Id<"proposals">,
): Promise<void> {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal?.eventId || proposal.status !== "accepted") return;
  const event = await ctx.db.get(proposal.eventId);
  if (!event || event.deletedAt != null || event.tenantId !== proposal.tenantId) return;
  if (!["planning", "pending_approval", "approved"].includes(event.stage)) return;
  const total = Number(proposal.total ?? 0);
  if (!(total > 0)) return;
  const system = TenantSystemCommandRunner.forTenant(ctx, event.tenantId).context;
  if (Number(event.quotedPrice ?? 0) !== total) {
    await system.runMutation(api.mutations.Event_changePricing, {
      docId: event._id,
      budgetAmount: Number(event.budgetAmount ?? 0),
      quotedPrice: total,
      idempotencyKey: `accepted-proposal-price:${proposalId}`,
    });
  }
  // The auto-made single-amount draft nobody touched becomes an itemized,
  // taxed invoice from what the client accepted. It was never sent or paid.
  const invoices = (
    await ctx.db
      .query("invoices")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect()
  ).filter((row) => row.tenantId === event.tenantId && row.deletedAt == null && row.status !== "voided");
  if (invoices.length !== 1) return;
  const draft = (await ctx.db.get(invoices[0]._id)) as InvoiceRow;
  if (!followsEventPrice(draft)) return;
  const itemized = await itemizedFromProposal(ctx, proposal);
  if (!itemized) return;
  await system.runMutation(api.mutations.Invoice_markVoided, {
    docId: draft._id,
    version: draft.version,
    reason: "Replaced by the itemized invoice from the accepted proposal.",
  });
  // A due date from the client's payment terms, so reminders can run.
  const client = event.clientId ? await ctx.db.get(event.clientId) : null;
  const termsDays = Number(client?.paymentTermsDays ?? 30);
  await system.runMutation(api.mutations.Invoice_createViaIssue, {
    clientId: event.clientId,
    eventId: event._id,
    invoiceSequence: 0,
    ...itemized,
    paymentTermsDays: termsDays,
    dueDate: Date.now() + termsDays * 24 * 60 * 60_000,
    proposalId: String(proposal._id),
    ...(proposal.acceptedRevisionId ? { proposalRevisionId: String(proposal.acceptedRevisionId) } : {}),
    idempotencyKey: `accepted-proposal-invoice:${proposalId}`,
  });
}

/**
 * Invoice lines and tax from an accepted proposal's priced lines, worked out
 * with the same calculation the issue form and the issue check use.
 */
async function itemizedFromProposal(ctx: MutationCtx, proposal: Doc<"proposals">) {
  const lines = (
    await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", proposal._id))
      .collect()
  )
    .filter((row) => row.tenantId === proposal.tenantId && row.deletedAt == null && row.removedAt == null)
    .sort(byLineDisplayOrder);
  if (lines.length === 0) return null;
  const guests = Number(proposal.guestCount ?? 0);
  const drafts: InvoiceLineDraft[] = lines.map((row, index) => {
    const amount = Number(row.amount) || 0;
    const category = row.equipmentId ? "rental" : row.pricingBasis === "per_person" || row.pricingBasis === "per_unit" ? "food" : "service";
    const perGuest = row.pricingBasis === "per_person" && guests > 0;
    const perUnit = row.pricingBasis === "per_unit" && Number(row.quantity) > 0;
    return {
      id: String(index),
      description: row.description,
      category,
      quantity: perGuest ? guests : perUnit ? Number(row.quantity) : 1,
      unitPrice: perGuest || perUnit ? Number(row.unitPrice) || 0 : amount,
    };
  });
  const client = await ctx.db.get(proposal.clientId as Id<"clients">);
  const taxExempt = client?.tenantId === proposal.tenantId && client.taxExempt === true;
  const rates = await ctx.db
    .query("taxRates")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", proposal.tenantId))
    .collect();
  const worked = calculateInvoiceTax(drafts, rates, taxExempt);
  const discount = Number(proposal.discountAmount ?? 0);
  return {
    subtotal: worked.subtotal,
    taxAmount: worked.taxAmount,
    discountAmount: discount,
    total: LedgerMoney.fromDollars(worked.subtotal)
      .add(LedgerMoney.fromDollars(worked.taxAmount))
      .subtract(LedgerMoney.fromDollars(discount))
      .toDollars(),
    lineItems: worked.lineItems,
    taxBreakdown: worked.taxBreakdown,
  };
}

/** The newest accepted proposal booked onto this event, if any. */
async function acceptedProposalFor(ctx: MutationCtx, event: Doc<"events">) {
  const proposals = await ctx.db
    .query("proposals")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .collect();
  return (
    proposals
      .filter(
        (p) => p.tenantId === event.tenantId && p.deletedAt == null && p.status === "accepted",
      )
      .sort((a, b) => b._creationTime - a._creationTime)[0] ?? null
  );
}

/**
 * On first issue: a named proposal must be this workspace's, for this client
 * (and this event when both have one); a named revision must be a captured
 * revision of that proposal. Otherwise the issue rolls back.
 */
export async function assertInvoiceCommercialSource(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
): Promise<void> {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice || invoice.deletedAt != null) return;
  const notFound = new Error(
    "The proposal named as this invoice's source was not found for this client.",
  );
  if (invoice.proposalRevisionId != null && invoice.proposalId == null) throw notFound;
  if (invoice.proposalId == null) return;
  const proposalId = ctx.db.normalizeId("proposals", invoice.proposalId);
  const proposal = proposalId ? await ctx.db.get(proposalId) : null;
  if (
    !proposal ||
    proposal.deletedAt != null ||
    proposal.tenantId !== invoice.tenantId ||
    proposal.clientId !== invoice.clientId ||
    (invoice.eventId != null && proposal.eventId != null && proposal.eventId !== invoice.eventId)
  )
    throw notFound;
  if (invoice.proposalRevisionId == null) return;
  const revisionId = ctx.db.normalizeId("proposalRevisions", invoice.proposalRevisionId);
  const revision = revisionId ? await ctx.db.get(revisionId) : null;
  if (
    !revision ||
    revision.deletedAt != null ||
    revision.capturedAt == null ||
    revision.tenantId !== invoice.tenantId ||
    revision.proposalId !== proposal._id
  )
    throw notFound;
}
