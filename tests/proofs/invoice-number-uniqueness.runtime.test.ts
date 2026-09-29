/**
 * AC-087: invoice numbers are readable and unique per workspace. Approving an
 * event twice, issuing back to back, replaying a command, or retrying never
 * makes a duplicate placeholder; a typed duplicate is refused; a typed source
 * number is kept as typed; a typed INV-<n> moves the sequence past it.
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

const issue = (clientId: string, extra: Record<string, unknown> = {}) => ({
  clientId,
  subtotal: 100,
  taxAmount: 0,
  discountAmount: 0,
  total: 100,
  ...extra,
});

describe("invoice number uniqueness (AC-087)", () => {
  it("approve twice, back-to-back issues, replay and typed numbers stay unique", async () => {
    const proof = harness();
    const tenantId = "tenant-ac087";
    const owner = await ownerOf(proof, tenantId, "o-ac087");
    const clientId = await newClient(proof, owner, "AC-087 client");

    // Approve an event, then try again: refused, still one invoice.
    const eventId = await plainEvent(proof, owner, clientId, "Numbered", 900);
    await approve(proof, owner, eventId);
    await expect(
      proof.executeCommand(owner, M.Event_approve, {
        docId: eventId,
        version: await liveVersion(owner, eventId),
      }),
    ).rejects.toThrow();
    const approved = await invoicesOf(owner, tenantId);
    expect(approved).toHaveLength(1);
    expect(approved[0].invoiceNumber).toBe("INV-1");

    // Two auto-numbered issues back to back get the next two numbers.
    await proof.executeCommand(
      owner,
      M.Invoice_createViaIssue,
      issue(clientId, { invoiceSequence: 0 }),
    );
    await proof.executeCommand(
      owner,
      M.Invoice_createViaIssue,
      issue(clientId, { invoiceSequence: 0 }),
    );

    // A replayed command (same key, as a webhook retry sends) adds nothing.
    const replay = issue(clientId, {
      invoiceSequence: 0,
      idempotencyKey: "retry-1",
    });
    await proof.executeCommand(owner, M.Invoice_createViaIssue, replay);
    await proof.executeCommand(owner, M.Invoice_createViaIssue, replay);

    // A typed number that is already used is refused and writes nothing.
    await expect(
      proof.executeCommand(
        owner,
        M.Invoice_createViaIssue,
        issue(clientId, { invoiceNumber: "INV-2" }),
      ),
    ).rejects.toThrow(/already used/);

    // A source number from the old system is kept exactly as typed.
    await proof.executeCommand(
      owner,
      M.Invoice_createViaIssue,
      issue(clientId, { invoiceNumber: "TPP-6837" }),
    );

    // A typed INV-<n> ahead of the sequence moves it on.
    await proof.executeCommand(
      owner,
      M.Invoice_createViaIssue,
      issue(clientId, { invoiceNumber: "INV-50" }),
    );
    await proof.executeCommand(
      owner,
      M.Invoice_createViaIssue,
      issue(clientId, { invoiceSequence: 0 }),
    );

    const numbers = (await invoicesOf(owner, tenantId))
      .map((row) => row.invoiceNumber)
      .sort();
    expect(numbers).toEqual(
      [
        "INV-1",
        "INV-2",
        "INV-3",
        "INV-4",
        "INV-50",
        "INV-51",
        "TPP-6837",
      ].sort(),
    );
    expect(new Set(numbers).size).toBe(numbers.length);

    // Another workspace starts its own readable sequence.
    const other = await ownerOf(proof, "tenant-ac087-b", "o-ac087-b");
    const otherClient = await newClient(proof, other, "AC-087 other client");
    await proof.executeCommand(
      other,
      M.Invoice_createViaIssue,
      issue(otherClient, { invoiceSequence: 0 }),
    );
    expect(
      (await invoicesOf(other, "tenant-ac087-b")).map((r) => r.invoiceNumber),
    ).toEqual(["INV-1"]);
  });
});
