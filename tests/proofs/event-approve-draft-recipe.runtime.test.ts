/**
 * Runtime proof: a dish whose recipe is still a draft does not stop the
 * event's approval (found in the AC-168 browser walk: "Not allowed right now").
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-event-approve-draft-recipe",
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

describe("runtime proof: Event.approve with a draft recipe", () => {
  it("approves the event when a dish's recipe is still a draft", async () => {
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

    const component = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      {
        name: "Batch cascade rolls",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    )) as { docId: string };

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

    const approved = await events.run(async (ctx) =>
      ctx.db.get(event.docId as never),
    );
    expect((approved as { stage?: string }).stage).toBe("approved");
    // The kitchen still gets the batch for the draft recipe.
    const batches = await kitchen.run(async (ctx) =>
      ctx.db.query("productionBatches").collect(),
    );
    expect(
      batches.filter(
        (row) =>
          (row as { eventId?: string }).eventId === event.docId &&
          (row as { componentId?: string }).componentId === component.docId,
      ),
    ).toHaveLength(1);
  });
});
