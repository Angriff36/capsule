/**
 * Runtime proof (AC-388 invoice slice): after approval the event carries one
 * unsent draft invoice made from the quoted price. Event.changePricing now
 * moves that untouched draft to the new price (same invoice, same number) and
 * records one §8.2 invoice receipt. A draft finance changed (here: a deposit)
 * and a sent invoice keep their money and are flagged on the receipt instead.
 * Replaying the same price writes nothing, and moving the price back and
 * forth always leaves the draft on the latest price.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  approveEvent,
  createPlannedEvent,
  harness,
  listedInvoiceFacts,
  readEventRow,
  rolesFor,
  runner,
  sendInvoice,
  type InvoiceFactRow,
  type Proof,
} from "./plan-vs-fact-sent-invoice.runtime.helpers";
import {
  readReconciliationReceipts,
  type ReceiptOutput,
} from "./single-reconciliation.runtime.helpers";

const QUOTED_PRICE = 4500;
const NEW_PRICE = 5200;
const BUDGET = 3000;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

/** Change the quoted price as the sales manager, on the live event version. */
async function changePricing(
  proof: Proof,
  tenantId: string,
  eventId: string,
  quotedPrice: number,
): Promise<void> {
  const { sales } = rolesFor(proof, tenantId);
  const event = await readEventRow(sales, eventId);
  await runner(proof, sales)(api.mutations.Event_changePricing, {
    docId: eventId,
    version: event.version,
    budgetAmount: BUDGET,
    quotedPrice,
  });
}

async function approvedWithDraft(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; draft: InvoiceFactRow }> {
  const { eventId } = await createPlannedEvent(proof, tenantId, title);
  await approveEvent(proof, tenantId, eventId);
  const rows = await listedInvoiceFacts(
    rolesFor(proof, tenantId).finance,
    eventId,
  );
  expect(rows).toHaveLength(1);
  const draft = rows[0]!;
  expect(draft.status).toBe("draft");
  expect(Number(draft.total)).toBe(QUOTED_PRICE);
  return { eventId, draft };
}

async function theOneInvoice(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<InvoiceFactRow> {
  const rows = await listedInvoiceFacts(
    rolesFor(proof, tenantId).finance,
    eventId,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function invoiceReceipts(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<ReceiptOutput[]> {
  const receipts = await readReconciliationReceipts(
    rolesFor(proof, tenantId).events,
    tenantId,
  );
  return receipts.filter(
    (receipt) =>
      receipt.eventId === eventId &&
      receipt.affectedDomains.includes("invoice"),
  );
}

describe("runtime proof: AC-388 price change keeps the draft invoice on the event price", () => {
  it("a price change moves the untouched draft invoice to the new price once", async () => {
    const tenantId = "tenant-ac388-invoice-follow";
    const proof = harness();
    const { eventId, draft } = await approvedWithDraft(
      proof,
      tenantId,
      "AC-388 invoice follow",
    );

    await changePricing(proof, tenantId, eventId, NEW_PRICE);

    const row = await theOneInvoice(proof, tenantId, eventId);
    expect(row._id).toBe(draft._id);
    expect(row.invoiceNumber).toBe(draft.invoiceNumber);
    expect(row.status).toBe("draft");
    expect(row.sentAt == null).toBe(true);
    expect(Number(row.subtotal)).toBe(NEW_PRICE);
    expect(Number(row.total)).toBe(NEW_PRICE);
    expect(Number(row.amountDue)).toBe(NEW_PRICE);
    expect(Number(row.amountPaid)).toBe(0);

    const receipts = await invoiceReceipts(proof, tenantId, eventId);
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0]!;
    expect(receipt.triggerType).toBe("EventPricingChanged");
    expect(receipt.affectedDomains).toEqual(["invoice"]);
    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.updatedCount).toBe(1);
    expect(receipt.preservedCount).toBe(0);
    expect(receipt.unresolved).toEqual([]);
    expect(receipt.checkpoint.state).toBe("complete");
  });

  it("replaying the same price rewrites nothing and writes no second receipt", async () => {
    const tenantId = "tenant-ac388-invoice-replay";
    const proof = harness();
    const { eventId } = await approvedWithDraft(
      proof,
      tenantId,
      "AC-388 invoice replay",
    );

    await changePricing(proof, tenantId, eventId, NEW_PRICE);
    const first = await theOneInvoice(proof, tenantId, eventId);
    await changePricing(proof, tenantId, eventId, NEW_PRICE);
    const second = await theOneInvoice(proof, tenantId, eventId);

    expect(second.version).toBe(first.version);
    expect(Number(second.total)).toBe(NEW_PRICE);
    expect(await invoiceReceipts(proof, tenantId, eventId)).toHaveLength(1);
  });

  it("moving the price back and forth leaves the draft on the latest price", async () => {
    const tenantId = "tenant-ac388-invoice-back-forth";
    const proof = harness();
    const { eventId } = await approvedWithDraft(
      proof,
      tenantId,
      "AC-388 invoice back and forth",
    );

    await changePricing(proof, tenantId, eventId, NEW_PRICE);
    await changePricing(proof, tenantId, eventId, QUOTED_PRICE);
    expect(Number((await theOneInvoice(proof, tenantId, eventId)).total)).toBe(
      QUOTED_PRICE,
    );
    await changePricing(proof, tenantId, eventId, NEW_PRICE);

    const row = await theOneInvoice(proof, tenantId, eventId);
    expect(Number(row.total)).toBe(NEW_PRICE);
    expect(Number(row.amountDue)).toBe(NEW_PRICE);
    expect(await invoiceReceipts(proof, tenantId, eventId)).toHaveLength(3);
  });

  it("a draft finance put a deposit on keeps its money and is flagged for review", async () => {
    const tenantId = "tenant-ac388-invoice-deposit";
    const proof = harness();
    const { eventId, draft } = await approvedWithDraft(
      proof,
      tenantId,
      "AC-388 invoice deposit",
    );
    const { finance } = rolesFor(proof, tenantId);
    await runner(proof, finance)(api.mutations.Invoice_setDeposit, {
      docId: draft._id,
      version: draft.version,
      depositAmount: 1000,
    });

    await changePricing(proof, tenantId, eventId, NEW_PRICE);

    const row = await theOneInvoice(proof, tenantId, eventId);
    expect(row.status).toBe("draft");
    expect(Number(row.total)).toBe(QUOTED_PRICE);
    expect(Number(row.amountDue)).toBe(QUOTED_PRICE);
    const receipts = await invoiceReceipts(proof, tenantId, eventId);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.updatedCount).toBe(0);
    expect(receipts[0]!.preservedCount).toBe(1);
    expect(receipts[0]!.unresolved).toEqual([
      { code: "invoice_review", recordIds: [draft._id] },
    ]);
  });

  it("a sent invoice stays as sent and is flagged as needing a change", async () => {
    const tenantId = "tenant-ac388-invoice-sent";
    const proof = harness();
    const { eventId, draft } = await approvedWithDraft(
      proof,
      tenantId,
      "AC-388 invoice sent",
    );
    await sendInvoice(proof, tenantId, draft._id);
    const sent = await theOneInvoice(proof, tenantId, eventId);

    await changePricing(proof, tenantId, eventId, NEW_PRICE);

    const row = await theOneInvoice(proof, tenantId, eventId);
    expect(row.status).toBe("sent");
    expect(row.version).toBe(sent.version);
    expect(row.sentAt).toBe(sent.sentAt);
    expect(Number(row.total)).toBe(QUOTED_PRICE);
    expect(Number(row.amountDue)).toBe(QUOTED_PRICE);
    const receipts = await invoiceReceipts(proof, tenantId, eventId);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.unresolved).toEqual([
      { code: "invoice_change_required", recordIds: [draft._id] },
    ]);
  });
});
