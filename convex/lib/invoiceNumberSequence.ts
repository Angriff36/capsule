import type { MutationCtx } from "../_generated/server";
import { formatAutoInvoiceNumber } from "./invoiceNumberFormat";

/** What the sequence needs to know about the tenant's issued invoices. */
export interface InvoiceNumberLedger {
  /** Whether some other invoice (live or deleted) already holds this number. */
  isHeld(number: string): Promise<boolean>;
}

/**
 * The tenant's `InvoiceNumberSequence` row (src/sales/invoice-number-sequence.manifest):
 * the highest `INV-<n>` the seam has minted or been told about for the tenant.
 * Seam-only — no generated command reads or writes it — so writes are raw
 * `ctx.db` calls on that table alone, stamping the entity's own fields
 * (tenantId, timestamps; it is not soft-deletable). Invoice rows themselves
 * are never written here.
 *
 * A tenant that predates the row starts at 0 without reading its invoice
 * history: the first mint begins at the cascade's own proposal (a count of
 * the tenant's live invoices + 1, which is what the old design issued) and
 * probes upward, one indexed point read per taken number, until a number no
 * invoice — live or deleted — has ever held. Every later mint is one row
 * read, one probe, one patch.
 */
export class InvoiceNumberSequenceStore {
  constructor(
    private readonly ctx: MutationCtx,
    private readonly tenantId: string,
    private readonly ledger: InvoiceNumberLedger,
  ) {}

  /**
   * Reserves and returns the next auto number, advancing the sequence. `floor`
   * is the lowest `<n>` worth trying (the cascade's proposal); the sequence
   * never hands out a number at or below what it has already issued.
   */
  async mintNext(floor: number): Promise<string> {
    const row = await this.row();
    let next = Math.max(row.lastNumber + 1, floor, 1);
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
    const now = Date.now();
    const id = await this.ctx.db.insert("invoiceNumberSequences", {
      tenantId: this.tenantId,
      lastNumber: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { _id: id, lastNumber: 0 };
  }
}
