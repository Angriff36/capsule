/**
 * Runtime proof (Revision-2 culinary model): an event-specific override of a
 * generated prep task survives a replayed regeneration of that task.
 * "Send bulk mix, do not form crab cakes" must not be undone by the
 * EventDishAdded replay that re-runs PrepTask.open on the matched row.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-prep-override",
  startsAt: Date.UTC(2026, 8, 20, 12, 0),
  endsAt: Date.UTC(2026, 8, 20, 22, 0),
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

type PrepTaskRow = {
  _id: string;
  eventDishId: string;
  dishTaskId?: string | null;
  name: string;
  quantity: number;
  isGenerated: boolean;
  overrideOfDishTaskId?: string | null;
  overrideReason?: string | null;
  specialInstructions?: string | null;
  deletedAt?: number | null;
};

describe("runtime proof: prep task override survives regeneration", () => {
  it("keeps the overridden name and notes when the template replay re-opens the task", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-override",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-override",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-override",
      role: "kitchen_manager",
      tenantId: S.tenantId,
    });

    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Crab Cakes",
        portionSize: 1,
        portionUnit: "portion",
        category: "Apps - Finish at Event",
      },
    )) as { docId: string };

    const template = (await proof.executeCommand(
      kitchen,
      api.mutations.DishTask_createViaAdd,
      {
        dishId: dish.docId,
        name: "Make 1 oz crab cakes",
        defaultQuantity: 0.125,
        defaultUnit: "pound",
        station: "Apps - Finish at Event",
      },
    )) as { docId: string };

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Override client",
      },
    )) as { docId: string };

    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Override dinner",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: S.headcount,
        primaryContactName: "Pat Planner",
        budgetAmount: 2000,
        quotedPrice: 2500,
      },
    )) as { docId: string };

    const line = (await proof.executeCommand(
      events,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: event.docId,
        dishId: dish.docId,
        quantityServings: S.headcount,
      },
    )) as { docId: string };

    const generated = await kitchen.run(
      async (ctx) =>
        (await ctx.db.query("prepTasks").collect()) as unknown as PrepTaskRow[],
    );
    const task = generated.find(
      (row) =>
        row.eventDishId === line.docId &&
        row.dishTaskId === template.docId &&
        row.deletedAt == null,
    );
    expect(task).toBeDefined();
    expect(task?.name).toBe("Make 1 oz crab cakes");
    expect(task?.isGenerated).toBe(true);

    await proof.executeCommand(kitchen, api.mutations.PrepTask_markOverride, {
      docId: task?._id,
      overrideOfDishTaskId: template.docId,
      reason: "SEND BULK MIX, DO NOT FORM INTO CRAB CAKES.",
      name: "Portion bulk crab cake mix, do not form",
      specialInstructions:
        "Send bulk mix in a cambro; forming happens on site.",
    });

    // The EventDishAdded replay matches (eventDishId, dishTaskId) and re-runs
    // PrepTask.open with the template values. Drive that path directly.
    await proof.executeCommand(kitchen, api.mutations.PrepTask_open, {
      docId: task?._id,
      eventDishId: line.docId,
      eventId: event.docId,
      name: "Make 1 oz crab cakes",
      quantity: 1.625,
      unit: "pound",
      dishTaskId: template.docId,
      dishId: dish.docId,
      isGenerated: true,
    });

    const after = await kitchen.run(
      async (ctx) =>
        (await ctx.db.query("prepTasks").collect()) as unknown as PrepTaskRow[],
    );
    const replayed = after.find((row) => row._id === task?._id);
    expect(replayed?.name).toBe("Portion bulk crab cake mix, do not form");
    expect(replayed?.specialInstructions).toBe(
      "Send bulk mix in a cambro; forming happens on site.",
    );
    expect(replayed?.overrideOfDishTaskId).toBe(template.docId);
    expect(replayed?.isGenerated).toBe(false);
    // Quantity still follows the event (work quantity is refreshed, not the words).
    expect(replayed?.quantity).toBe(1.625);
    // No duplicate task was created for the same event line + template.
    expect(
      after.filter(
        (row) =>
          row.eventDishId === line.docId &&
          row.dishTaskId === template.docId &&
          row.deletedAt == null,
      ),
    ).toHaveLength(1);
  });
});
