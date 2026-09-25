/**
 * Runtime proof (AC-398 menu-snapshot slice): an EventDish line snapshots the
 * dish NAME at add time. A later catalog Dish rename must NOT rewrite the
 * Event line's dishName, while the live dishId link stays — and an explicit
 * add with a different name stores that name.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
} as const;
const M = api.mutations;

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

type Proof = ReturnType<typeof harness>;
type Role = ReturnType<Proof["asRole"]>;

function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role; kitchen: Role } {
  return {
    sales: proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    }),
    events: proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    }),
    kitchen: proof.asRole({
      subject: `kitchen-${tenantId}`,
      role: "kitchen_manager",
      tenantId,
    }),
  };
}

async function createEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<string> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Menu snapshot client ${tenantId} ${title}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Snapshot",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return event.docId;
}

async function seedGardenSalad(
  proof: Proof,
  tenantId: string,
): Promise<string> {
  const { kitchen } = rolesFor(proof, tenantId);
  const dish = (await proof.executeCommand(kitchen, M.Dish_createViaIntroduce, {
    name: "Garden salad",
    portionSize: 1,
    portionUnit: "portion",
  })) as { docId: string };
  return dish.docId;
}

async function readRow(actor: Role, docId: string) {
  return (await actor.run(async (ctx) => ctx.db.get(docId as never))) as Record<
    string,
    unknown
  > | null;
}

describe("runtime proof: EventDish dish-name snapshot stays put under catalog renames", () => {
  it("catalog dish rename leaves the event line's snapshot and live link", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-dish-catalog-revise";
    const { events } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Dish snapshot holds under catalog revise",
    );
    const dishId = await seedGardenSalad(proof, tenantId);

    const added = (await proof.executeCommand(
      events,
      M.EventDish_createViaAddToEvent,
      {
        eventId,
        dishId,
        quantityServings: 40,
        dishName: "Garden salad",
      },
    )) as { docId: string };

    const line = await readRow(events, added.docId);
    expect(line?.dishName).toBe("Garden salad");
    expect(line?.dishId).toBe(dishId);

    await proof.executeCommand(events, M.Dish_reviseDetails, {
      docId: dishId,
      name: "Garden salad RENAMED",
    });

    const catalog = await readRow(events, dishId);
    expect(catalog?.name).toBe("Garden salad RENAMED");

    const after = await readRow(events, added.docId);
    expect(after?.dishName).toBe("Garden salad");
    expect(after?.dishId).toBe(dishId);
    const eventRow = await readRow(events, eventId);
    expect(eventRow?.quotedPrice).toBe(4500);
    expect(eventRow?.stage).toBe("planning");
  });

  it("a second event's line and an explicit House salad add each keep their snapshot", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-dish-second-event";
    const { events } = rolesFor(proof, tenantId);
    const dishId = await seedGardenSalad(proof, tenantId);

    const firstEventId = await createEvent(
      proof,
      tenantId,
      "Second event snapshot one",
    );
    const firstLine = (await proof.executeCommand(
      events,
      M.EventDish_createViaAddToEvent,
      {
        eventId: firstEventId,
        dishId,
        quantityServings: 40,
        dishName: "Garden salad",
      },
    )) as { docId: string };

    const secondEventId = await createEvent(
      proof,
      tenantId,
      "Second event snapshot two",
    );
    const secondLine = (await proof.executeCommand(
      events,
      M.EventDish_createViaAddToEvent,
      {
        eventId: secondEventId,
        dishId,
        quantityServings: 40,
        dishName: "Garden salad",
      },
    )) as { docId: string };

    await proof.executeCommand(events, M.Dish_reviseDetails, {
      docId: dishId,
      name: "Garden salad RENAMED",
    });

    const firstAfter = await readRow(events, firstLine.docId);
    expect(firstAfter?.dishName).toBe("Garden salad");
    const secondAfter = await readRow(events, secondLine.docId);
    expect(secondAfter?.dishName).toBe("Garden salad");

    const thirdEventId = await createEvent(
      proof,
      tenantId,
      "Third event explicit house salad",
    );
    const thirdLine = (await proof.executeCommand(
      events,
      M.EventDish_createViaAddToEvent,
      {
        eventId: thirdEventId,
        dishId,
        quantityServings: 40,
        dishName: "House salad",
      },
    )) as { docId: string };
    const thirdBefore = await readRow(events, thirdLine.docId);
    expect(thirdBefore?.dishName).toBe("House salad");

    await proof.executeCommand(events, M.Dish_reviseDetails, {
      docId: dishId,
      name: "House salad RENAMED",
    });

    const catalog = await readRow(events, dishId);
    expect(catalog?.name).toBe("House salad RENAMED");
    const thirdAfter = await readRow(events, thirdLine.docId);
    expect(thirdAfter?.dishName).toBe("House salad");
  });
});
