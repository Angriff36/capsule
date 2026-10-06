/**
 * Runtime proof: the kitchen's Unresolved work list leaves out events that
 * are already over (still open, never closed out). Nothing is ordered or
 * cooked for them any more, so their recipe gaps are not kitchen work.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-unresolved-ended";
const DAY = 86_400_000;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: Unresolved work skips events that are over", () => {
  it("lists the coming event and leaves out the one that ended", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const as = (role: string) =>
      proof.asRole({ subject: `u-${role}`, role, tenantId: TENANT });
    const sales = as("sales_manager");
    const events = as("event_manager");
    const kitchen = as("kitchen_manager");

    // A recipe with no ingredients and no method: always unresolved.
    const component = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      {
        name: "Roast garlic",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    )) as { docId: string };
    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Garlic bread",
        portionSize: 1,
        portionUnit: "portion",
        category: "side",
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
      { clientType: "company", companyName: "Garlic client" },
    )) as { docId: string };

    const now = Date.now();
    const makeEvent = async (title: string, startsAt: number) => {
      const event = (await proof.executeCommand(
        sales,
        api.mutations.Event_createViaPlanEngagement,
        {
          clientId: client.docId,
          title,
          eventType: "catering",
          startsAt,
          endsAt: startsAt + 4 * 3_600_000,
          expectedHeadcount: 20,
          primaryContactName: "Pat Planner",
          budgetAmount: 1000,
          quotedPrice: 1200,
        },
      )) as { docId: string };
      await proof.executeCommand(
        events,
        api.mutations.EventDish_createViaAddToEvent,
        { eventId: event.docId, dishId: dish.docId, quantityServings: 20 },
      );
      return event.docId;
    };
    const ended = await makeEvent("Last month's party", now - 30 * DAY);
    const coming = await makeEvent("Next month's party", now + 30 * DAY);

    const report = (await kitchen.query(
      api.culinaryDemand.kitchenUnresolvedReport,
      {},
    )) as { events: { eventId: string }[] };
    const ids = report.events.map((row) => row.eventId);
    expect(ids).toContain(coming);
    expect(ids).not.toContain(ended);
  });
});
