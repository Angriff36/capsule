import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";
import {
  InvoiceNumberSequenceStore,
  type InvoiceNumberLedger,
} from "./invoiceNumberSequence";
import { parseAutoInvoiceNumber } from "./invoiceNumberFormat";

/**
 * Keeps invoice numbers unique per tenant. Runs inside the writing
 * transaction (`handleManifestEvent`) on InvoiceIssued and on
 * InvoiceNumberAssigned.
 *
 * Why a seam: the EventApproved cascade proposes `INV-<count + 1>` from a
 * count of the tenant's live invoices, so once an earlier invoice is deleted
 * the next approval repeats a number; the Convex projection does not enforce
 * the manifest's `property unique invoiceNumber`, and a command cannot read
 * its sibling rows.
 *
 * - Auto-minted number (InvoiceIssued without a supplied number): replaced by
 *   the tenant's persisted sequence (`InvoiceNumberSequence.lastNumber + 1`,
 *   floored at the cascade's proposal, skipping any number ever held), through
 *   the governed Invoice.assignNumber command run as the tenant's system role
 *   — the approver is an event/sales user, not finance, and the renumber is a
 *   consequence of the approval they were allowed to make. Two concurrent
 *   issuances both write the sequence row, so Convex OCC serializes them and
 *   the later one mints the next number.
 * - Explicit number (InvoiceIssued with a supplied number, or any
 *   InvoiceNumberAssigned, including a manual Invoice.assignNumber by finance):
 *   rejected when it duplicates a LIVE invoice of the tenant, which rolls the
 *   command back. Otherwise kept as supplied; an explicit `INV-<n>` above the
 *   sequence advances it so later auto numbers skip past it.
 *
 * Every lookup is an indexed point read (`by_tenantId_and_invoiceNumber`,
 * `by_tenantId` on the one-row sequence table); the tenant's invoice history
 * is never scanned. Invoice rows are written only through the governed command.
 */
export async function ensureUniqueInvoiceNumber(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  autoNumbered: boolean,
): Promise<void> {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice || invoice.deletedAt != null) return;
  const number = invoice.invoiceNumber;
  if (typeof number !== "string" || number.length === 0) return;

  const ledger = new IssuedInvoiceNumbers(ctx, invoice);
  const sequence = new InvoiceNumberSequenceStore(
    ctx,
    invoice.tenantId,
    ledger,
  );
  if (autoNumbered) {
    const proposed = parseAutoInvoiceNumber(number) ?? 0;
    const assigned = await sequence.mintNext(proposed);
    if (assigned !== number) await assignNumber(ctx, invoice, assigned);
    return;
  }

  if (await ledger.isHeldLive(number)) {
    throw new Error(
      `Invoice number ${number} is already used by another invoice. Choose a different number.`,
    );
  }
  const explicit = parseAutoInvoiceNumber(number);
  if (explicit !== null) await sequence.advanceTo(explicit);
}

/** Indexed point reads over the tenant's invoice numbers, excluding the one being written. */
class IssuedInvoiceNumbers implements InvoiceNumberLedger {
  constructor(
    private readonly ctx: MutationCtx,
    private readonly issuing: Doc<"invoices">,
  ) {}

  async isHeld(number: string): Promise<boolean> {
    return (await this.holders(number)).length > 0;
  }

  async isHeldLive(number: string): Promise<boolean> {
    return (await this.holders(number)).some((row) => row.deletedAt == null);
  }

  private async holders(number: string) {
    const rows = await this.ctx.db
      .query("invoices")
      .withIndex("by_tenantId_and_invoiceNumber", (q) =>
        q.eq("tenantId", this.issuing.tenantId).eq("invoiceNumber", number),
      )
      .collect();
    return rows.filter((row) => row._id !== this.issuing._id);
  }
}

async function assignNumber(
  ctx: MutationCtx,
  invoice: Doc<"invoices">,
  invoiceNumber: string,
): Promise<void> {
  const numbering = TenantSystemCommandRunner.forTenant(
    ctx,
    invoice.tenantId,
  ).context;
  await numbering.runMutation(api.mutations.Invoice_assignNumber, {
    docId: invoice._id,
    version: invoice.version,
    invoiceNumber,
  });
}
