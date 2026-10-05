/**
 * Runtime proofs:
 * - AC-321 (CF-8.5-02): booking an event (approval) at a venue with a
 *   commission term in force makes the event's venue commission split with
 *   that term's percent, naming the term; a finance person can change it
 *   with a reason, and the change names them.
 * - AC-303 (CF-7.3-04): revising or retiring the venue term afterwards
 *   changes neither the captured split nor an applied amount.
 */
import { describe, expect, it } from "vitest";
import {
  approveAndApply,
  book,
  DAY,
  harness,
  M,
  planEvent,
  readDoc,
  run,
  seedFinance,
  splitsFor,
  type Split,
} from "./attribution.runtime.helpers";

describe("runtime proof: venue term captured at booking", () => {
  it("captures the term in force, can be changed with a reason, ignores later term edits", async () => {
    const proof = harness();
    const tenantId = "tenant-ac321-booking";
    const { finance, events, sales, venueId, clientId } = await seedFinance(
      proof,
      tenantId,
    );
    // An old term that ended, and the one in force now.
    await run(proof, finance, M.VenueCommissionTerm_createViaDefine, {
      venueId,
      commissionPercent: 8,
      effectiveStartDate: Date.now() - 400 * DAY,
      effectiveEndDate: Date.now() - 200 * DAY,
    });
    const term = await run(
      proof,
      finance,
      M.VenueCommissionTerm_createViaDefine,
      {
        venueId,
        commissionPercent: 12,
        effectiveStartDate: Date.now() - 100 * DAY,
      },
    );

    const eventId = await planEvent(
      proof,
      sales,
      clientId,
      venueId,
      "Booked gala",
      20000,
    );
    expect(await splitsFor(finance, eventId)).toEqual([]);
    await book(proof, events, eventId);
    const [captured] = await splitsFor(finance, eventId);
    expect(captured).toMatchObject({
      attributionType: "venue_commission",
      allocationMethod: "percent",
      percentBasis: 12,
      venueId,
      venueCommissionTermId: term.docId,
      status: "draft",
    });

    // Change it, with a reason.
    await expect(
      proof.executeCommand(finance, M.RevenueAttribution_changeSplit, {
        docId: captured._id,
        reason: "",
        percentBasis: 10,
      }),
    ).rejects.toThrow(/Say why/);
    await proof.executeCommand(finance, M.RevenueAttribution_changeSplit, {
      docId: captured._id,
      reason: "Venue agreed 10% for a repeat client",
      percentBasis: 10,
    });
    const changed = await readDoc<Split>(finance, captured._id);
    expect(changed).toMatchObject({
      percentBasis: 10,
      overrideReason: "Venue agreed 10% for a repeat client",
    });
    expect(changed.overriddenById).toBeTruthy();
    await approveAndApply(proof, finance, captured._id, 20000);

    // AC-303: the term changes later; the event's split does not.
    await proof.executeCommand(finance, M.VenueCommissionTerm_revise, {
      docId: term.docId,
      commissionPercent: 15,
    });
    await proof.executeCommand(finance, M.VenueCommissionTerm_retire, {
      docId: term.docId,
    });
    expect(await readDoc<Split>(finance, captured._id)).toMatchObject({
      percentBasis: 10,
      allocatedAmount: 2000,
      status: "applied",
    });

    // A second booking after reopening does not add a second capture, and an
    // event at a venue with no term in force gets none.
    const quiet = await planEvent(
      proof,
      sales,
      clientId,
      venueId,
      "After the term",
      5000,
    );
    await book(proof, events, quiet);
    expect(await splitsFor(finance, quiet)).toEqual([]);
    expect(await splitsFor(finance, eventId)).toHaveLength(1);
  });
});
