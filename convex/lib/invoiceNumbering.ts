import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

/**
 * Keeps invoice numbers unique per tenant. Runs on InvoiceIssued, inside the
 * issuing transaction (`handleManifestEvent`).
 *
 * Why a seam: the EventApproved cascade mints `INV-<count + 1>` from a count
 * of the tenant's live invoices, so once an earlier invoice is deleted the
 * next approval repeats a number; the Convex projection does not enforce the
 * manifest's `property unique invoiceNumber`, and a command cannot read its
 * sibling rows. Two approvals in the same instant read the same count too —
 * Convex serializes the two transactions, so the second one runs this seam
 * after the first has committed and sees the duplicate. (Reads of the
 * tenant's invoices are part of the transaction's read set, so a concurrent
 * commit of a sibling invoice retries this one rather than racing it.)
 *
 * - Auto-minted duplicate (no explicit number supplied): re-minted to one
 *   past the highest `INV-<n>` the tenant has ever issued, live or deleted,
 *   through the governed Invoice.assignNumber command run as the tenant's
 *   system role — the approver is an event/sales user, not finance, and the
 *   renumber is a consequence of the approval they were allowed to make.
 * - Explicit duplicate of a live invoice: rejected, which rolls the issue back.
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

  const siblings = (
    await ctx.db
      .query("invoices")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", invoice.tenantId))
      .collect()
  ).filter((row) => row._id !== invoice._id);

  const duplicated = siblings.some(
    (row) =>
      row.invoiceNumber === number && (autoNumbered || row.deletedAt == null),
  );
  if (!duplicated) return;

  if (!autoNumbered) {
    throw new Error(
      `Invoice number ${number} is already used by another invoice. Choose a different number.`,
    );
  }
  const numbering = TenantSystemCommandRunner.forTenant(ctx, invoice.tenantId)
    .context;
  await numbering.runMutation(api.mutations.Invoice_assignNumber, {
    docId: invoice._id,
    version: invoice.version,
    invoiceNumber: nextAutoInvoiceNumber(siblings),
  });
}

const AUTO_INVOICE_NUMBER = /^INV-(\d+)$/;

/** One past the highest auto-minted `INV-<n>` among the given invoices. */
export function nextAutoInvoiceNumber(
  invoices: readonly Pick<Doc<"invoices">, "invoiceNumber">[],
): string {
  let highest = 0;
  for (const row of invoices) {
    const match = row.invoiceNumber?.match(AUTO_INVOICE_NUMBER);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `INV-${highest + 1}`;
}
