/**
 * AC-618: event approval makes ONE unsent draft invoice when the quoted price
 * is above zero, records the accepted proposal and revision as its source,
 * never sends it, and never makes a second on retry or a later price change.
 */
import { describe, expect, it } from "vitest";
import {
  M,
  acceptedProposalEvent,
  approve,
  harness,
  invoicesOf,
  liveVersion,
  newClient,
  ownerOf,
  plainEvent,
} from "./event-invoice.runtime.helpers";

describe("event draft invoice and its commercial source (AC-618)", () => {
  it("approval of a booked proposal makes one sourced, unsent draft; price moves keep it single", async () => {
    const proof = harness();
    const tenantId = "tenant-ac618-a";
    const owner = await ownerOf(proof, tenantId, "o-ac618-a");
    const fx = await acceptedProposalEvent(proof, owner, "AC-618 dinner");
    expect(fx.quotedPrice).toBe(600);
    await approve(proof, owner, fx.eventId);

    const [invoice, ...others] = await invoicesOf(owner, tenantId);
    expect(others).toHaveLength(0);
    expect(invoice).toMatchObject({
      eventId: fx.eventId,
      clientId: fx.clientId,
      proposalId: fx.proposalId,
      proposalRevisionId: fx.revisionId,
      total: 600,
      amountDue: 600,
      status: "draft",
    });
    expect(invoice.sentAt ?? null).toBeNull();
    expect(invoice.invoiceNumber).toMatch(/^INV-\d+$/);

    // A new price: the untouched draft follows it; still exactly one invoice.
    await proof.executeCommand(owner, M.Event_changePricing, {
      docId: fx.eventId,
      version: await liveVersion(owner, fx.eventId),
      budgetAmount: 0,
      quotedPrice: 650,
    });
    const after = await invoicesOf(owner, tenantId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      _id: invoice._id,
      total: 650,
      status: "draft",
      invoiceNumber: invoice.invoiceNumber,
      proposalRevisionId: fx.revisionId,
    });
  });

  it("no price makes no invoice; pricing the approved event later makes the one draft", async () => {
    const proof = harness();
    const tenantId = "tenant-ac618-b";
    const owner = await ownerOf(proof, tenantId, "o-ac618-b");
    const clientId = await newClient(proof, owner, "AC-618 unpriced client");
    const eventId = await plainEvent(proof, owner, clientId, "Unpriced", 0);
    await approve(proof, owner, eventId);
    expect(await invoicesOf(owner, tenantId)).toHaveLength(0);

    await proof.executeCommand(owner, M.Event_changePricing, {
      docId: eventId,
      version: await liveVersion(owner, eventId),
      budgetAmount: 0,
      quotedPrice: 1200,
    });
    const [draft, ...more] = await invoicesOf(owner, tenantId);
    expect(more).toHaveLength(0);
    expect(draft).toMatchObject({ eventId, total: 1200, status: "draft" });
    // The event's own quoted price is the source: no proposal named.
    expect(draft.proposalId ?? null).toBeNull();

    // Same price again: nothing new.
    await proof.executeCommand(owner, M.Event_changePricing, {
      docId: eventId,
      version: await liveVersion(owner, eventId),
      budgetAmount: 0,
      quotedPrice: 1200,
    });
    expect(await invoicesOf(owner, tenantId)).toHaveLength(1);
  });

  it("an invoice cannot name another workspace's or another client's proposal as its source", async () => {
    const proof = harness();
    const owner = await ownerOf(proof, "tenant-ac618-c", "o-ac618-c");
    const fx = await acceptedProposalEvent(proof, owner, "AC-618 source owner");
    const other = await ownerOf(proof, "tenant-ac618-d", "o-ac618-d");
    const otherClient = await newClient(proof, other, "AC-618 other client");
    await expect(
      proof.executeCommand(other, M.Invoice_createViaIssue, {
        clientId: otherClient,
        invoiceSequence: 0,
        subtotal: 10,
        taxAmount: 0,
        discountAmount: 0,
        total: 10,
        proposalId: fx.proposalId,
      }),
    ).rejects.toThrow(/not found/);
    const sameTenantOtherClient = await newClient(
      proof,
      owner,
      "AC-618 wrong client",
    );
    await expect(
      proof.executeCommand(owner, M.Invoice_createViaIssue, {
        clientId: sameTenantOtherClient,
        invoiceSequence: 0,
        subtotal: 10,
        taxAmount: 0,
        discountAmount: 0,
        total: 10,
        proposalId: fx.proposalId,
        proposalRevisionId: fx.revisionId,
      }),
    ).rejects.toThrow(/source was not found/);
    expect(await invoicesOf(other, "tenant-ac618-d")).toHaveLength(0);
  });
});
