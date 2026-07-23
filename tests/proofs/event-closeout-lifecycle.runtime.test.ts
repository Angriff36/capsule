/**
 * Runtime proof: Event → closed_out → EventCloseout.capture → finalize.
 * Seeds through public generated createVia / lifecycle mutations.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { EventCloseoutCaptureParamsSchema } from "../../schemas/manifest-schemas";

const S = {
  tenantA: "tenant-closeout-a",
  tenantB: "tenant-closeout-b",
  startsAt: Date.UTC(2026, 6, 18, 17, 0),
  endsAt: Date.UTC(2026, 6, 18, 22, 0),
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

async function seedClosedOutEvent(
  proof: ReturnType<typeof harness>,
  tenantId: string,
) {
  const sales = proof.asRole({
    subject: `sales-${tenantId}`,
    role: "sales_manager",
    tenantId,
  });
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Closeout proof client ${tenantId}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Closeout proof event",
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Closeout",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };

  const events = proof.asRole({
    subject: `event-manager-${tenantId}`,
    role: "event_manager",
    tenantId,
  });
  await proof.executeCommand(events, api.mutations.Event_submitForApproval, {
    docId: event.docId,
    version: 1,
  });
  await proof.executeCommand(events, api.mutations.Event_approve, {
    docId: event.docId,
    version: 2,
  });
  // Event.approve match-else-creates a PackList draft; beginExecution requires
  // every pack list dispatched or cancelled.
  const logistics = proof.asRole({
    subject: `logistics-${tenantId}`,
    role: "logistics_manager",
    tenantId,
  });
  const openPackLists = await logistics.run(async (ctx) =>
    (await ctx.db.query("packLists").collect()).filter(
      (row) =>
        (row as { eventId?: string }).eventId === event.docId &&
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { status?: string }).status !== "cancelled" &&
        (row as { status?: string }).status !== "dispatched",
    ),
  );
  for (const pack of openPackLists) {
    await proof.executeCommand(logistics, api.mutations.PackList_cancel, {
      docId: (pack as { _id: string })._id,
      reason: "Closeout proof skips packing",
      version: (pack as { version?: number }).version,
    });
  }
  await proof.executeCommand(events, api.mutations.Event_beginExecution, {
    docId: event.docId,
    version: 3,
  });
  await proof.executeCommand(events, api.mutations.Event_complete, {
    docId: event.docId,
    version: 4,
  });
  await proof.executeCommand(events, api.mutations.Event_closeOut, {
    docId: event.docId,
    version: 5,
  });
  const closed = await events.run(async (ctx) =>
    ctx.db.get(event.docId as never),
  );
  expect(closed).toMatchObject({ stage: "closed_out", version: 6 });
  return event.docId;
}

describe("runtime proof: EventCloseout capture → finalize", () => {
  it("captures and finalizes a closeout with opaque event ids", async () => {
    const proof = harness();
    const eventId = await seedClosedOutEvent(proof, S.tenantA);
    const finance = proof.asRole({
      subject: "finance-manager-a",
      role: "finance_manager",
      tenantId: S.tenantA,
    });

    const captureArgs = {
      eventId,
      actualRevenue: 4500,
      budgetedRevenue: 4500,
      revenueVariance: 0,
      actualIngredientCost: 800,
      actualWasteCost: 50,
      actualLaborCost: 900,
      actualVendorCost: 200,
      budgetedCost: 3000,
      totalActualCost: 1950,
      costVariance: 1050,
      grossProfit: 2550,
      expectedHeadcount: 40,
      actualHeadcount: 38,
    };
    expect(() =>
      EventCloseoutCaptureParamsSchema.parse(captureArgs),
    ).not.toThrow();

    const closeout = (await proof.executeCommand(
      finance,
      api.mutations.EventCloseout_createViaCapture,
      captureArgs,
    )) as { docId: string };

    const captured = await finance.run(async (ctx) =>
      ctx.db.get(closeout.docId as never),
    );
    expect(captured).toMatchObject({
      tenantId: S.tenantA,
      eventId,
      status: "draft",
      actualRevenue: 4500,
      totalActualCost: 1950,
      grossProfit: 2550,
      capturedAt: expect.any(Number),
    });

    await proof.executeCommand(finance, api.mutations.EventCloseout_finalize, {
      docId: closeout.docId,
      version: 1,
    });
    const finalized = await finance.run(async (ctx) =>
      ctx.db.get(closeout.docId as never),
    );
    expect(finalized).toMatchObject({
      status: "finalized",
      finalizedAt: expect.any(Number),
      version: 2,
    });
  });

  it("denies kitchen staff and leaves no partial closeout", async () => {
    const proof = harness();
    const eventId = await seedClosedOutEvent(proof, S.tenantA);
    const kitchen = proof.asRole({
      subject: "kitchen-staff-a",
      role: "kitchen_staff",
      tenantId: S.tenantA,
    });

    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.EventCloseout_createViaCapture,
        {
          eventId,
          actualRevenue: 100,
          budgetedRevenue: 100,
          revenueVariance: 0,
          actualIngredientCost: 10,
          actualWasteCost: 0,
          actualLaborCost: 0,
          actualVendorCost: 0,
          budgetedCost: 50,
          totalActualCost: 10,
          costVariance: 40,
          grossProfit: 90,
          expectedHeadcount: 10,
          actualHeadcount: 10,
        },
      ),
    ).rejects.toThrow();

    const finance = proof.asRole({
      subject: "finance-reader-a",
      role: "finance_manager",
      tenantId: S.tenantA,
    });
    const listed = (await finance.query(
      api.queries.listEventCloseout,
      {},
    )) as Array<{ eventId?: string; actualRevenue?: number }>;
    // The EventClosedOut -> capture cascade legitimately creates ONE closeout
    // during seeding; kitchen's rejected attempt must not have added or
    // altered anything (its payload carried actualRevenue: 100).
    const rows = listed.filter((row) => row.eventId === eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].actualRevenue).not.toBe(100);
  });

  it("keeps closeouts tenant-isolated", async () => {
    const proof = harness();
    const eventA = await seedClosedOutEvent(proof, S.tenantA);
    const financeA = proof.asRole({
      subject: "finance-manager-a2",
      role: "finance_manager",
      tenantId: S.tenantA,
    });
    await proof.executeCommand(
      financeA,
      api.mutations.EventCloseout_createViaCapture,
      {
        eventId: eventA,
        actualRevenue: 200,
        budgetedRevenue: 200,
        revenueVariance: 0,
        actualIngredientCost: 20,
        actualWasteCost: 0,
        actualLaborCost: 0,
        actualVendorCost: 0,
        budgetedCost: 100,
        totalActualCost: 20,
        costVariance: 80,
        grossProfit: 180,
        expectedHeadcount: 5,
        actualHeadcount: 5,
      },
    );

    const financeB = proof.asRole({
      subject: "finance-manager-b",
      role: "finance_manager",
      tenantId: S.tenantB,
    });
    const listedB = (await financeB.query(
      api.queries.listEventCloseout,
      {},
    )) as Array<{ eventId?: string }>;
    expect(listedB.some((row) => row.eventId === eventA)).toBe(false);
  });
});
