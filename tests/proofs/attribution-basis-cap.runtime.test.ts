/**
 * Runtime proof (AC-301, CF-7.3-02): an event's applied splits may not add up
 * to more than the revenue they are applied against. Applying one that would
 * go over is refused with the amounts named and nothing changes; a finance
 * person can record why this split may go over, and the record names them.
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

const idOf = (row: unknown) =>
  ((row as { _id?: string })._id ?? (row as { docId: string }).docId) as string;

describe("runtime proof: splits stay within the event's revenue", () => {
  it("refuses going over, allows it with a recorded reason", async () => {
    const proof = harness();
    const tenantId = "tenant-ac301-cap";
    const { finance, sales, venueId, clientId } = await seedFinance(
      proof,
      tenantId,
    );
    const eventId = await planEvent(
      proof,
      sales,
      clientId,
      venueId,
      "Cap dinner",
      1000,
    );
    const fixed = async (amount: number, reason: string) =>
      idOf(
        await run(proof, finance, M.RevenueAttribution_create, {
          eventId,
          attributionType: "partner_split",
          allocationMethod: "fixed",
          fixedAmount: amount,
          reason,
        }),
      );

    const first = await fixed(700, "Partner A");
    await approveAndApply(proof, finance, first, 1000);
    const second = await fixed(400, "Partner B");
    await expect(approveAndApply(proof, finance, second, 1000)).rejects.toThrow(
      /would come to \$1,100\.00, more than its \$1,000\.00 revenue/,
    );
    // Refused in the same step: still approved, nothing booked.
    expect(await readDoc<Split>(finance, second)).toMatchObject({
      status: "approved",
      allocatedAmount: 0,
    });

    await expect(
      proof.executeCommand(finance, M.RevenueAttribution_allowOverRevenue, {
        docId: second,
        reason: " ",
      }),
    ).rejects.toThrow(/Say why/);
    await proof.executeCommand(finance, M.RevenueAttribution_allowOverRevenue, {
      docId: second,
      reason: "Partner B was promised a flat fee in writing",
    });
    await proof.executeCommand(finance, M.RevenueAttribution_apply, {
      docId: second,
      eventRevenue: 1000,
    });
    const allowed = await readDoc<Split>(finance, second);
    expect(allowed).toMatchObject({
      status: "applied",
      allocatedAmount: 400,
      overRevenueReason: "Partner B was promised a flat fee in writing",
    });
    expect(allowed.overRevenueAllowedById).toBeTruthy();
  });
});
