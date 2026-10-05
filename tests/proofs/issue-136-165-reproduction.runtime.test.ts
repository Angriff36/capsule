/**
 * AC-182: issues #136 (an approved event's draft invoice carried the raw
 * event document id as its number) and #165 (the approval cascade made
 * duplicate invoices) re-created on the current source: every approved event
 * gets exactly one draft with its own readable number, and re-running the
 * approval's invoice step makes nothing more.
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

describe("issues #136 / #165 on current source (AC-182)", () => {
  it("each approved event gets one readable draft number, never its id, never a duplicate", async () => {
    const proof = harness();
    const tenantId = "tenant-ac182";
    const owner = await ownerOf(proof, tenantId, "o-ac182");
    const clientId = await newClient(proof, owner, "AC-182 client");
    const first = await plainEvent(proof, owner, clientId, "First", 500);
    const second = await plainEvent(proof, owner, clientId, "Second", 700);
    await approve(proof, owner, first);
    await approve(proof, owner, second);

    // Re-run the invoice step the way a retry reaches it: same price again.
    for (const eventId of [first, second])
      await proof.executeCommand(owner, M.Event_changePricing, {
        docId: eventId,
        version: await liveVersion(owner, eventId),
        budgetAmount: 0,
        quotedPrice: eventId === first ? 500 : 700,
      });

    const invoices = await invoicesOf(owner, tenantId);
    expect(invoices).toHaveLength(2);
    for (const eventId of [first, second]) {
      const mine = invoices.filter((row) => row.eventId === eventId);
      expect(mine).toHaveLength(1);
      expect(mine[0].invoiceNumber).toMatch(/^INV-\d+$/);
      expect(mine[0].invoiceNumber).not.toContain(eventId);
    }
    expect(invoices.map((row) => row.invoiceNumber).sort()).toEqual([
      "INV-1",
      "INV-2",
    ]);
  });
});
