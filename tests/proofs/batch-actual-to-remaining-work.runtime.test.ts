/**
 * Runtime proof (AC-458 BE-9.6): a batch that comes out short of plan leaves
 * explicit remaining work (the shortfall) and never rewrites plannedYield.
 * A make-up batch settles the shortfall through its own planned event; a
 * person can also settle it with a reason. A later fix to the count keeps
 * the first count in the event log and moves the remaining work with it.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type BatchRow,
  eventsOfType,
  harness,
  linkedCook,
  M,
  plannedBatch,
  readDoc,
} from "./batch-actuals.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("batch actuals return to remaining work", () => {
  it("completing a batch short of plan increases remaining work through an explicit event and leaves plannedYield unchanged", async () => {
    const proof = harness();
    const tenantId = "tenant-batch-remaining-work";
    const { cook, personId } = await linkedCook(proof, tenantId);
    const seed = await plannedBatch(proof, tenantId, cook, 50);
    await proof.executeCommand(cook, M.ProductionBatch_start, {
      docId: seed.batchId,
    });
    await proof.executeCommand(cook, M.ProductionBatch_complete, {
      docId: seed.batchId,
      actualYield: 42,
    });

    let batch = await readDoc<BatchRow>(cook, seed.batchId);
    expect(Number(batch.plannedYield)).toBe(50);
    expect(Number(batch.shortfallQuantity)).toBe(8);
    expect(batch.shortfallResolvedAt ?? null).toBeNull();
    const [completed] = await eventsOfType(cook, "ProductionBatchCompleted");
    expect(completed!.payload).toMatchObject({ shortfallQuantity: 8 });

    // The count was wrong: 45 made, not 42. The first count stays on record.
    await expect(
      proof.executeCommand(cook, M.ProductionBatch_correctYield, {
        docId: seed.batchId,
        actualYield: 45,
        reason: " ",
      }),
    ).rejects.toThrow("Say why you're changing the counted yield.");
    await proof.executeCommand(cook, M.ProductionBatch_correctYield, {
      docId: seed.batchId,
      actualYield: 45,
      reason: "Missed a sheet pan in the walk-in",
    });
    batch = await readDoc<BatchRow>(cook, seed.batchId);
    expect(Number(batch.actualYield)).toBe(45);
    expect(Number(batch.shortfallQuantity)).toBe(5);
    expect(Number(batch.plannedYield)).toBe(50);
    expect(batch.yieldCorrectedById).toBe(personId);
    const [corrected] = await eventsOfType(
      cook,
      "ProductionBatchYieldCorrected",
    );
    expect(corrected!.payload).toMatchObject({
      previousActualYield: 42,
      actualYield: 45,
      shortfallQuantity: 5,
      plannedYield: 50,
    });

    // A make-up batch for the missing 5 settles the remaining work.
    const makeUp = (await proof.executeCommand(
      cook,
      M.ProductionBatch_createViaPlan,
      {
        componentId: seed.componentId,
        plannedYield: 5,
        yieldUnit: "portion",
        eventId: seed.eventId,
        makeUpForBatchId: seed.batchId,
      },
    )) as { docId: string };
    batch = await readDoc<BatchRow>(cook, seed.batchId);
    expect(batch.shortfallResolvedAt).toEqual(expect.any(Number));
    expect(batch.shortfallResolution).toBe("Make-up batch planned");
    expect(Number(batch.plannedYield)).toBe(50);
    const makeUpRow = await readDoc<BatchRow>(cook, makeUp.docId);
    expect(makeUpRow.makeUpForBatchId).toBe(seed.batchId);
    const resolved = await eventsOfType(
      cook,
      "ProductionBatchShortfallResolved",
    );
    expect(resolved).toHaveLength(1);

    // A second answer does not overwrite the first.
    await proof.executeCommand(cook, M.ProductionBatch_resolveShortfall, {
      docId: seed.batchId,
      resolution: "Surplus covers it",
    });
    batch = await readDoc<BatchRow>(cook, seed.batchId);
    expect(batch.shortfallResolution).toBe("Make-up batch planned");
  });

  it("a person can settle the shortfall with a reason instead of cooking more", async () => {
    const proof = harness();
    const tenantId = "tenant-batch-shortfall-settle";
    const { cook } = await linkedCook(proof, tenantId);
    const seed = await plannedBatch(proof, tenantId, cook, 20);
    await proof.executeCommand(cook, M.ProductionBatch_start, {
      docId: seed.batchId,
    });
    await proof.executeCommand(cook, M.ProductionBatch_complete, {
      docId: seed.batchId,
      actualYield: 18,
    });
    await expect(
      proof.executeCommand(cook, M.ProductionBatch_resolveShortfall, {
        docId: seed.batchId,
        resolution: "",
      }),
    ).rejects.toThrow("Say how the missing amount was handled.");
    await proof.executeCommand(cook, M.ProductionBatch_resolveShortfall, {
      docId: seed.batchId,
      resolution: "Guest count dropped by two",
    });
    const batch = await readDoc<BatchRow>(cook, seed.batchId);
    expect(batch.shortfallResolution).toBe("Guest count dropped by two");
    expect(Number(batch.shortfallQuantity)).toBe(2);
    expect(Number(batch.plannedYield)).toBe(20);
  });
});
