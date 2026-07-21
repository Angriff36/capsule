/**
 * Runtime proof: Event.approve foreach-creates PurchaseNeed from calculated
 * purchase-eligible IngredientDemand rows (Manifest ≥3.6.36), then markReleased.
 * Pre-confirmed demands (eligibility cleared) must not block approve.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-event-approve-a",
  startsAt: Date.UTC(2026, 6, 20, 17, 0),
  endsAt: Date.UTC(2026, 6, 20, 22, 0),
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

async function seedClientEventIngredient(proof: ReturnType<typeof harness>) {
  const sales = proof.asRole({
    subject: "sales-approve-a",
    role: "sales_manager",
    tenantId: S.tenantId,
  });
  const events = proof.asRole({
    subject: "events-approve-a",
    role: "event_manager",
    tenantId: S.tenantId,
  });
  const kitchen = proof.asRole({
    subject: "kitchen-approve-a",
    role: "kitchen_staff",
    tenantId: S.tenantId,
  });
  const inventory = proof.asRole({
    subject: "inventory-approve-a",
    role: "inventory_staff",
    tenantId: S.tenantId,
  });

  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: "Approve proof client",
    },
  )) as { docId: string };

  const event = (await proof.executeCommand(
    sales,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "UI Inventory Demo Event",
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Approve",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };

  const ingredient = (await proof.executeCommand(
    kitchen,
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: "Approve proof flour",
      unit: "kilogram",
      costPerUnit: 2.5,
      allergens: [],
      category: "pantry",
    },
  )) as { docId: string };

  return { sales, events, kitchen, inventory, event, ingredient };
}

describe("runtime proof: Event approve → purchase release", () => {
  it("approves with calculated demand and foreach-creates PurchaseNeed", async () => {
    const proof = harness();
    const { events, inventory, event, ingredient } =
      await seedClientEventIngredient(proof);

    const demand = (await proof.executeCommand(
      inventory,
      api.mutations.IngredientDemand_createViaCalculate,
      {
        eventId: event.docId,
        ingredientId: ingredient.docId,
        requiredQuantity: 4.5,
        unit: "kilogram",
        servings: 40,
      },
    )) as { docId: string };

    const calculated = await inventory.run(async (ctx) =>
      ctx.db.get(demand.docId as never),
    );
    expect(calculated).toMatchObject({
      status: "calculated",
      purchaseEligibleEventId: event.docId,
    });

    await proof.executeCommand(events, api.mutations.Event_submitForApproval, {
      docId: event.docId,
      version: 1,
    });

    await proof.executeCommand(events, api.mutations.Event_approve, {
      docId: event.docId,
      version: 2,
    });

    const approved = await events.run(async (ctx) =>
      ctx.db.get(event.docId as never),
    );
    expect(approved).toMatchObject({
      stage: "approved",
      version: 3,
    });

    const released = await inventory.run(async (ctx) =>
      ctx.db.get(demand.docId as never),
    );
    expect(released).toMatchObject({
      status: "confirmed",
      purchaseEligibleEventId: null,
    });

    const needs = await inventory.run(async (ctx) =>
      ctx.db.query("purchaseNeeds").collect(),
    );
    const forDemand = needs.filter(
      (row) =>
        (row as { ingredientDemandId?: string }).ingredientDemandId ===
        demand.docId,
    );
    expect(forDemand).toHaveLength(1);
    expect(forDemand[0]).toMatchObject({
      eventId: event.docId,
      ingredientId: ingredient.docId,
      requiredQuantity: 4.5,
      status: "open",
    });
  });

  it("approves legacy calculated demand with null purchaseEligibleEventId", async () => {
    const proof = harness();
    const { events, inventory, event, ingredient } =
      await seedClientEventIngredient(proof);

    const demand = (await proof.executeCommand(
      inventory,
      api.mutations.IngredientDemand_createViaCalculate,
      {
        eventId: event.docId,
        ingredientId: ingredient.docId,
        requiredQuantity: 4.5,
        unit: "kilogram",
        servings: 40,
      },
    )) as { docId: string };

    await inventory.run(async (ctx) => {
      await ctx.db.patch(
        demand.docId as never,
        {
          purchaseEligibleEventId: null,
        } as never,
      );
    });

    const cleared = await inventory.run(async (ctx) =>
      ctx.db.get(demand.docId as never),
    );
    expect(cleared).toMatchObject({
      status: "calculated",
      purchaseEligibleEventId: null,
    });

    await proof.executeCommand(events, api.mutations.Event_submitForApproval, {
      docId: event.docId,
      version: 1,
    });

    await proof.executeCommand(events, api.mutations.Event_approve, {
      docId: event.docId,
      version: 2,
    });

    const released = await inventory.run(async (ctx) =>
      ctx.db.get(demand.docId as never),
    );
    expect(released).toMatchObject({
      status: "confirmed",
      purchaseEligibleEventId: null,
    });

    const needs = await inventory.run(async (ctx) =>
      ctx.db.query("purchaseNeeds").collect(),
    );
    const forDemand = needs.filter(
      (row) =>
        (row as { ingredientDemandId?: string }).ingredientDemandId ===
        demand.docId,
    );
    expect(forDemand).toHaveLength(1);
  });

  it("approves when demand was already confirmed (no eligible fanOut match)", async () => {
    const proof = harness();
    const { events, inventory, event, ingredient } =
      await seedClientEventIngredient(proof);

    const demand = (await proof.executeCommand(
      inventory,
      api.mutations.IngredientDemand_createViaCalculate,
      {
        eventId: event.docId,
        ingredientId: ingredient.docId,
        requiredQuantity: 4.5,
        unit: "kilogram",
        servings: 40,
      },
    )) as { docId: string };

    await proof.executeCommand(
      inventory,
      api.mutations.IngredientDemand_confirm,
      {
        docId: demand.docId,
        version: 1,
      },
    );

    await proof.executeCommand(events, api.mutations.Event_submitForApproval, {
      docId: event.docId,
      version: 1,
    });

    await proof.executeCommand(events, api.mutations.Event_approve, {
      docId: event.docId,
      version: 2,
    });

    const approved = await events.run(async (ctx) =>
      ctx.db.get(event.docId as never),
    );
    expect(approved).toMatchObject({
      stage: "approved",
      version: 3,
    });

    const needs = await inventory.run(async (ctx) =>
      ctx.db.query("purchaseNeeds").collect(),
    );
    const forDemand = needs.filter(
      (row) =>
        (row as { ingredientDemandId?: string }).ingredientDemandId ===
        demand.docId,
    );
    // Manual confirm already created exactly one need; approve must not duplicate.
    expect(forDemand).toHaveLength(1);
  });
});
