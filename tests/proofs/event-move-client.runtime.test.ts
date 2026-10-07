/**
 * Runtime proof (#378): sales can move an event to a different client. The
 * event's proposals, contracts and unsent draft invoices follow it; sent
 * invoices stay with the client they were billed to; an archived or unknown client is refused.
 */
import { describe, expect, it } from "vitest";
import {
  harness,
  M,
  readDoc,
  run,
  seedVenueEvent,
} from "./venue-layout.runtime.helpers";

describe("runtime proof: move an event to another client", () => {
  it("moves event, proposal, contract and draft invoice; leaves the sent invoice; refuses bad targets", async () => {
    const proof = harness();
    const tenantId = "tenant-move-client";
    const { roles, clientId, eventId } = await seedVenueEvent(proof, tenantId);

    const endClient = await run(
      proof,
      roles.sales,
      M.Client_createViaRegister,
      {
        clientType: "person",
        givenName: "Robin",
        familyName: "Bride",
      },
    );
    const archived = await run(proof, roles.sales, M.Client_createViaRegister, {
      clientType: "company",
      companyName: "Gone Co",
    });
    const archivedDoc = await readDoc<{ version: number }>(
      roles.sales,
      archived.docId,
    );
    await proof.executeCommand(roles.sales, M.Client_archive, {
      docId: archived.docId,
      reason: "Closed",
      version: archivedDoc.version,
    } as never);

    const proposal = await run(proof, roles.owner, M.Proposal_createViaDraft, {
      clientId,
      title: "Garden dinner",
      subtotal: 4500,
      taxAmount: 0,
      discountAmount: 0,
      total: 4500,
      guestCount: 90,
      eventId,
    });
    const contract = await run(proof, roles.sales, M.Contract_createViaDraft, {
      eventId,
      clientId,
      title: "Garden dinner agreement",
    });
    const invoiceId = await roles.owner.run(async (ctx) =>
      ctx.db.insert(
        "invoices" as never,
        {
          tenantId,
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
          status: "sent",
          issuedAt: Date.now(),
          taxAmount: 0,
          discountAmount: 0,
          amountPaid: 0,
          depositAmount: 0,
          paymentTermsDays: 30,
          lineItems: [],
          clientId,
          eventId,
          invoiceNumber: "INV-MOVE",
          subtotal: 4500,
          total: 4500,
          amountDue: 4500,
        } as never,
      ),
    );

    const draftId = await roles.owner.run(async (ctx) =>
      ctx.db.insert(
        "invoices" as never,
        {
          tenantId,
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
          status: "draft",
          taxAmount: 0,
          discountAmount: 0,
          amountPaid: 0,
          depositAmount: 0,
          paymentTermsDays: 30,
          lineItems: [],
          clientId,
          eventId,
          invoiceNumber: "INV-DRAFT",
          subtotal: 4500,
          total: 4500,
          amountDue: 4500,
        } as never,
      ),
    );

    const version = async () =>
      (await readDoc<{ version: number }>(roles.sales, eventId)).version;

    await expect(
      proof.executeCommand(roles.sales, M.Event_moveToClient, {
        docId: eventId,
        clientId: archived.docId,
        version: await version(),
      } as never),
    ).rejects.toThrow("Pick a client that is still active.");
    await expect(
      proof.executeCommand(roles.sales, M.Event_moveToClient, {
        docId: eventId,
        clientId,
        version: await version(),
      } as never),
    ).rejects.toThrow("This event already belongs to that client.");

    await proof.executeCommand(roles.sales, M.Event_moveToClient, {
      docId: eventId,
      clientId: endClient.docId,
      primaryContactName: "Robin Bride",
      primaryContactEmail: "robin@example.com",
      version: await version(),
    } as never);

    const event = await readDoc<{
      clientId: string;
      primaryContactName: string;
    }>(roles.sales, eventId);
    expect(event.clientId).toBe(endClient.docId);
    expect(
      (await readDoc<{ clientId: string }>(roles.sales, proposal.docId))
        .clientId,
    ).toBe(endClient.docId);
    expect(
      (await readDoc<{ clientId: string }>(roles.sales, contract.docId))
        .clientId,
    ).toBe(endClient.docId);
    expect(
      (await readDoc<{ clientId: string }>(roles.sales, invoiceId as string))
        .clientId,
    ).toBe(clientId);
    // The unsent, unpaid draft follows the event.
    expect(
      (await readDoc<{ clientId: string }>(roles.sales, draftId as string))
        .clientId,
    ).toBe(endClient.docId);

    // Moving without a contact name keeps the contact already on the event.
    await proof.executeCommand(roles.sales, M.Event_moveToClient, {
      docId: eventId,
      clientId,
      version: await version(),
    } as never);
    expect(
      (await readDoc<{ clientId: string }>(roles.sales, eventId)).clientId,
    ).toBe(clientId);
  });
});
