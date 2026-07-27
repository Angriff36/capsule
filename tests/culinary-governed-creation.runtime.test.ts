import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./proofs/convex-test-modules";

function kitchenActor() {
  const proof = createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
  const actor = proof.asRole({
    subject: "culinary-create-user",
    role: "kitchen_manager",
    tenantId: "tenant-culinary-create",
  });
  return { proof, actor };
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("culinary governed creation", () => {
  it("creates Ingredient, Component, and Dish with command-owned timestamps", async () => {
    const { proof, actor } = kitchenActor();

    const ingredient = (await proof.executeCommand(
      actor,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Kosher salt",
        unit: "gram",
        costPerUnit: 0.02,
        allergens: [],
        category: "pantry",
      },
    )) as { docId: string };
    const component = (await proof.executeCommand(
      actor,
      api.mutations.Component_createViaDraft,
      {
        name: "Seasoning base",
        yieldQuantity: 12,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    )) as { docId: string };
    const dish = (await proof.executeCommand(
      actor,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Seasoned vegetables",
        portionSize: 1,
        portionUnit: "portion",
      },
    )) as { docId: string };

    const created = await actor.run(async (ctx) => ({
      ingredient: await ctx.db.get(ingredient.docId as never),
      component: await ctx.db.get(component.docId as never),
      dish: await ctx.db.get(dish.docId as never),
    }));

    expect(created.ingredient).toMatchObject({
      name: "Kosher salt",
      tenantId: "tenant-culinary-create",
      version: 1,
    });
    expect(created.component).toMatchObject({
      name: "Seasoning base",
      tenantId: "tenant-culinary-create",
      version: 1,
    });
    expect(created.dish).toMatchObject({
      name: "Seasoned vegetables",
      tenantId: "tenant-culinary-create",
      version: 1,
    });
    expect(created.ingredient?.introducedAt).toEqual(expect.any(Number));
    expect(created.component?.draftedAt).toEqual(expect.any(Number));
    expect(created.dish?.introducedAt).toEqual(expect.any(Number));
  });

  it("creates Ingredient when optional category is omitted", async () => {
    const { proof, actor } = kitchenActor();

    const result = (await proof.executeCommand(
      actor,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Black pepper",
        unit: "gram",
        costPerUnit: 0.05,
        allergens: [],
      },
    )) as { docId: string };

    const doc = await actor.run(async (ctx) =>
      ctx.db.get(result.docId as never),
    );
    expect(doc).toMatchObject({
      name: "Black pepper",
      tenantId: "tenant-culinary-create",
    });
    expect(doc?.category ?? null).toBeNull();
    expect(doc?.introducedAt).toEqual(expect.any(Number));
  });

  it("creates a PrepTask with default category and task type when the UI omits them", async () => {
    const { proof, actor } = kitchenActor();
    const sales = proof.asRole({
      subject: "prep-defaults-sales",
      role: "sales_manager",
      tenantId: "tenant-culinary-create",
    });
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Prep defaults test client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Prep defaults test event",
        eventType: "testing",
        startsAt: Date.UTC(2026, 6, 20, 17),
        endsAt: Date.UTC(2026, 6, 20, 21),
        expectedHeadcount: 1,
        primaryContactName: "Test contact",
        budgetAmount: 1,
        quotedPrice: 1,
      },
    )) as { docId: string };
    const dish = (await proof.executeCommand(
      actor,
      api.mutations.Dish_createViaIntroduce,
      { name: "Prep defaults test dish", portionSize: 1, portionUnit: "each" },
    )) as { docId: string };
    const eventManager = proof.asRole({
      subject: "prep-defaults-event-manager",
      role: "event_manager",
      tenantId: "tenant-culinary-create",
    });
    const eventDish = (await proof.executeCommand(
      eventManager,
      api.mutations.EventDish_createViaAddToEvent,
      { eventId: event.docId, dishId: dish.docId, quantityServings: 1 },
    )) as { docId: string };

    const result = (await proof.executeCommand(
      actor,
      api.mutations.PrepTask_createViaOpen,
      {
        eventDishId: eventDish.docId,
        eventId: event.docId,
        name: "Mince garlic",
        quantity: 1,
        unit: "each",
      },
    )) as { docId: string };

    const doc = await actor.run(async (ctx) =>
      ctx.db.get(result.docId as never),
    );

    expect(doc).toMatchObject({
      name: "Mince garlic",
      category: "finish_at_event",
      taskType: "manual",
      status: "pending",
      tenantId: "tenant-culinary-create",
    });
  });

  it("rejects invalid allergen values at the generated API boundary", async () => {
    const { proof, actor } = kitchenActor();

    await expect(
      proof.executeCommand(actor, api.mutations.Ingredient_createViaIntroduce, {
        name: "Mystery spice",
        unit: "gram",
        costPerUnit: 1,
        allergens: ["not_a_real_allergen"],
      }),
    ).rejects.toThrow();

    const ingredients = await actor.run(async (ctx) =>
      ctx.db.query("ingredients").collect(),
    );
    expect(ingredients).toEqual([]);
  });

  it("returns the useful validation message and leaves no partial Ingredient", async () => {
    const { proof, actor } = kitchenActor();

    await expect(
      proof.executeCommand(actor, api.mutations.Ingredient_createViaIntroduce, {
        name: "   ",
        unit: "each",
        costPerUnit: 0,
      }),
    ).rejects.toThrow("Ingredient name is required");

    const ingredients = await actor.run(async (ctx) =>
      ctx.db.query("ingredients").collect(),
    );
    expect(ingredients).toEqual([]);
  });
});
