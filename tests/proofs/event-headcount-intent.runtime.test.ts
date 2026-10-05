/**
 * AC-440 runtime proof: each EventDish owns its servings. A dish that follows
 * the guest count moves with it; a dish with its own count never does, and an
 * explicit servings edit is never re-inferred as "following" just because the
 * numbers happen to match later. Clearing the override follows again.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-headcount-intent";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: event headcount intent", () => {
  it("a fixed-count dish does not move when headcount changes and an explicit servings edit is never re-inferred", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "sales-intent",
      role: "sales_manager",
      tenantId: TENANT,
    });
    const events = proof.asRole({
      subject: "events-intent",
      role: "event_manager",
      tenantId: TENANT,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-intent",
      role: "kitchen_manager",
      tenantId: TENANT,
    });
    const dish = async (name: string) =>
      (
        (await proof.executeCommand(
          kitchen,
          api.mutations.Dish_createViaIntroduce,
          { name, portionSize: 1, portionUnit: "portion", category: "entree" },
        )) as { docId: string }
      ).docId;
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Headcount intent client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Intent dinner",
        eventType: "catering",
        startsAt: Date.UTC(2026, 10, 5, 23),
        endsAt: Date.UTC(2026, 10, 6, 3),
        expectedHeadcount: 10,
        primaryContactName: "Pat Planner",
        budgetAmount: 2000,
        quotedPrice: 2500,
      },
    )) as { docId: string };
    const add = async (dishId: string, quantityServings: number) =>
      (
        (await proof.executeCommand(
          events,
          api.mutations.EventDish_createViaAddToEvent,
          { eventId: event.docId, dishId, quantityServings },
        )) as { docId: string }
      ).docId;

    // Chicken follows the guest count; the kids' plate is a fixed 25; the
    // cake was typed as 10 on purpose (it equals the guest count by chance).
    const chicken = await add(await dish("Roast chicken"), 10);
    const kids = await add(await dish("Kids plate"), 25);
    const cake = await add(await dish("Sheet cake"), 10);
    const cakeRow = (await events.query(api.queries.getEventDish, {
      id: cake as never,
    })) as { version: number };
    await proof.executeCommand(events, api.mutations.EventDish_adjustServings, {
      docId: cake,
      version: cakeRow.version,
      quantityServings: 10,
    } as never);

    const servings = async () => {
      const rows = (await events.query(api.queries.listEventDish, {})) as {
        _id: string;
        quantityServings: number;
        followsEventHeadcount?: boolean | null;
        deletedAt?: number | null;
      }[];
      const by = new Map(rows.map((row) => [row._id, row]));
      return {
        chicken: by.get(chicken)!,
        kids: by.get(kids)!,
        cake: by.get(cake)!,
      };
    };
    const changeHeadcount = async (newHeadcount: number) => {
      const row = (await events.query(api.queries.getEvent, {
        id: event.docId as never,
      })) as { version: number };
      await proof.executeCommand(events, api.mutations.Event_changeHeadcount, {
        docId: event.docId,
        version: row.version,
        newHeadcount,
      } as never);
    };

    let now = await servings();
    expect(now.chicken).toMatchObject({
      quantityServings: 10,
      followsEventHeadcount: true,
    });
    expect(now.kids).toMatchObject({
      quantityServings: 25,
      followsEventHeadcount: false,
    });
    expect(now.cake).toMatchObject({
      quantityServings: 10,
      followsEventHeadcount: false,
    });

    // 10 -> 12: only the following dish moves.
    await changeHeadcount(12);
    now = await servings();
    expect(now.chicken.quantityServings).toBe(12);
    expect(now.kids.quantityServings).toBe(25);
    expect(now.cake.quantityServings).toBe(10);

    // 12 -> 10: the cake equals the guest count again, but its count was an
    // explicit edit, so the next change still leaves it alone.
    await changeHeadcount(10);
    await changeHeadcount(14);
    now = await servings();
    expect(now.chicken.quantityServings).toBe(14);
    expect(now.kids.quantityServings).toBe(25);
    expect(now.cake).toMatchObject({
      quantityServings: 10,
      followsEventHeadcount: false,
    });

    // Clearing the kids' override hands it back to the guest count.
    const kidsRow = (await events.query(api.queries.getEventDish, {
      id: kids as never,
    })) as { version: number };
    await proof.executeCommand(
      events,
      api.mutations.EventDish_setHeadcountOverride,
      { docId: kids, version: kidsRow.version, headcountOverride: 0 } as never,
    );
    await changeHeadcount(16);
    now = await servings();
    expect(now.kids).toMatchObject({
      quantityServings: 16,
      followsEventHeadcount: true,
    });
    expect(now.chicken.quantityServings).toBe(16);
    expect(now.cake.quantityServings).toBe(10);
  });
});
