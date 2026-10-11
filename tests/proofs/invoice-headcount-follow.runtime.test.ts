/**
 * Issue #441: the draft invoice from an accepted proposal carries the
 * proposal's priced lines (not one unexplained amount), and while it is an
 * unsent draft it bills the event's new guest count at the proposal's own
 * per-guest price. A sent invoice is history and stays as it is.
 */
import { describe, expect, it } from "vitest";
import {
  M,
  acceptedProposalEvent,
  approve,
  harness,
  invoicesOf,
  liveVersion,
  ownerOf,
} from "./event-invoice.runtime.helpers";

async function changeHeadcount(
  proof: ReturnType<typeof harness>,
  owner: Parameters<typeof liveVersion>[0],
  eventId: string,
  newHeadcount: number,
) {
  await proof.executeCommand(owner, M.Event_changeHeadcount, {
    docId: eventId,
    version: await liveVersion(owner, eventId),
    newHeadcount,
  });
}

describe("invoice from an accepted proposal follows the guest count (#441)", () => {
  it("the approval draft is itemized and bills the new count", async () => {
    const proof = harness();
    const tenantId = "tenant-441-a";
    const owner = await ownerOf(proof, tenantId, "o-441-a");
    const fx = await acceptedProposalEvent(proof, owner, "Issue 441 dinner");
    await approve(proof, owner, fx.eventId);

    const [draft, ...others] = await invoicesOf(owner, tenantId);
    expect(others).toHaveLength(0);
    expect(draft).toMatchObject({ total: 600, proposalId: fx.proposalId });
    expect(draft.lineItems).toHaveLength(1);
    expect(draft.lineItems[0]).toMatchObject({
      description: "Plated dinner",
      quantity: 10,
      unitPrice: 60,
    });

    await changeHeadcount(proof, owner, fx.eventId, 15);
    const [after, ...more] = await invoicesOf(owner, tenantId);
    expect(more).toHaveLength(0);
    expect(after).toMatchObject({
      _id: draft._id,
      invoiceNumber: draft.invoiceNumber,
      status: "draft",
      subtotal: 900,
      total: 900,
      amountDue: 900,
    });
    expect(after.lineItems[0]).toMatchObject({ quantity: 15, unitPrice: 60 });
    const event = (await owner.run(async (ctx) =>
      ctx.db.get(fx.eventId as never),
    )) as { quotedPrice: number };
    expect(event.quotedPrice).toBe(900);

    // Back to the signed count: back to the signed amount.
    await changeHeadcount(proof, owner, fx.eventId, 10);
    const [back] = await invoicesOf(owner, tenantId);
    expect(back).toMatchObject({ _id: draft._id, total: 600 });
  });

  it("a sent invoice keeps its amount when the count changes", async () => {
    const proof = harness();
    const tenantId = "tenant-441-b";
    const owner = await ownerOf(proof, tenantId, "o-441-b");
    const fx = await acceptedProposalEvent(proof, owner, "Issue 441 sent");
    await approve(proof, owner, fx.eventId);
    const [draft] = await invoicesOf(owner, tenantId);
    await proof.executeCommand(owner, M.Invoice_send, {
      docId: draft._id,
      version: draft.version,
    });

    await changeHeadcount(proof, owner, fx.eventId, 20);
    const [sent, ...more] = await invoicesOf(owner, tenantId);
    expect(more).toHaveLength(0);
    expect(sent).toMatchObject({ _id: draft._id, status: "sent", total: 600 });
    expect(sent.lineItems[0]).toMatchObject({ quantity: 10 });
  });
});
