/**
 * Runtime proof (AC-043, RR-2): the generated ComponentImport /
 * ComponentImportLine review lifecycle is executable end to end through the
 * real generated mutations — upload → recordParse → beginReview → staging →
 * existing/new ingredient linking → revision-checked corrections → approval →
 * finalization → component link → completion.
 *
 * Why this proof exists: the authored relation guards used to dereference the
 * OLD stored foreign key before assigning the supplied one, so no new link
 * could ever be confirmed (recordComponent / confirmExisting /
 * attachCreatedIngredient). The repaired shapes validate supplied targets
 * through the tenant-scoped belongsTo relations, keep the original source
 * untouched through corrections, and refuse stale revisions, foreign-tenant
 * targets, and edits to completed/ready imports without writing.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-import-review";
const OTHER_TENANT = "tenant-import-review-other";

const RAW_SOURCE = `House Herb Oil

Yield: 2 cups

Ingredients:
2 cups olive oil
1/4 cup parsley, chopped

Instructions:
Warm oil gently and steep herbs.`;

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

type Doc = { docId: string };

async function introduceIngredient(
  proof: ReturnType<typeof harness>,
  role: ReturnType<ReturnType<typeof harness>["asRole"]>,
  name: string,
): Promise<Doc> {
  return (await proof.executeCommand(
    role,
    api.mutations.Ingredient_createViaIntroduce,
    {
      name,
      unit: "cup",
      costPerUnit: 0.05,
      allergens: [],
    },
  )) as Doc;
}

/** Drive one import to status "reviewing" with both lines staged. */
async function startReview(
  proof: ReturnType<typeof harness>,
  role: ReturnType<ReturnType<typeof harness>["asRole"]>,
  fingerprint: string,
) {
  const uploaded = (await proof.executeCommand(
    role,
    api.mutations.ComponentImport_createViaUpload,
    {
      sourceKind: "pasted_text",
      rawSourceText: RAW_SOURCE,
      sourceByteCount: RAW_SOURCE.length,
      sourceFingerprint: fingerprint,
    },
  )) as Doc;
  await proof.executeCommand(role, api.mutations.ComponentImport_recordParse, {
    docId: uploaded.docId,
    parsedName: "House Herb Oil",
    parsedLineCount: 2,
    parsedYieldQuantity: 2,
    parsedYieldUnit: "cup",
    parsedInstructions: "Warm oil gently and steep herbs.",
  });
  await proof.executeCommand(role, api.mutations.ComponentImport_beginReview, {
    docId: uploaded.docId,
  });
  const lineOne = (await proof.executeCommand(
    role,
    api.mutations.ComponentImportLine_createViaStage,
    {
      importId: uploaded.docId,
      sourceOrder: 0,
      sourceLine: "2 cups olive oil",
      parsedQuantity: 2,
      parsedUnit: "cup",
      parsedIngredientName: "Olive Oil",
    },
  )) as Doc;
  const lineTwo = (await proof.executeCommand(
    role,
    api.mutations.ComponentImportLine_createViaStage,
    {
      importId: uploaded.docId,
      sourceOrder: 1,
      sourceLine: "1/4 cup parsley, chopped",
      parsedQuantity: 0.25,
      parsedUnit: "cup",
      parsedIngredientName: "Parsley",
    },
  )) as Doc;
  return {
    importId: uploaded.docId,
    lineOne: lineOne.docId,
    lineTwo: lineTwo.docId,
  };
}

describe("runtime proof: component import review lifecycle", () => {
  it("completes the generated lifecycle, preserves source, and records target ids", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "import-review-chef",
      role: "kitchen_manager",
      tenantId: TENANT,
    });

    const existingOliveOil = await introduceIngredient(
      proof,
      kitchen,
      "Olive Oil",
    );
    const { importId, lineOne, lineTwo } = await startReview(
      proof,
      kitchen,
      "sha-review-1",
    );

    // Line one: suggest then confirm an existing tenant ingredient.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_suggestExactMatch,
      {
        docId: lineOne,
        matchedIngredientId: existingOliveOil.docId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_confirmExisting,
      {
        docId: lineOne,
        matchedIngredientId: existingOliveOil.docId,
      },
    );

    // Line two: confirm new, create the ingredient, attach it.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_confirmNew,
      {
        docId: lineTwo,
      },
    );
    const createdParsley = await introduceIngredient(proof, kitchen, "Parsley");
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_attachCreatedIngredient,
      {
        docId: lineTwo,
        matchedIngredientId: createdParsley.docId,
      },
    );

    // Revision-checked corrections: header revision bumps 0 -> 1; the line
    // measurement edit requires that current revision.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_reviseReview,
      {
        docId: importId,
        expectedReviewRevision: 0,
        parsedName: "House Herb Oil",
        parsedYieldQuantity: 2.5,
        parsedYieldUnit: "cup",
        parsedBatchMultiplier: 1,
        parsedInstructions: "Warm oil gently and steep herbs.",
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_reviseMeasurements,
      {
        docId: lineOne,
        expectedReviewRevision: 1,
        parsedQuantity: 1.75,
        parsedUnit: "cup",
        preparationNote: "extra virgin",
      },
    );

    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_recordResolutionProgress,
      { docId: importId, resolvedLineCount: 2 },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_approveReview,
      {
        docId: importId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_beginFinalization,
      {
        docId: importId,
        expectedReviewRevision: 1,
      },
    );
    const component = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      { name: "House Herb Oil", yieldQuantity: 2.5, yieldUnit: "cup" },
    )) as Doc;
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_recordComponent,
      {
        docId: importId,
        resultingComponentId: component.docId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_complete,
      {
        docId: importId,
      },
    );

    const snapshot = await kitchen.run(async (ctx) => {
      const row = await ctx.db.get(importId as never);
      const first = await ctx.db.get(lineOne as never);
      const second = await ctx.db.get(lineTwo as never);
      return { row, first, second };
    });

    expect(snapshot.row).toMatchObject({
      status: "completed",
      resultingComponentId: component.docId,
      reviewRevision: 1,
      parsedYieldQuantity: 2.5,
      rawSourceText: RAW_SOURCE,
      sourceFingerprint: "sha-review-1",
      sourceKind: "pasted_text",
    });
    expect(snapshot.row?.completedAt).toBeTruthy();
    expect(snapshot.first).toMatchObject({
      matchStatus: "confirmed_existing",
      matchedIngredientId: existingOliveOil.docId,
      parsedQuantity: 1.75,
      preparationNote: "extra virgin",
      sourceLine: "2 cups olive oil",
    });
    expect(snapshot.first?.revisedAt).toBeTruthy();
    expect(snapshot.second).toMatchObject({
      matchStatus: "confirmed_new",
      matchedIngredientId: createdParsley.docId,
      sourceLine: "1/4 cup parsley, chopped",
    });
    expect(snapshot.second?.resolvedAt).toBeTruthy();
  });

  it("rejects stale revisions, foreign-tenant targets, and foreign actors without writes", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "import-review-stale-chef",
      role: "kitchen_manager",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "import-review-outsider",
      role: "kitchen_manager",
      tenantId: OTHER_TENANT,
    });

    const existing = await introduceIngredient(proof, kitchen, "Olive Oil");
    const foreign = await introduceIngredient(
      proof,
      outsider,
      "Outsider Spice",
    );
    const { importId, lineOne } = await startReview(
      proof,
      kitchen,
      "sha-review-stale",
    );

    // One header save moves the revision to 1.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_reviseReview,
      {
        docId: importId,
        expectedReviewRevision: 0,
        parsedName: "House Herb Oil",
      },
    );

    const before = await kitchen.run(async (ctx) => ({
      row: await ctx.db.get(importId as never),
      line: await ctx.db.get(lineOne as never),
    }));

    // Stale parent revision: header save and measurement save both refuse.
    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.ComponentImport_reviseReview,
        {
          docId: importId,
          expectedReviewRevision: 0,
          parsedName: "Renamed Oil",
        },
      ),
    ).rejects.toThrow(/Guard/);
    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.ComponentImportLine_reviseMeasurements,
        { docId: lineOne, expectedReviewRevision: 0, parsedQuantity: 9 },
      ),
    ).rejects.toThrow(/Guard/);

    // Foreign-tenant ingredient: the suggestion may be stored, but the
    // confirmation refuses — no resolution write happens.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_suggestExactMatch,
      {
        docId: lineOne,
        matchedIngredientId: foreign.docId,
      },
    );
    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.ComponentImportLine_confirmExisting,
        {
          docId: lineOne,
          matchedIngredientId: foreign.docId,
        },
      ),
    ).rejects.toThrow(/Guard/);
    const afterForeignConfirm = await kitchen.run(async (ctx) =>
      ctx.db.get(lineOne as never),
    );
    expect(afterForeignConfirm?.resolvedAt).toBeFalsy();
    expect(afterForeignConfirm?.matchStatus).toBe("exact");

    // Recovery: suggest and confirm the tenant's own ingredient.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_suggestExactMatch,
      {
        docId: lineOne,
        matchedIngredientId: existing.docId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_confirmExisting,
      {
        docId: lineOne,
        matchedIngredientId: existing.docId,
      },
    );
    const recovered = await kitchen.run(async (ctx) =>
      ctx.db.get(lineOne as never),
    );
    expect(recovered?.matchStatus).toBe("confirmed_existing");
    expect(recovered?.matchedIngredientId).toBe(existing.docId);

    // A foreign actor cannot touch this tenant's import at all.
    await expect(
      proof.executeCommand(
        outsider,
        api.mutations.ComponentImport_reviseReview,
        {
          docId: importId,
          expectedReviewRevision: 1,
          parsedName: "Stolen Oil",
        },
      ),
    ).rejects.toThrow(/ComponentImport not found/i);

    const after = await kitchen.run(async (ctx) => ({
      row: await ctx.db.get(importId as never),
      line: await ctx.db.get(lineOne as never),
    }));
    expect(after.row).toMatchObject({
      reviewRevision: 1,
      parsedName: "House Herb Oil",
      rawSourceText: RAW_SOURCE,
    });
    expect(after.line?.parsedQuantity).toBe(before.line?.parsedQuantity);
  });

  it("refuses completion while a foreign component or foreign ingredient link is stored", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "import-review-final-chef",
      role: "kitchen_manager",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "import-review-final-outsider",
      role: "kitchen_manager",
      tenantId: OTHER_TENANT,
    });

    const existing = await introduceIngredient(proof, kitchen, "Olive Oil");
    const foreignIngredient = await introduceIngredient(
      proof,
      outsider,
      "Foreign Herb",
    );
    const foreignComponent = (await proof.executeCommand(
      outsider,
      api.mutations.Component_createViaDraft,
      { name: "Foreign Component", yieldQuantity: 1, yieldUnit: "cup" },
    )) as Doc;

    const { importId, lineOne, lineTwo } = await startReview(
      proof,
      kitchen,
      "sha-review-final",
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_suggestExactMatch,
      {
        docId: lineOne,
        matchedIngredientId: existing.docId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_confirmExisting,
      {
        docId: lineOne,
        matchedIngredientId: existing.docId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_confirmNew,
      {
        docId: lineTwo,
      },
    );
    // The foreign created-ingredient link is stored, but completion must
    // refuse it: the link does not resolve to this tenant's live ingredient.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_attachCreatedIngredient,
      { docId: lineTwo, matchedIngredientId: foreignIngredient.docId },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_recordResolutionProgress,
      { docId: importId, resolvedLineCount: 2 },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_approveReview,
      {
        docId: importId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_beginFinalization,
      {
        docId: importId,
        expectedReviewRevision: 0,
      },
    );

    // Foreign component id: stored by recordComponent, refused at completion.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_recordComponent,
      {
        docId: importId,
        resultingComponentId: foreignComponent.docId,
      },
    );
    await expect(
      proof.executeCommand(kitchen, api.mutations.ComponentImport_complete, {
        docId: importId,
      }),
    ).rejects.toThrow(/Guard/);

    // Own component, foreign ingredient link still blocks completion.
    const ownComponent = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      { name: "House Herb Oil", yieldQuantity: 2, yieldUnit: "cup" },
    )) as Doc;
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_recordComponent,
      {
        docId: importId,
        resultingComponentId: ownComponent.docId,
      },
    );
    await expect(
      proof.executeCommand(kitchen, api.mutations.ComponentImport_complete, {
        docId: importId,
      }),
    ).rejects.toThrow(/Guard/);
    const blocked = await kitchen.run(async (ctx) =>
      ctx.db.get(importId as never),
    );
    expect(blocked?.status).toBe("finalizing");
    expect(blocked?.completedAt).toBeFalsy();

    // Recovery: attach the tenant's own created ingredient and complete.
    const ownParsley = await introduceIngredient(proof, kitchen, "Parsley");
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_attachCreatedIngredient,
      { docId: lineTwo, matchedIngredientId: ownParsley.docId },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_complete,
      {
        docId: importId,
      },
    );
    const completed = await kitchen.run(async (ctx) =>
      ctx.db.get(importId as never),
    );
    expect(completed).toMatchObject({
      status: "completed",
      resultingComponentId: ownComponent.docId,
    });
  });

  it("keeps completed and ready imports immutable and resumes ready reviews for correction", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "import-review-immutable-chef",
      role: "kitchen_manager",
      tenantId: TENANT,
    });

    const existing = await introduceIngredient(proof, kitchen, "Olive Oil");
    const { importId, lineOne, lineTwo } = await startReview(
      proof,
      kitchen,
      "sha-review-frozen",
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_suggestExactMatch,
      {
        docId: lineOne,
        matchedIngredientId: existing.docId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_confirmExisting,
      {
        docId: lineOne,
        matchedIngredientId: existing.docId,
      },
    );
    const created = await introduceIngredient(proof, kitchen, "Parsley");
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_confirmNew,
      {
        docId: lineTwo,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_attachCreatedIngredient,
      { docId: lineTwo, matchedIngredientId: created.docId },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_recordResolutionProgress,
      { docId: importId, resolvedLineCount: 2 },
    );

    // A ready (approved) review is not directly editable: corrections resume it.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_approveReview,
      {
        docId: importId,
      },
    );
    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.ComponentImport_reviseReview,
        {
          docId: importId,
          expectedReviewRevision: 0,
          parsedName: "Renamed Oil",
        },
      ),
    ).rejects.toThrow(/Guard/);
    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.ComponentImportLine_reviseMeasurements,
        { docId: lineOne, expectedReviewRevision: 0, parsedQuantity: 3 },
      ),
    ).rejects.toThrow(/Guard/);

    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_resumeReview,
      {
        docId: importId,
      },
    );
    const resumed = await kitchen.run(async (ctx) =>
      ctx.db.get(importId as never),
    );
    expect(resumed).toMatchObject({ status: "reviewing" });
    expect(resumed?.readyAt).toBeNull();

    // After the resume demotion the measurement can be corrected and the
    // review re-approved.
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImportLine_reviseMeasurements,
      {
        docId: lineOne,
        expectedReviewRevision: 0,
        parsedQuantity: 3,
        parsedUnit: "cup",
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_approveReview,
      {
        docId: importId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_beginFinalization,
      {
        docId: importId,
        expectedReviewRevision: 0,
      },
    );
    const component = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      { name: "House Herb Oil", yieldQuantity: 2, yieldUnit: "cup" },
    )) as Doc;
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_recordComponent,
      {
        docId: importId,
        resultingComponentId: component.docId,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentImport_complete,
      {
        docId: importId,
      },
    );

    // Completed imports are immutable: header, measurement, and cancel refuse.
    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.ComponentImport_reviseReview,
        {
          docId: importId,
          expectedReviewRevision: 0,
          parsedName: "Renamed Oil",
        },
      ),
    ).rejects.toThrow(/Guard/);
    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.ComponentImportLine_reviseMeasurements,
        { docId: lineOne, expectedReviewRevision: 0, parsedQuantity: 9 },
      ),
    ).rejects.toThrow(/Guard/);
    await expect(
      proof.executeCommand(kitchen, api.mutations.ComponentImport_cancel, {
        docId: importId,
        reason: "too late",
      }),
    ).rejects.toThrow(/Guard/);
    const stillCompleted = await kitchen.run(async (ctx) =>
      ctx.db.get(importId as never),
    );
    expect(stillCompleted?.status).toBe("completed");
    expect(stillCompleted?.rawSourceText).toBe(RAW_SOURCE);
  });
});
