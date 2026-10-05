/**
 * PL-CLOSEOUT runtime proof, AC-626 (spec §15.3 history): finalizing freezes
 * the closeout numbers with the records behind them; a later change goes
 * through an audited correction (reason, finance manager, next revision)
 * that makes a new result and keeps the earlier one readable.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  SOURCE,
  closedOutEvent,
  closeoutRow,
  ensureEncryptionKey,
  harness,
  rolesFor,
  seedSources,
} from "./closeout-sources.runtime.helpers";

beforeAll(ensureEncryptionKey);

const T = "tenant-closeout-correction";

type Result = {
  revision: number;
  kind: string;
  reason: string | null;
  totalActualCost: number;
  grossProfit: number;
  sourceSnapshot: string | null;
};

describe("finalized closeout correction (AC-626)", () => {
  it("freezes the first result and a correction makes a new one without rewriting it", async () => {
    const proof = harness();
    const { finance } = rolesFor(proof, T);
    const { eventId, invoiceId } = await closedOutEvent(proof, T, "Correct");
    const seed = await seedSources(proof, T, eventId, invoiceId!);
    const cost =
      SOURCE.foodReceived +
      SOURCE.waste +
      SOURCE.labor +
      SOURCE.rental +
      SOURCE.commission;

    await proof.executeCommand(
      finance,
      api.closeoutSources.captureCloseoutFromSources,
      { eventId } as never,
    );
    const draft = await closeoutRow(finance, eventId);
    await proof.executeCommand(finance, api.mutations.EventCloseout_finalize, {
      docId: draft._id,
      version: draft.version,
    } as never);
    const finalized = await closeoutRow(finance, eventId);
    expect(finalized).toMatchObject({
      status: "finalized",
      revision: 1,
      totalActualCost: cost,
    });
    const firstSnapshot = finalized.sourceSnapshot as string;
    expect(firstSnapshot).toContain(seed.ids.waste);

    // Frozen: capture no longer writes to it.
    await expect(
      proof.executeCommand(
        finance,
        api.closeoutSources.captureCloseoutFromSources,
        { eventId } as never,
      ),
    ).rejects.toThrow(/final/);

    // More waste turns up after finalizing.
    const lateWaste = (await finance.run(async (ctx) =>
      (ctx.db as any).insert("wasteRecords", {
        tenantId: T,
        version: 1,
        eventId,
        ingredientId: seed.ids.ingredient,
        locationId: seed.ids.location,
        quantity: 4,
        unit: "pound",
        reason: "spoilage",
        unitCost: 10,
        status: "recorded",
      }),
    )) as string;

    // Refused: no reason, and a finance clerk (not a finance manager).
    await expect(
      proof.executeCommand(
        finance,
        api.closeoutSources.correctCloseoutFromSources,
        { closeoutId: finalized._id, reason: "  " } as never,
      ),
    ).rejects.toThrow(/Say why/);
    const clerk = proof.asRole({
      subject: "finance-clerk",
      role: "finance_staff",
      tenantId: T,
    });
    await expect(
      proof.executeCommand(
        clerk,
        api.closeoutSources.correctCloseoutFromSources,
        { closeoutId: finalized._id, reason: "late waste" } as never,
      ),
    ).rejects.toThrow();
    expect(await closeoutRow(finance, eventId)).toMatchObject({ revision: 1 });

    await proof.executeCommand(
      finance,
      api.closeoutSources.correctCloseoutFromSources,
      {
        closeoutId: finalized._id,
        reason: "Spoiled chicken logged late",
      } as never,
    );
    const corrected = await closeoutRow(finance, eventId);
    expect(corrected).toMatchObject({
      status: "finalized",
      revision: 2,
      correctionReason: "Spoiled chicken logged late",
      actualWasteCost: SOURCE.waste + 40,
      totalActualCost: cost + 40,
      grossProfit: seed.invoiceTotal - cost - 40,
    });
    expect(corrected.sourceSnapshot).toContain(String(lateWaste));

    // Both results stay readable; the first is unchanged.
    const results = (await finance.query(api.closeoutSources.closeoutResults, {
      closeoutId: finalized._id,
    } as never)) as Result[];
    expect(results.map((r) => [r.revision, r.kind])).toEqual([
      [1, "finalized"],
      [2, "corrected"],
    ]);
    expect(results[0]).toMatchObject({
      reason: null,
      totalActualCost: cost,
      grossProfit: seed.invoiceTotal - cost,
      sourceSnapshot: firstSnapshot,
    });
    expect(results[1]).toMatchObject({
      reason: "Spoiled chicken logged late",
      totalActualCost: cost + 40,
    });

    // The ledger row of the correction carries the numbers it replaced.
    const ledger = (await finance.run(async (ctx) =>
      (await ctx.db.query("manifestEvents").collect()).find(
        (row: Record<string, unknown>) =>
          row.type === "EventCloseoutCorrected" &&
          row.entityId === String(finalized._id),
      ),
    )) as { payload: Record<string, unknown> };
    expect(ledger.payload).toMatchObject({
      previousTotalActualCost: cost,
      previousSourceSnapshot: firstSnapshot,
      revision: 2,
    });
  });
});
