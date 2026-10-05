/**
 * Runtime proof (AC-300, CF-7.3-01): a revenue split attaches to an event and
 * to its venue, salesperson, referral source or partner; percent and fixed
 * splits; dates, type and reason; optional approval. A percent split drafts,
 * is approved and applied against the event's revenue as a rounded amount; a
 * fixed one books its fixed amount; someone outside finance is refused.
 */
import { describe, expect, it } from "vitest";
import {
  approveAndApply,
  harness,
  M,
  planEvent,
  readDoc,
  run,
  seedFinance,
  type Split,
} from "./attribution.runtime.helpers";

describe("runtime proof: revenue split lifecycle", () => {
  it("percent rounds, fixed books its amount, non-finance is refused", async () => {
    const proof = harness();
    const tenantId = "tenant-ac300-splits";
    const { finance, sales, venueId, clientId } = await seedFinance(
      proof,
      tenantId,
    );
    const eventId = await planEvent(
      proof,
      sales,
      clientId,
      venueId,
      "Gala",
      12345.67,
    );

    const percent = await run(proof, finance, M.RevenueAttribution_create, {
      eventId,
      attributionType: "venue_commission",
      allocationMethod: "percent",
      percentBasis: 12.5,
      venueId,
      effectiveStartDate: Date.UTC(2026, 0, 1),
      reason: "House commission",
    });
    const percentId =
      (percent as unknown as { _id: string })._id ?? percent.docId;
    expect((await readDoc<Split>(finance, percentId)).status).toBe("draft");
    await approveAndApply(proof, finance, percentId, 12345.67);
    expect(await readDoc<Split>(finance, percentId)).toMatchObject({
      status: "applied",
      allocatedAmount: 1543.21, // 12.5% of 12,345.67 = 1,543.20875
    });

    const fixed = await run(proof, finance, M.RevenueAttribution_create, {
      eventId,
      attributionType: "referral_fee",
      allocationMethod: "fixed",
      fixedAmount: 250,
      reason: "Planner referral",
    });
    const fixedId = (fixed as unknown as { _id: string })._id ?? fixed.docId;
    await approveAndApply(proof, finance, fixedId, 12345.67);
    expect(await readDoc<Split>(finance, fixedId)).toMatchObject({
      status: "applied",
      allocatedAmount: 250,
      attributionType: "referral_fee",
    });

    // Sales may read splits, not make them.
    await expect(
      proof.executeCommand(sales, M.RevenueAttribution_create, {
        eventId,
        attributionType: "sales_commission",
        allocationMethod: "percent",
        percentBasis: 3,
      }),
    ).rejects.toThrow();
  });
});
