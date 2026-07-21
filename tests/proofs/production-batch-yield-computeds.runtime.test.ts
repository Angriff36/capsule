/**
 * Runtime proof: ProductionBatch yield variance computeds
 * (yieldVariance, varianceRatio, fulfillmentRatio)
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { computeProductionBatch } from "../../convex/computed";

const S = {
  tenantId: "tenant-s3-yield-computeds",
  plannedYield: 100,
  actualYield: 110,
} as const;

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

describe("runtime proof: ProductionBatch yield variance computeds", () => {
  it("computes yieldVariance, varianceRatio, fulfillmentRatio when actualYield captured", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "s3-yield-computeds",
      role: "kitchen_manager",
      tenantId: S.tenantId,
    });

    const recipe = (await proof.executeCommand(
      kitchen,
      api.mutations.Recipe_createViaDraft,
      {
        name: "Yield test recipe",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    )) as { docId: string };

    await proof.executeCommand(kitchen, api.mutations.Recipe_publishVersion, {
      docId: recipe.docId,
      version: 1,
    });

    const batch = (await proof.executeCommand(
      kitchen,
      api.mutations.ProductionBatch_createViaPlan,
      {
        recipeId: recipe.docId,
        plannedYield: S.plannedYield,
        yieldUnit: "portion",
      },
    )) as { docId: string; version: number };

    // Before actualYield is captured, computeds are null
    const before = await kitchen.run(async (ctx) => {
      const b = await ctx.db.get(batch.docId);
      const computeds = computeProductionBatch(b as Record<string, any>);
      return { ...b, ...computeds };
    });

    expect(before.actualYield).toBeUndefined();
    expect(before.yieldVariance).toBeNull();
    expect(before.varianceRatio).toBeNull();
    expect(before.fulfillmentRatio).toBeNull();

    // Get current version
    const currentVersion = (before as { version?: number }).version ?? 0;

    // Start the batch
    await proof.executeCommand(kitchen, api.mutations.ProductionBatch_start, {
      docId: batch.docId,
      version: currentVersion,
    });

    // Complete the batch with actualYield
    await proof.executeCommand(
      kitchen,
      api.mutations.ProductionBatch_complete,
      {
        docId: batch.docId,
        actualYield: S.actualYield,
        version: currentVersion + 1,
      },
    );

    // After actualYield is captured, computeds are available
    const after = await kitchen.run(async (ctx) => {
      const b = await ctx.db.get(batch.docId);
      const computeds = computeProductionBatch(b as Record<string, any>);
      return { ...b, ...computeds };
    });

    // yieldVariance = actual - planned = 110 - 100 = 10
    expect(Number(after.yieldVariance)).toBe(10);

    // varianceRatio = (actual - planned) / planned = (110 - 100) / 100 = 0.1
    expect(Number(after.varianceRatio)).toBeCloseTo(0.1, 4);

    // fulfillmentRatio = actual / planned = 110 / 100 = 1.1
    expect(Number(after.fulfillmentRatio)).toBeCloseTo(1.1, 4);
  });
});
