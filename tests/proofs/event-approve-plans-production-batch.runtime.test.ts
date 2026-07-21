/**
 * Runtime proof: Event.approve fans out EventDishRecipeSeed → ProductionBatch.plan
 * (match else create).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-event-approve-productionbatch",
  startsAt: Date.UTC(2026, 6, 28, 12, 0),
  endsAt: Date.UTC(2026, 6, 28, 22, 0),
  headcount: 40,
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

describe("runtime proof: Event.approve → ProductionBatch.plan", () => {
  it("plans one production batch per seeded dish recipe on approve", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-batch-cascade",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-batch-cascade",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-batch-cascade",
      role: "kitchen_manager",
      tenantId: S.tenantId,
    });

    const recipe = (await proof.executeCommand(
      kitchen,
      api.mutations.Recipe_createViaDraft,
      {
        name: "Batch cascade rolls",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    )) as { docId: string };

    await proof.executeCommand(kitchen, api.mutations.Recipe_publishVersion, {
      docId: recipe.docId,
      version: 1,
    });

    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Cascade dinner roll",
        portionSize: 1,
        portionUnit: "portion",
        category: "bread",
      },
    )) as { docId: string };

    await proof.executeCommand(
      kitchen,
      api.mutations.DishRecipe_createViaAttach,
      {
        dishId: dish.docId,
        recipeId: recipe.docId,
        yieldQuantity: 1,
        batchMultiplier: 1,
      },
    );

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Batch cascade client",
      },
    )) as { docId: string };

    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Batch cascade lunch",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: S.headcount,
        primaryContactName: "Pat Planner",
        budgetAmount: 2000,
        quotedPrice: 2500,
      },
    )) as { docId: string };

    await proof.executeCommand(
      events,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: event.docId,
        dishId: dish.docId,
        quantityServings: S.headcount,
      },
    );

    const before = await kitchen.run(async (ctx) =>
      ctx.db.query("productionBatches").collect(),
    );
    expect(
      before.filter(
        (row) =>
          (row as { deletedAt?: number | null }).deletedAt == null &&
          (row as { eventId?: string }).eventId === event.docId,
      ),
    ).toHaveLength(0);

    await proof.executeCommand(events, api.mutations.Event_submitForApproval, {
      docId: event.docId,
      version: 1,
    });
    await proof.executeCommand(events, api.mutations.Event_approve, {
      docId: event.docId,
      version: 2,
    });

    const after = await kitchen.run(async (ctx) =>
      ctx.db.query("productionBatches").collect(),
    );
    const forEvent = after.filter(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { eventId?: string }).eventId === event.docId,
    );
    expect(forEvent).toHaveLength(1);
    const batch = forEvent[0]! as {
      recipeId?: string;
      plannedYield?: number;
      yieldUnit?: string;
      plannedAt?: number | null;
      status?: string;
    };
    expect(batch.recipeId).toBe(recipe.docId);
    expect(Number(batch.plannedYield)).toBe(S.headcount);
    expect(batch.yieldUnit).toBe("portion");
    expect(batch.plannedAt).toEqual(expect.any(Number));
    expect(batch.status).toBe("planned");

    // Idempotent plan via match: re-open does not allocate a second batch.
    await proof.executeCommand(kitchen, api.mutations.ProductionBatch_plan, {
      docId: (forEvent[0] as { _id: string })._id,
      recipeId: recipe.docId,
      plannedYield: 999,
      yieldUnit: "portion",
      eventId: event.docId,
      version: (forEvent[0] as { version?: number }).version,
    });
    const again = await kitchen.run(async (ctx) =>
      ctx.db.query("productionBatches").collect(),
    );
    const still = again.filter(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { eventId?: string }).eventId === event.docId,
    );
    expect(still).toHaveLength(1);
    expect(Number((still[0] as { plannedYield?: number }).plannedYield)).toBe(
      S.headcount,
    );
  });
});
