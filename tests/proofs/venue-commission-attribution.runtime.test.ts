/**
 * Runtime proof (AC-200, CF-2-1-spine-venue): a venue commission term and the
 * revenue split of an event live on the existing Venue, VenueCommissionTerm
 * and RevenueAttribution records. Finance defines a 12% term for a venue,
 * attributes the event's revenue to that venue, approves it, and applying the
 * event revenue books 12% of it. Nothing here moves money; it is the split
 * the closeout and reports read.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const M = api.mutations;
const TENANT = "tenant-ac200-venue";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: venue commission term and event revenue split", () => {
  it("defines a term, attributes the event to the venue and books the split", async () => {
    const proof = harness();
    const subject = "finance-ac200";
    const finance = proof.asRole({
      subject,
      role: "finance_manager",
      tenantId: TENANT,
    });
    const sales = proof.asRole({
      subject: "owner-ac200",
      role: "owner",
      tenantId: TENANT,
    });
    await finance.run(async (ctx) =>
      (
        ctx.db as unknown as { insert(t: string, v: unknown): Promise<string> }
      ).insert("people", {
        tenantId: TENANT,
        givenName: "Fran",
        familyName: "Finance",
        email: "fran@proof.test",
        role: "finance_manager",
        employmentType: "full_time",
        status: "active",
        deletedAt: null,
        version: 1,
        authSubjectId: subject,
      }),
    );

    const venue = (await proof.executeCommand(
      sales,
      M.Venue_createViaRegister,
      {
        name: "Lakeside Hall",
        venueType: "banquet_hall",
        capacity: 200,
      },
    )) as { docId: string };
    const client = (await proof.executeCommand(
      sales,
      M.Client_createViaRegister,
      { clientType: "company", companyName: "Lakeside wedding client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      M.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Lakeside wedding",
        eventType: "wedding",
        startsAt: Date.UTC(2026, 10, 14, 22, 0),
        endsAt: Date.UTC(2026, 10, 15, 3, 0),
        expectedHeadcount: 120,
        primaryContactName: "Riley Lakeside",
        budgetAmount: 15000,
        quotedPrice: 18000,
      },
    )) as { docId: string };

    const term = (await proof.executeCommand(
      finance,
      M.VenueCommissionTerm_createViaDefine,
      {
        venueId: venue.docId,
        commissionPercent: 12,
        effectiveStartDate: Date.UTC(2026, 0, 1),
      },
    )) as { docId: string };

    const created = (await proof.executeCommand(
      finance,
      M.RevenueAttribution_create,
      {
        eventId: event.docId,
        attributionType: "venue_commission",
        allocationMethod: "percent",
        percentBasis: 12,
        venueId: venue.docId,
        reason: "Lakeside Hall house commission",
      },
    )) as { _id: string };
    const attributionId = created._id;
    await proof.executeCommand(finance, M.RevenueAttribution_requestApproval, {
      docId: attributionId,
      version: 1,
    });
    await proof.executeCommand(finance, M.RevenueAttribution_approve, {
      docId: attributionId,
      version: 2,
    });
    await proof.executeCommand(finance, M.RevenueAttribution_apply, {
      docId: attributionId,
      version: 3,
      eventRevenue: 18000,
    });

    const [savedTerm, split] = await finance.run(async (ctx) => [
      await ctx.db.get(term.docId as never),
      await ctx.db.get(attributionId as never),
    ]);
    expect(savedTerm).toMatchObject({
      venueId: venue.docId,
      commissionPercent: 12,
      tenantId: TENANT,
    });
    expect(split).toMatchObject({
      eventId: event.docId,
      venueId: venue.docId,
      status: "applied",
      allocatedAmount: 2160,
      tenantId: TENANT,
    });
  });
});
