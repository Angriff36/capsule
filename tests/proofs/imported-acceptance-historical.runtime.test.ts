/**
 * PL-REVISION runtime proof (AC-098, AC-268 P leg): an imported event the
 * client agreed to before Capsule is recorded through the normal path - the
 * proposal is built from the event, sent (revision snapshot captured) and
 * accepted against that revision - then labeled with where the acceptance came
 * from. No SignatureRequest is made. The accepted revision stays the same after
 * later catalog and event edits. The label step cannot be called by a person,
 * so an acceptance signed in Capsule cannot be relabeled.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  proposalRow,
  S,
  seedWorld,
  type World,
} from "./proposal-generate.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Revision = {
  _id: string;
  revisionNumber: number;
  changeSummary: string;
  snapshot: unknown;
  capturedAt: number | null;
};

function recordAcceptance(w: World, source: string, evidence: string) {
  return w.sales.mutation(
    (api.lib as any).proposalHistoricalAcceptance.recordImportedAcceptance,
    { eventId: w.eventId, source, evidence },
  ) as Promise<{ proposalId: string; revisionId: string }>;
}

async function revisionsOf(w: World, proposalId: string): Promise<Revision[]> {
  return (await w.sales.query(api.queries.listProposalRevisionByProposalId, {
    proposalId,
  } as never)) as unknown as Revision[];
}

describe("acceptance from before Capsule (AC-098)", () => {
  it("records a labeled historical acceptance through the revision path, with no signature", async () => {
    const w = await seedWorld("tenant-imported-acceptance", { imported: true });

    const result = await recordAcceptance(
      w,
      "The old booking system",
      "Invoice 6014, signed paper on file",
    );
    const accepted = (await proposalRow(w, result.proposalId)) as Awaited<
      ReturnType<typeof proposalRow>
    > & {
      acceptedRevisionId: string | null;
      acceptanceSource: string | null;
      acceptanceEvidence: string | null;
      acceptedAt: number | null;
    };
    expect(accepted).toMatchObject({
      status: "accepted",
      eventId: w.eventId,
      acceptedRevisionId: result.revisionId,
      acceptanceSource: "The old booking system",
      acceptanceEvidence: "Invoice 6014, signed paper on file",
      guestCount: S.headcount,
    });
    expect(accepted.acceptedAt).not.toBeNull();

    // The normal snapshot path ran: one captured revision, named for its source.
    const revisions = await revisionsOf(w, result.proposalId);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      _id: result.revisionId,
      revisionNumber: 1,
      changeSummary: "Accepted before Capsule (from The old booking system)",
    });
    expect(revisions[0].capturedAt).not.toBeNull();

    // No signature was invented for it.
    const signatures = (await w.sales.query(
      api.queries.listSignatureRequest,
      {} as never,
    )) as unknown as unknown[];
    expect(signatures).toHaveLength(0);

    // The accepted revision stays the same after later catalog and event edits.
    const before = JSON.stringify(revisions[0].snapshot);
    const menuDishes = (await w.sales.query(
      api.queries.listMenuDish,
      {} as never,
    )) as unknown as { _id: string; dishId: string; version: number }[];
    const salmon = menuDishes.find((row) => row.dishId === w.dishes.salmon)!;
    await w.runOwner(M.MenuDish_updateSellingPrice, {
      docId: salmon._id,
      version: salmon.version,
      sellingPrice: 31,
    });
    await w.runOwner(M.EventDish_createViaAddToEvent, {
      eventId: w.eventId,
      dishId: w.dishes.tart,
      quantityServings: 40,
    });
    const after = await revisionsOf(w, result.proposalId);
    expect(after).toHaveLength(1);
    expect(JSON.stringify(after[0].snapshot)).toBe(before);
    expect(
      (await proposalRow(w, result.proposalId)) as unknown as {
        acceptedRevisionId: string;
      },
    ).toMatchObject({ acceptedRevisionId: result.revisionId });
  });

  it("refuses a second acceptance, a blank source, and a person calling the label step", async () => {
    const w = await seedWorld("tenant-imported-acceptance-refusals", {
      imported: true,
    });
    await expect(recordAcceptance(w, "  ", "Invoice 6014")).rejects.toThrow(
      /where the acceptance came from/,
    );
    const first = await recordAcceptance(
      w,
      "The old booking system",
      "Invoice 6014",
    );
    await expect(
      recordAcceptance(w, "The old booking system", "Invoice 6014"),
    ).rejects.toThrow(/already has an accepted proposal/);

    const row = (await proposalRow(w, first.proposalId)) as unknown as {
      version: number;
    };
    await expect(
      w.sales.mutation(M.Proposal_recordHistoricalAcceptance, {
        docId: first.proposalId,
        version: row.version,
        source: "Someone else",
        evidence: "Nothing",
      } as never),
    ).rejects.toThrow(/can't be started by hand/);
  });
});
