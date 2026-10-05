/**
 * Runtime proof (AC-320, CF-8.5-01): venue commission terms are dated
 * records. define -> revise -> retire keeps the old term readable for its
 * window; a retired term cannot be revised; dates and percent are checked.
 */
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  DAY,
  harness,
  M,
  readDoc,
  run,
  seedFinance,
} from "./attribution.runtime.helpers";

type Term = {
  _id: string;
  venueId: string;
  commissionPercent: number;
  effectiveStartDate: number;
  effectiveEndDate?: number | null;
  status: string;
  retiredAt?: number | null;
  deletedAt?: number | null;
};

describe("runtime proof: venue commission terms", () => {
  it("define, revise, retire; history stays; retired cannot change", async () => {
    const proof = harness();
    const tenantId = "tenant-ac320-terms";
    const { finance, venueId } = await seedFinance(proof, tenantId);
    const start = Date.now() - 30 * DAY;

    await expect(
      proof.executeCommand(finance, M.VenueCommissionTerm_createViaDefine, {
        venueId,
        commissionPercent: 120,
        effectiveStartDate: start,
      }),
    ).rejects.toThrow(/between 0 and 100/);
    await expect(
      proof.executeCommand(finance, M.VenueCommissionTerm_createViaDefine, {
        venueId,
        commissionPercent: 10,
        effectiveStartDate: start,
        effectiveEndDate: start - DAY,
      }),
    ).rejects.toThrow(/end date can't be before its start date/);

    const term = await run(
      proof,
      finance,
      M.VenueCommissionTerm_createViaDefine,
      {
        venueId,
        commissionPercent: 10,
        effectiveStartDate: start,
      },
    );
    await proof.executeCommand(finance, M.VenueCommissionTerm_revise, {
      docId: term.docId,
      commissionPercent: 11,
    });
    await expect(
      proof.executeCommand(finance, M.VenueCommissionTerm_revise, {
        docId: term.docId,
        effectiveEndDate: start - DAY,
      }),
    ).rejects.toThrow(/end date can't be before its start date/);
    await proof.executeCommand(finance, M.VenueCommissionTerm_retire, {
      docId: term.docId,
    });

    const retired = await readDoc<Term>(finance, term.docId);
    expect(retired).toMatchObject({
      commissionPercent: 11,
      effectiveStartDate: start,
      status: "retired",
    });
    expect(retired.effectiveEndDate).toBeGreaterThanOrEqual(start);
    // Still listed for its window.
    const listed = (await finance.query(
      api.queries.listVenueCommissionTerm,
      {},
    )) as Term[];
    expect(listed.map((row) => row._id)).toContain(term.docId);

    await expect(
      proof.executeCommand(finance, M.VenueCommissionTerm_revise, {
        docId: term.docId,
        commissionPercent: 12,
      }),
    ).rejects.toThrow(/already retired/);
  });
});
