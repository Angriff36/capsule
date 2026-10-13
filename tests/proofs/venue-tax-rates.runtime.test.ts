/**
 * Runtime proof: a venue's own tax rates (TPP's tax location). A bill for an
 * event at a venue with a rate list is taxed with only those rates, and the
 * server's issue check uses the same rule as the invoice form
 * (src/features/finance/invoiceTax.ts ratesForVenue).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";
import {
  calculateInvoiceTax,
  ratesForVenue,
  type TaxRateRecord,
} from "../../src/features/finance/invoiceTax";

beforeAll(ensureTestFieldEncryptionKey);

const M = api.mutations;
const TENANT = "tenant-venue-tax";
const LINES = [
  {
    id: "a",
    description: "Dinner",
    category: "food" as const,
    quantity: 10,
    unitPrice: 20,
  },
];

describe("runtime proof: tax rates by venue", () => {
  it("taxes a bill with only the venue's rates, and the server agrees", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "owner-venue-tax",
      role: "owner",
      tenantId: TENANT,
    });
    const run = (fn: unknown, args: Record<string, unknown>) =>
      proof.executeCommand(owner, fn as never, args as never) as Promise<{
        docId: string;
      }>;
    await run(M.Organization_createViaRegister, { name: "Tax kitchen" });
    await run(M.TaxRate_createViaDefine, {
      name: "City tax",
      percentage: 8,
      appliesToFood: true,
      appliesToService: false,
      appliesToRental: false,
    });
    await run(M.TaxRate_createViaDefine, {
      name: "County tax",
      percentage: 2,
      appliesToFood: true,
      appliesToService: false,
      appliesToRental: false,
    });
    const rates = (await owner.run(async (ctx) =>
      (await ctx.db.query("taxRates").collect()).filter(
        (row) => row.tenantId === TENANT,
      ),
    )) as TaxRateRecord[];
    const city = rates.find((rate) => rate.name === "City tax")!;

    const venue = await run(M.Venue_createViaRegister, {
      name: "River Hall",
      venueType: "banquet_hall",
      capacity: 100,
    });
    const version = (
      await owner.run(
        async (ctx) =>
          (await ctx.db.get(venue.docId as never)) as { version: number },
      )
    ).version;
    await owner.mutation(M.Venue_setTaxRates, {
      docId: venue.docId,
      version,
      taxRateIds: [String(city._id)],
    } as never);
    const client = await run(M.Client_createViaRegister, {
      clientType: "company",
      companyName: "River client",
    });
    const event = await run(M.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title: "River dinner",
      eventType: "dinner",
      startsAt: Date.UTC(2026, 11, 5, 1, 0),
      endsAt: Date.UTC(2026, 11, 5, 5, 0),
      expectedHeadcount: 10,
      primaryContactName: "Riley River",
      budgetAmount: 200,
      quotedPrice: 200,
      venueId: venue.docId,
      venueName: "River Hall",
    });

    const venueRow = (await owner.run(async (ctx) =>
      ctx.db.get(venue.docId as never),
    )) as { taxRateIds?: string[] };
    const atVenue = calculateInvoiceTax(LINES, ratesForVenue(rates, venueRow));
    const everywhere = calculateInvoiceTax(LINES, rates);
    // $200 of food: 8% at the venue, 8% + 2% elsewhere.
    expect(atVenue.taxAmount).toBe(16);
    expect(everywhere.taxAmount).toBe(20);

    const issue = (number: string, worked: typeof atVenue) =>
      run(M.Invoice_createViaIssue, {
        clientId: client.docId,
        eventId: event.docId,
        invoiceNumber: number,
        discountAmount: 0,
        subtotal: worked.subtotal,
        taxAmount: worked.taxAmount,
        total: worked.total,
        lineItems: worked.lineItems,
        taxBreakdown: worked.taxBreakdown,
      });
    // Taxed with every company rate: the server refuses it for this venue.
    await expect(issue("INV-V-1", everywhere)).rejects.toThrow(/don't add up/);
    // Taxed with the venue's own rate: issued.
    const issued = await issue("INV-V-2", atVenue);
    expect(issued.docId).toBeTruthy();
  });
});
