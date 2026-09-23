/**
 * Runtime proof (AC-407, §6.5 finalized-closeout slice of the plan-vs-fact
 * matrix): after finance finalizes the event closeout, a later commercial
 * correction on the Event keeps that finalized closeout exactly as recorded —
 * same id, status "finalized", money, headcounts, capture stamp and finalize
 * stamp. The locked actuals are history: they are never recalculated from the
 * restated quote, reopened to draft, or duplicated, and replaying the same
 * correction writes no second closeout.
 *
 * Proof only — the commands already exist; nothing here adds commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  captureCloseout,
  correctCommercial,
  finalizeCloseout,
  harness,
  listedCloseoutFacts,
  readEventRow,
  rolesFor,
  snapshotCloseout,
  walkToStage,
  type CloseoutFactRow,
  type CloseoutSnapshot,
  type Proof,
} from "./plan-vs-fact-finalized-closeout.runtime.helpers";

const NEW_QUOTED_PRICE = 6000;
const NEW_BUDGET_AMOUNT = 4000;
const CORRECTION_REASON = "Client restated the quote after closeout";
const SEED_HEADCOUNT = 40;

type CloseoutState = {
  roles: ReturnType<typeof rolesFor>;
  eventId: string;
  snapshot: CloseoutSnapshot;
};

/** The one live closeout, or a thrown error when the count is not 1. */
async function theOneLiveCloseout(
  finance: ReturnType<typeof rolesFor>["finance"],
  eventId: string,
): Promise<CloseoutFactRow> {
  const rows = await listedCloseoutFacts(finance, eventId);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/** Every money field of the live row still equals the frozen snapshot. */
function expectSameMoney(
  row: CloseoutFactRow,
  snapshot: CloseoutSnapshot,
): void {
  expect(Number(row.actualRevenue)).toBe(snapshot.actualRevenue);
  expect(Number(row.budgetedRevenue)).toBe(snapshot.budgetedRevenue);
  expect(Number(row.revenueVariance)).toBe(snapshot.revenueVariance);
  expect(Number(row.actualIngredientCost)).toBe(snapshot.actualIngredientCost);
  expect(Number(row.actualWasteCost)).toBe(snapshot.actualWasteCost);
  expect(Number(row.actualLaborCost)).toBe(snapshot.actualLaborCost);
  expect(Number(row.actualVendorCost)).toBe(snapshot.actualVendorCost);
  expect(Number(row.budgetedCost)).toBe(snapshot.budgetedCost);
  expect(Number(row.totalActualCost)).toBe(snapshot.totalActualCost);
  expect(Number(row.costVariance)).toBe(snapshot.costVariance);
  expect(Number(row.grossProfit)).toBe(snapshot.grossProfit);
}

/** Seed the event to closed_out, confirm the reaction-seeded draft, recapture
 * the real actuals on that same draft, finalize it as finance, snapshot the
 * finalized row, then restate the Event commercial seed. */
async function seedFinalizedCloseoutThenChange(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<CloseoutState> {
  const roles = rolesFor(proof, tenantId);
  const { eventId } = await walkToStage(proof, tenantId, "closed_out", title);

  // The EventClosedOut reaction seeded exactly one zero-actual draft from the
  // quoted price.
  const drafts = await listedCloseoutFacts(roles.finance, eventId);
  expect(drafts).toHaveLength(1);
  const draft: CloseoutFactRow = drafts[0]!;
  expect(draft.status).toBe("draft");
  expect(Number(draft.actualRevenue)).toBe(0);
  expect(Number(draft.budgetedRevenue)).toBe(4500);
  expect(Number(draft.expectedHeadcount)).toBe(SEED_HEADCOUNT);
  expect(draft.capturedAt).toEqual(expect.any(Number));
  expect(draft.finalizedAt ?? null).toBeNull();
  expect(draft.deletedAt ?? null).toBeNull();

  await captureCloseout(proof, tenantId, draft._id, eventId);

  const liveAfterCapture = await theOneLiveCloseout(roles.finance, eventId);
  await finalizeCloseout(
    proof,
    tenantId,
    liveAfterCapture._id,
    liveAfterCapture.version,
  );

  // The finalized closeout as recorded, BEFORE any commercial correction.
  const finalizedRow = await theOneLiveCloseout(roles.finance, eventId);
  const snapshot = snapshotCloseout(finalizedRow);
  expect(snapshot.status).toBe("finalized");
  expect(snapshot.finalizedAt).toEqual(expect.any(Number));
  expect(snapshot.capturedAt).toEqual(expect.any(Number));
  expect(snapshot.actualRevenue).toBe(4500);
  expect(snapshot.totalActualCost).toBe(1950);
  expect(snapshot.grossProfit).toBe(2550);
  expect(snapshot.expectedHeadcount).toBe(SEED_HEADCOUNT);
  expect(snapshot.actualHeadcount).toBe(38);

  await correctCommercial(
    proof,
    tenantId,
    eventId,
    NEW_BUDGET_AMOUNT,
    NEW_QUOTED_PRICE,
    CORRECTION_REASON,
  );

  const event = await readEventRow(roles.events, eventId);
  expect(event.stage).toBe("closed_out");
  expect(Number(event.quotedPrice)).toBe(NEW_QUOTED_PRICE);
  expect(Number(event.budgetAmount)).toBe(NEW_BUDGET_AMOUNT);
  expect(Number(event.expectedHeadcount)).toBe(SEED_HEADCOUNT);

  return { roles, eventId, snapshot };
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: AC-407 §6.5 finalized closeout (plan vs fact)", () => {
  it("one commercial correction after finalize keeps the frozen closeout", async () => {
    const tenantId = "tenant-ac407-closeout-keep";
    const proof = harness();
    const { roles, eventId, snapshot } = await seedFinalizedCloseoutThenChange(
      proof,
      tenantId,
      "AC-407 closeout keep",
    );

    // Exactly one live closeout: the finalized one. The correction invents no
    // second closeout from the restated seed.
    const row = await theOneLiveCloseout(roles.finance, eventId);
    expect(row._id).toBe(snapshot._id);
    expect(row.status).toBe("finalized");
    expect(row.status).not.toBe("draft");
    expectSameMoney(row, snapshot);
    expect(Number(row.expectedHeadcount)).toBe(SEED_HEADCOUNT);
    expect(Number(row.actualHeadcount)).toBe(38);
    expect(row.capturedAt).toBe(snapshot.capturedAt);
    expect(row.finalizedAt).toBe(snapshot.finalizedAt);
    expect(row.eventId).toBe(snapshot.eventId);
    expect(row.deletedAt ?? null).toBeNull();

    // The Event seed changed; the closeout did not.
    const event = await readEventRow(roles.events, eventId);
    expect(Number(event.quotedPrice)).toBe(NEW_QUOTED_PRICE);
    expect(Number(event.budgetAmount)).toBe(NEW_BUDGET_AMOUNT);
    expect(Number(event.expectedHeadcount)).toBe(SEED_HEADCOUNT);
  });

  it("replaying the same commercial correction after finalize does not rewrite the frozen closeout", async () => {
    const tenantId = "tenant-ac407-closeout-replay";
    const proof = harness();
    const { roles, eventId, snapshot } = await seedFinalizedCloseoutThenChange(
      proof,
      tenantId,
      "AC-407 closeout replay",
    );

    // Replay the identical correction (same 4000 / 6000). A version bump from
    // the first correction is tolerated: re-read and retry once.
    await correctCommercial(
      proof,
      tenantId,
      eventId,
      NEW_BUDGET_AMOUNT,
      NEW_QUOTED_PRICE,
      CORRECTION_REASON,
    );

    // Still exactly one live closeout, and the finalized row is untouched:
    // no second finalize stamp, no second closeout row.
    const row = await theOneLiveCloseout(roles.finance, eventId);
    expect(row._id).toBe(snapshot._id);
    expect(row.status).toBe("finalized");
    expect(row.finalizedAt).toBe(snapshot.finalizedAt);
    expectSameMoney(row, snapshot);
    expect(Number(row.expectedHeadcount)).toBe(SEED_HEADCOUNT);
    expect(Number(row.actualHeadcount)).toBe(38);
    expect(row.deletedAt ?? null).toBeNull();
  });
});
