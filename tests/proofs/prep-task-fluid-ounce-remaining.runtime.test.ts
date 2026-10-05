/**
 * Runtime proof (AC-068, PR03-03): a prep template written in fluid ounces
 * converts as volume when the event's prep task is kept in cups. Fluid
 * ounces are never the weight ounce, so a pound task stays refused.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-prep-fluid-ounce",
  startsAt: Date.UTC(2026, 9, 10, 12, 0),
  endsAt: Date.UTC(2026, 9, 10, 22, 0),
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
  quantity: number;
  unit: string;
  version: number;
  deletedAt?: number | null;
};

describe("runtime proof: prep work in fluid ounces converts as volume", () => {
  it("counts 2 fl oz per guest for 13 guests as 3.25 cups and refuses pounds", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-floz",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-floz",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-floz",
      role: "kitchen_manager",
      tenantId: S.tenantId,
    });

    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Chilled Gazpacho Shooters",
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
        name: "Portion gazpacho",
        defaultQuantity: 2,
        defaultUnit: "fluid_ounce",
        station: "Apps - Finish at Event",
      },
    )) as { docId: string };
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Fluid ounce client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Gazpacho lunch",
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

    const readTask = async () => {
      const rows = (await kitchen.run(
        async (ctx) => await ctx.db.query("prepTasks").collect(),
      )) as unknown as PrepTaskRow[];
      return rows.find(
        (row) =>
          row.eventDishId === line.docId &&
          row.dishTaskId === template.docId &&
          row.deletedAt == null,
      )!;
    };
    const generated = await readTask();
    expect(generated.unit).toBe("fluid_ounce");
    expect(generated.quantity).toBe(26);

    // The kitchen keeps this task in cups (a regeneration writes the unit).
    const reopen = (unit: string, quantity: number) =>
      proof.executeCommand(kitchen, api.mutations.PrepTask_open, {
        docId: generated._id,
        eventDishId: line.docId,
        eventId: event.docId,
        name: "Portion gazpacho",
        quantity,
        unit,
        dishTaskId: template.docId,
        dishId: dish.docId,
        isGenerated: true,
      });
    await reopen("cup", 1);
    const inCups = await readTask();
    await proof.executeCommand(
      kitchen,
      api.mutations.PrepTask_reconcileRemainingWork,
      { docId: inCups._id, expectedVersion: inCups.version },
    );
    const reconciled = await readTask();
    expect(reconciled.unit).toBe("cup");
    expect(reconciled.quantity).toBe(3.25);

    // Fluid ounces never become the weight ounce: a pound task is refused.
    await reopen("pound", 1);
    const inPounds = await readTask();
    await expect(
      proof.executeCommand(
        kitchen,
        api.mutations.PrepTask_reconcileRemainingWork,
        { docId: inPounds._id, expectedVersion: inPounds.version },
      ),
    ).rejects.toThrow();
    expect((await readTask()).quantity).toBe(1);
  });
});
