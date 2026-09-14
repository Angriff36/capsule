/**
 * Runtime proof (issue #370): shared-batch contribution rows survive a demand
 * recalculate and a legacy reseed, and the culinary report queries follow the
 * declared read roles.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-370",
  startsAt: Date.UTC(2026, 9, 3, 12, 0),
  endsAt: Date.UTC(2026, 9, 3, 22, 0),
  headcount: 13,
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

type ContributionRow = {
  _id: string;
  eventDishId: string;
  ingredientId: string;
  quantity: number;
  servings: number;
  unit: string;
  sourceKey?: string | null;
  ownership?: string | null;
  productionBatchId?: string | null;
  productionBatchAllocationId?: string | null;
  componentPath?: string[] | null;
  supersededAt?: number | null;
  deletedAt?: number | null;
};

/** One recipe (0.875 lb butter per portion), one dish, one event of 13 portions. */
async function seed(proof: ReturnType<typeof harness>) {
  const sales = proof.asRole({
    subject: "sales-370",
    role: "sales_manager",
    tenantId: S.tenantId,
  });
  const events = proof.asRole({
    subject: "events-370",
    role: "event_manager",
    tenantId: S.tenantId,
  });
  const kitchen = proof.asRole({
    subject: "kitchen-370",
    role: "kitchen_manager",
    tenantId: S.tenantId,
  });

  const butter = (await proof.executeCommand(
    kitchen,
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: "butter",
      unit: "pound",
      costPerUnit: 4,
      allergens: [],
      category: "dairy",
    },
  )) as { docId: string };
  const component = (await proof.executeCommand(
    kitchen,
    api.mutations.Component_createViaDraft,
    {
      name: "Beurre blanc",
      yieldQuantity: 1,
      yieldUnit: "portion",
      batchMultiplier: 1,
    },
  )) as { docId: string };
  await proof.executeCommand(
    kitchen,
    api.mutations.ComponentIngredient_createViaAdd,
    {
      componentId: component.docId,
      ingredientId: butter.docId,
      quantity: 0.875,
      unit: "pound",
    },
  );
  await proof.executeCommand(kitchen, api.mutations.Component_publishVersion, {
    docId: component.docId,
  });
  const dish = (await proof.executeCommand(
    kitchen,
    api.mutations.Dish_createViaIntroduce,
    {
      name: "Halibut",
      portionSize: 1,
      portionUnit: "portion",
      category: "entree",
    },
  )) as { docId: string };
  await proof.executeCommand(
    kitchen,
    api.mutations.DishComponent_createViaAttach,
    {
      dishId: dish.docId,
      componentId: component.docId,
      yieldQuantity: 1,
      batchMultiplier: 1,
    },
  );
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: "Batch client" },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Batch dinner",
      eventType: "catering",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: S.headcount,
      primaryContactName: "Pat Planner",
      budgetAmount: 2000,
      quotedPrice: 2500,
    },
  )) as { docId: string };
  const eventDish = (await proof.executeCommand(
    events,
    api.mutations.EventDish_createViaAddToEvent,
    {
      eventId: event.docId,
      dishId: dish.docId,
      quantityServings: S.headcount,
    },
  )) as { docId: string };

  const rows = () =>
    kitchen.run(
      async (ctx) =>
        (await ctx.db
          .query("eventIngredientContributions")
          .collect()) as unknown as ContributionRow[],
    );
  return { kitchen, events, butter, component, dish, event, eventDish, rows };
}

/** 13 portions rounded up to the next 5 → 15 planned, 2 portions of surplus. */
async function planBatch(ctx: Awaited<ReturnType<typeof seed>>) {
  return (await ctx.kitchen.mutation(api.culinaryDemand.planSharedRecipeBatch, {
    componentId: ctx.component.docId as Id<"components">,
    allocations: [
      {
        eventId: ctx.event.docId as Id<"events">,
        eventDishId: ctx.eventDish.docId as Id<"eventDishes">,
        quantity: S.headcount,
        unit: "portion",
      },
    ],
    roundingScope: "production_group",
    roundingRule: "increment",
    roundingIncrement: 5,
  })) as { batchId: string; surplusQuantity: number };
}

const live = (rows: ContributionRow[]) =>
  rows.filter((r) => r.deletedAt == null && r.supersededAt == null);

describe("runtime proof: shared-batch rows and report roles (#370)", () => {
  it("keeps the surplus share after a demand recalculate", async () => {
    const proof = harness();
    const ctx = await seed(proof);
    const batch = await planBatch(ctx);
    expect(batch.surplusQuantity).toBeCloseTo(2, 6);

    const before = live(await ctx.rows());
    const surplusBefore = before.find((r) => r.ownership === "batch_surplus");
    const shareBefore = before.find((r) => r.ownership === "batch_allocation");
    expect(surplusBefore?.quantity).toBeCloseTo(1.75, 6);
    expect(shareBefore?.quantity).toBeCloseTo(11.375, 6);

    await ctx.kitchen.mutation(api.culinaryDemand.reconcileEventDemand, {
      eventId: ctx.event.docId as Id<"events">,
    });

    const after = live(await ctx.rows());
    const surplus = after.filter((r) => r.ownership === "batch_surplus");
    const shares = after.filter((r) => r.ownership === "batch_allocation");
    expect(surplus).toHaveLength(1);
    expect(surplus[0].quantity).toBeCloseTo(1.75, 6);
    expect(shares).toHaveLength(1);
    expect(shares[0].quantity).toBeCloseTo(11.375, 6);
    // The batch satisfies the recipe: no direct event-dish row is re-created.
    expect(
      after.filter((r) => r.ownership === "event_dish").map((r) => r.quantity),
    ).toEqual([]);
  });

  it("legacy reseeding cannot mutate batch-owned rows", async () => {
    const proof = harness();
    const ctx = await seed(proof);
    await planBatch(ctx);
    const batchRows = live(await ctx.rows()).filter((r) =>
      r.ownership?.startsWith("batch_"),
    );
    expect(batchRows).toHaveLength(2);

    // 1. The legacy record() call exactly as the reaction issues it (no sourceKey).
    for (const row of batchRows) {
      await proof.executeCommand(
        ctx.kitchen,
        api.mutations.EventIngredientContribution_record,
        {
          docId: row._id,
          eventId: ctx.event.docId,
          eventDishId: ctx.eventDish.docId,
          dishId: ctx.dish.docId,
          componentId: ctx.component.docId,
          ingredientId: ctx.butter.docId,
          quantity: 999,
          quantityPerServing: 0.875,
          unit: "pound",
          servings: S.headcount,
        },
      );
    }
    // 2. The real reseed path: EventDishComponentSeed.refresh replays the fan-out.
    const seedRow = await ctx.kitchen.run(async (dbCtx) =>
      (await dbCtx.db.query("eventDishComponentSeeds").collect()).find(
        (s) =>
          (s as { eventDishId?: string }).eventDishId === ctx.eventDish.docId &&
          (s as { deletedAt?: number | null }).deletedAt == null,
      ),
    );
    expect(seedRow).toBeDefined();
    await proof.executeCommand(
      ctx.kitchen,
      api.mutations.EventDishComponentSeed_refresh,
      { docId: String((seedRow as { _id: string })._id) },
    );

    const after = await ctx.rows();
    for (const before of batchRows) {
      const row = after.find((r) => r._id === before._id);
      expect(row).toBeDefined();
      expect(row?.quantity).toBeCloseTo(before.quantity, 6);
      expect(row?.servings).toBe(before.servings);
      expect(row?.ownership).toBe(before.ownership);
      expect(row?.sourceKey).toBe(before.sourceKey);
      expect(row?.productionBatchId).toBe(before.productionBatchId);
      expect(row?.productionBatchAllocationId).toBe(
        before.productionBatchAllocationId,
      );
      expect(row?.componentPath).toEqual(before.componentPath);
      expect(row?.supersededAt ?? null).toBeNull();
      expect(row?.deletedAt ?? null).toBeNull();
    }
  });

  it("report queries deny ordinary staff and allow kitchen, inventory and managers", async () => {
    const proof = harness();
    const ctx = await seed(proof);
    const eventId = ctx.event.docId as Id<"events">;
    const componentId = ctx.component.docId as Id<"components">;
    const actor = (role: string) =>
      proof.asRole({ subject: `report-${role}`, role, tenantId: S.tenantId });

    for (const role of ["event_staff", "sales_staff", "driver"]) {
      const denied = actor(role);
      await expect(
        denied.query(api.culinaryDemand.eventDemandReview, { eventId }),
      ).rejects.toThrow(/Kitchen, inventory and managers/);
      await expect(
        denied.query(api.culinaryDemand.componentContentReport, {
          componentId,
        }),
      ).rejects.toThrow(/Kitchen, inventory and managers/);
      await expect(
        denied.query(api.culinaryDemand.kitchenUnresolvedReport, {}),
      ).rejects.toThrow(/Kitchen, inventory and managers/);
    }

    for (const role of [
      "kitchen_staff",
      "inventory_staff",
      "manager",
      "event_manager",
    ]) {
      const allowed = actor(role);
      const review = (await allowed.query(
        api.culinaryDemand.eventDemandReview,
        { eventId },
      )) as { eventId: string };
      expect(review.eventId).toBe(ctx.event.docId);
      const content = (await allowed.query(
        api.culinaryDemand.componentContentReport,
        { componentId },
      )) as { componentId: string } | null;
      expect(content?.componentId).toBe(ctx.component.docId);
      await expect(
        allowed.query(api.culinaryDemand.kitchenUnresolvedReport, {}),
      ).resolves.toBeDefined();
    }
  });
});
