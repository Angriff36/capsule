/**
 * The draft invoice an approval makes is taxed like any invoice: one
 * "Catering for …" line at the event's price with the workspace's food tax.
 * A price change keeps it on the new price and tax; a tax-exempt client's
 * draft has no tax.
 */
import { describe, expect, it } from "vitest";
import {
  M,
  approve,
  harness,
  invoicesOf,
  liveVersion,
  newClient,
  ownerOf,
  plainEvent,
} from "./event-invoice.runtime.helpers";

describe("event draft invoice tax", () => {
  it("taxes the draft, follows a new price, and skips tax for an exempt client", async () => {
    const proof = harness();
    const tenantId = "tenant-draft-tax";
    const owner = await ownerOf(proof, tenantId, "o-draft-tax");
    await proof.executeCommand(owner, M.TaxRate_createViaDefine, {
      name: "Food tax",
      percentage: 9,
      appliesToFood: true,
      appliesToService: false,
      appliesToRental: false,
    });

    const clientId = await newClient(proof, owner, "Taxed client");
    const eventId = await plainEvent(proof, owner, clientId, "Gala", 1000);
    await approve(proof, owner, eventId);
    const [draft] = await invoicesOf(owner, tenantId);
    expect(draft).toMatchObject({
      status: "draft",
      subtotal: 1000,
      taxAmount: 90,
      total: 1090,
      amountDue: 1090,
    });
    expect(draft.lineItems).toHaveLength(1);
    expect(draft.lineItems[0]).toMatchObject({
      description: "Catering for Gala",
      category: "food",
      subtotal: 1000,
      taxAmount: 90,
    });

    await proof.executeCommand(owner, M.Event_changePricing, {
      docId: eventId,
      version: await liveVersion(owner, eventId),
      budgetAmount: 0,
      quotedPrice: 1200,
    });
    const [followed, ...others] = await invoicesOf(owner, tenantId);
    expect(others).toHaveLength(0);
    expect(followed).toMatchObject({
      _id: draft._id,
      subtotal: 1200,
      taxAmount: 108,
      total: 1308,
      amountDue: 1308,
    });

    const exemptId = await newClient(proof, owner, "Exempt school");
    await owner.run(async (ctx) =>
      ctx.db.patch(exemptId as never, { taxExempt: true } as never),
    );
    const schoolEvent = await plainEvent(
      proof,
      owner,
      exemptId,
      "Breakfast",
      500,
    );
    await approve(proof, owner, schoolEvent);
    const school = (await invoicesOf(owner, tenantId)).find(
      (row) => row.eventId === schoolEvent,
    );
    expect(school).toMatchObject({ subtotal: 500, taxAmount: 0, total: 500 });
  });
});
