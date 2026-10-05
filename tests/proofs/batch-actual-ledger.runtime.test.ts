/**
 * Runtime proof (AC-491 BE-11.3): completing a batch records the counted
 * yield (zero included), variance, waste and who did it, keeps the plan
 * frozen, marks its allocations produced, and emits the explicit
 * ProductionBatchCompleted event other domains can consume. A quality check
 * on the batch records its result against the batch.
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

describe("batch actuals ledger", () => {
  it("completing a batch records yield, keeps the plan frozen, marks allocations produced, and emits the explicit event other domains can consume", async () => {
    const proof = harness();
    const tenantId = "tenant-batch-actual-ledger";
    const { cook, personId } = await linkedCook(proof, tenantId);
    const seed = await plannedBatch(proof, tenantId, cook, 40);

    await proof.executeCommand(cook, M.ProductionBatch_start, {
      docId: seed.batchId,
    });
    await proof.executeCommand(cook, M.ProductionBatch_complete, {
      docId: seed.batchId,
      actualYield: 36,
      wasteQuantity: 2,
      wasteReason: "Two trays scorched",
    });

    const batch = await readDoc<BatchRow>(cook, seed.batchId);
    expect(batch.status).toBe("completed");
    expect(Number(batch.plannedYield)).toBe(40);
    expect(Number(batch.actualYield)).toBe(36);
    expect(Number(batch.wasteQuantity)).toBe(2);
    expect(batch.wasteReason).toBe("Two trays scorched");
    expect(Number(batch.shortfallQuantity)).toBe(4);
    expect(batch.startedById).toBe(personId);
    expect(batch.completedById).toBe(personId);

    const allocation = await readDoc<{ status: string }>(
      cook,
      seed.allocationId,
    );
    expect(allocation.status).toBe("produced");

    const completed = await eventsOfType(cook, "ProductionBatchCompleted");
    expect(completed).toHaveLength(1);
    expect(completed[0]!.payload).toMatchObject({
      productionBatchId: seed.batchId,
      eventId: seed.eventId,
      plannedYield: 40,
      actualYield: 36,
      shortfallQuantity: 4,
      wasteQuantity: 2,
      wasteReason: "Two trays scorched",
      completedById: personId,
    });

    // Quality result recorded against the batch.
    const check = (await proof.executeCommand(
      cook,
      M.QualityCheck_createViaOpen,
      { productionBatchId: seed.batchId },
    )) as { docId: string };
    await proof.executeCommand(cook, M.QualityCheck_pass, {
      docId: check.docId,
      notes: "Tender, seasoned",
    });
    const quality = await readDoc<{
      result: string;
      productionBatchId: string;
      checkedById: string;
    }>(cook, check.docId);
    expect(quality).toMatchObject({
      result: "pass",
      productionBatchId: seed.batchId,
      checkedById: personId,
    });
  });

  it("a zero count is kept as zero, and wasted food needs a reason", async () => {
    const proof = harness();
    const tenantId = "tenant-batch-actual-zero";
    const { cook } = await linkedCook(proof, tenantId);
    const seed = await plannedBatch(proof, tenantId, cook, 12);
    await proof.executeCommand(cook, M.ProductionBatch_start, {
      docId: seed.batchId,
    });

    await expect(
      proof.executeCommand(cook, M.ProductionBatch_complete, {
        docId: seed.batchId,
        actualYield: 0,
        wasteQuantity: 12,
      }),
    ).rejects.toThrow("Say why the food was wasted.");

    await proof.executeCommand(cook, M.ProductionBatch_complete, {
      docId: seed.batchId,
      actualYield: 0,
      wasteQuantity: 12,
      wasteReason: "Dropped the hotel pan",
    });
    const batch = await readDoc<BatchRow>(cook, seed.batchId);
    expect(batch.actualYield).toBe(0);
    expect(Number(batch.plannedYield)).toBe(12);
    expect(Number(batch.shortfallQuantity)).toBe(12);
  });
});
