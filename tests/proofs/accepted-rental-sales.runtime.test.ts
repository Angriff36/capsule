/**
 * Goodshuffle replacement (BE-13 rentals, reporting): the rental report's
 * money for an event comes from what the client accepted for its rental
 * items, not held quantity x list price.
 *
 *   - acceptedRentalSales sums the accepted proposal's lines that name an
 *     equipment item (food lines out), per event in the period
 *   - an event outside the period is left out
 *   - a reader without sales access gets nothing
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { linkStaffProfile } from "./reconciliation-failure-isolation.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-accepted-rental-sales";
const STARTS = Date.parse("2026-11-14T16:00:00Z");
const ENDS = Date.parse("2026-11-14T23:00:00Z");
const NOV = Date.parse("2026-11-01T00:00:00Z");
const DEC = Date.parse("2026-12-01T00:00:00Z");

describe("runtime proof: rental sales from the accepted proposal", () => {
  it("sums accepted rental lines per event in the period", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "rental-sales",
      role: "sales_manager",
      tenantId: TENANT,
    });
    const kitchen = proof.asRole({
      subject: "rental-sales-kitchen",
      role: "kitchen_staff",
      tenantId: TENANT,
    });
    await linkStaffProfile(proof, TENANT, "rental-sales", "sales_manager");

    const arch = (await sales.run((ctx) =>
      ctx.db.insert("equipments", {
        tenantId: TENANT,
        name: "Birch arch",
        assetTag: "arch-tag",
        category: "Decor",
        ownership: "owned",
        quantity: 3,
        purchaseValue: 400,
        condition: "good",
        status: "active",
        customerPrice: 999,
        registeredAt: 1,
        version: 1,
      }),
    )) as string;

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Sales client" },
    )) as { docId: string };

    await sales.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      {
        clientId: client.docId,
        title: "Garden wedding",
        guestCount: 60,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        lines: [
          {
            description: "Plated dinner",
            pricingBasis: "per_person",
            unitPrice: 40,
          },
          {
            description: "Birch arch rental",
            pricingBasis: "per_unit",
            unitPrice: 150,
            quantity: 2,
            unit: "arch",
            equipmentId: arch,
          },
        ],
      },
    );
    const proposal = (
      (await sales.query(api.queries.listProposal, {})) as any[]
    )[0];
    await sales.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposal._id, version: proposal.version },
    );
    const revision = (
      (await sales.query(api.queries.listProposalRevisionByProposalId, {
        proposalId: proposal._id,
      })) as any[]
    )[0];
    await proof.executeCommand(sales, api.mutations.Proposal_markViewed, {
      docId: proposal._id,
    });
    await proof.executeCommand(sales, api.mutations.Proposal_accept, {
      docId: proposal._id,
      acceptedRevisionId: revision._id,
    });
    const booked = (await sales.mutation(
      (api.lib as any).proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId: proposal._id,
        event: {
          clientId: client.docId,
          title: "Garden wedding",
          eventType: "wedding",
          startsAt: STARTS,
          endsAt: ENDS,
          expectedHeadcount: 60,
          primaryContactName: "Casey Contact",
          budgetAmount: 0,
          quotedPrice: 2700,
        },
      },
    )) as { docId: string };

    const rows = (await sales.query(
      (api as any).rentalSales.acceptedRentalSales,
      { periodStart: NOV, periodEnd: DEC },
    )) as Array<{ eventId: string; amount: number; lines: number }>;
    // Only the arch line (2 x 150); the dinner line is not a rental.
    expect(rows).toEqual([{ eventId: booked.docId, amount: 300, lines: 1 }]);

    expect(
      await sales.query((api as any).rentalSales.acceptedRentalSales, {
        periodStart: DEC,
        periodEnd: DEC + 31 * 86_400_000,
      }),
    ).toEqual([]);

    expect(
      await kitchen.query((api as any).rentalSales.acceptedRentalSales, {
        periodStart: NOV,
        periodEnd: DEC,
      }),
    ).toEqual([]);
  });
});
