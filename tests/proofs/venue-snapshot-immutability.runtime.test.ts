/**
 * Runtime proof (AC-315, CF-8.2-02): a sent proposal and a finalized event
 * each keep a copy of the venue facts needed to reproduce the plan. Editing
 * the venue afterwards changes neither copy.
 */
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  M,
  readDoc,
  run,
  seedVenueEvent,
  walkToFinal,
} from "./venue-layout.runtime.helpers";

const FROZEN = {
  name: "Garden Hall",
  venueType: "banquet_hall",
  capacity: 150,
  onPremise: false,
  hasStairs: true,
  loadInInstructions: "Dock door 3",
  restrictions: "No open flame",
  seatedCapacity: 120,
  standingCapacity: 150,
  hasOven: true,
  hasRefrigeration: false,
  loadInFrom: "07:00",
  loadOutBy: "23:30",
};

describe("runtime proof: proposal and finalized event keep the venue as it was", () => {
  it("venue edits after send and after finalize leave both copies alone", async () => {
    const proof = harness();
    const tenantId = "tenant-ac315-venue-snapshot";
    const { roles, venueId, clientId, eventId } = await seedVenueEvent(
      proof,
      tenantId,
    );

    const proposal = await run(proof, roles.owner, M.Proposal_createViaDraft, {
      clientId,
      title: "Garden dinner",
      subtotal: 1200,
      taxAmount: 0,
      discountAmount: 0,
      total: 1200,
      guestCount: 90,
      eventId,
    });
    await run(proof, roles.owner, M.ProposalLineItem_createViaAddLine, {
      proposalId: proposal.docId,
      description: "Plated dinner",
      pricingBasis: "flat",
      unitPrice: 1200,
      amount: 1200,
    });
    await proof.executeCommand(
      roles.owner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposal.docId },
    );
    const revisionVenue = async () => {
      const [revision] = (await roles.owner.query(
        api.queries.listProposalRevisionByProposalId,
        { proposalId: proposal.docId },
      )) as Array<{ snapshot: string }>;
      return JSON.parse(revision.snapshot).venue as Record<string, unknown>;
    };
    expect(await revisionVenue()).toMatchObject(FROZEN);

    await walkToFinal(proof, tenantId, eventId);
    const finalFacts = async () => {
      const event = await readDoc<{ stage: string; finalVenueFacts?: string }>(
        roles.events,
        eventId,
      );
      expect(event.stage).toBe("final");
      return JSON.parse(event.finalVenueFacts ?? "null") as Record<
        string,
        unknown
      >;
    };
    expect(await finalFacts()).toMatchObject(FROZEN);

    // The venue changes later: new name, capacity, kitchen and load-in.
    await proof.executeCommand(roles.events, M.Venue_updateDetails, {
      docId: venueId,
      name: "Garden Hall (renovated)",
      venueType: "banquet_hall",
      hasStairs: false,
      loadInInstructions: "New ramp on the east side",
      restrictions: "Candles allowed",
    });
    await proof.executeCommand(roles.events, M.Venue_changeCapacity, {
      docId: venueId,
      capacity: 300,
    });
    await proof.executeCommand(roles.events, M.Venue_setSiteFacts, {
      docId: venueId,
      seatedCapacity: 250,
      standingCapacity: 300,
      hasOven: false,
      hasRefrigeration: true,
      loadInFrom: "05:00",
    });

    expect(await revisionVenue()).toMatchObject(FROZEN);
    expect(await finalFacts()).toMatchObject(FROZEN);
    // The finished event's printed venue name stays too.
    const event = await readDoc<{ venueName: string; venueCapacity: number }>(
      roles.events,
      eventId,
    );
    expect(event.venueName).toBe("Garden Hall");
    expect(event.venueCapacity).toBe(150);
  });
});
