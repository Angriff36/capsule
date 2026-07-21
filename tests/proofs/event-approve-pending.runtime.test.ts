/**
 * Runtime proof: create → submitForApproval → approve succeeds even when the
 * event already has a confirmed IngredientDemand (UI inventory demo path).
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

describe("runtime proof: Event submit → approve with confirmed demand", () => {
  it("approves a valid pending_approval event that already has confirmed demand", async () => {
    const proof = harness();
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

    const pending = await events.run(async (ctx) =>
      ctx.db.get(event.docId as never),
    );
    expect(pending).toMatchObject({
      stage: "pending_approval",
      version: 2,
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
  });
});
