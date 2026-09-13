import type { MutationCtx } from "../_generated/server";
import { formatAutoInvoiceNumber } from "./invoiceNumberFormat";

/** What the sequence needs to know about the tenant's issued invoices. */
export interface InvoiceNumberLedger {
  /** Highest `INV-<n>` already issued (live or deleted), for a first-time seed. */
  highestIssued(): Promise<number>;
  /** Whether some other invoice (live or deleted) already holds this number. */
  isHeld(number: string): Promise<boolean>;
}

/**
 * The tenant's `InvoiceNumberSequence` row (src/sales/invoice-number-sequence.manifest):
 * the highest `INV-<n>` ever issued for the tenant, live or deleted. Seam-only
 * — no generated command reads or writes it — so writes are raw `ctx.db` calls
 * on that table alone, stamping the entity's own fields (tenantId, timestamps;
 * it is not soft-deletable). Invoice rows themselves are never written here.
 */
export class InvoiceNumberSequenceStore {
  constructor(
    private readonly ctx: MutationCtx,
    private readonly tenantId: string,
    private readonly ledger: InvoiceNumberLedger,
  ) {}

  /** Reserves and returns the next auto number, advancing the sequence. */
  async mintNext(): Promise<string> {
    const row = await this.row();
    let next = row.lastNumber + 1;
    // The sequence is authoritative, but a number may still be held by a row
    // that never passed through it (hand-typed before the sequence existed,
    // or edited outside commands); skip past any holder, live or deleted.
    while (await this.ledger.isHeld(formatAutoInvoiceNumber(next))) next += 1;
    await this.ctx.db.patch(row._id, {
      lastNumber: next,
      updatedAt: Date.now(),
    });
    return formatAutoInvoiceNumber(next);
  }

  /** An explicit `INV-<n>` above the sequence moves it up; below leaves it. */
  async advanceTo(n: number): Promise<void> {
    const row = await this.row();
    if (n <= row.lastNumber) return;
    await this.ctx.db.patch(row._id, { lastNumber: n, updatedAt: Date.now() });
  }

  private async row() {
    const existing = await this.ctx.db
      .query("invoiceNumberSequences")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", this.tenantId))
      .first();
    if (existing) return existing;
    // First time this tenant needs a sequence: seed it from what was already
    // issued (once per tenant); afterwards every read is this one-row lookup.
    const lastNumber = await this.ledger.highestIssued();
    const now = Date.now();
    const id = await this.ctx.db.insert("invoiceNumberSequences", {
      tenantId: this.tenantId,
      lastNumber,
      createdAt: now,
      updatedAt: now,
    });
    return { _id: id, lastNumber };
  }
}
