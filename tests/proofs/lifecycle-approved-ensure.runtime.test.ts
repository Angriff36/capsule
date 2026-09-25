/**
 * Runtime proof (AC-399 approved-ensure slice): Event.approve ENSURES the
 * approved-stage §4.2 records that already exist as Manifest reactions — one
 * draft invoice, one draft pack list, one planned batch per dish seed, one
 * open purchase need per eligible demand — and invents NO staffing shells
 * beyond what was actually posted.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 22, 17, 0),
  endsAt: Date.UTC(2026, 9, 22, 22, 0),
  headcount: 40,
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

function rolesFor(proof: Proof, tenantId: string) {
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
    inventory: proof.asRole({
      subject: `inventory-${tenantId}`,
      role: "inventory_staff",
      tenantId,
    }),
    workforce: proof.asRole({
      subject: `workforce-${tenantId}`,
      role: "workforce_manager",
      tenantId,
    }),
    logistics: proof.asRole({
      subject: `logistics-${tenantId}`,
      role: "logistics_manager",
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
      companyName: `Approved ensure client ${tenantId} ${title}`,
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
      expectedHeadcount: S.headcount,
      primaryContactName: "Casey Approved",
      budgetAmount: 3200,
      quotedPrice: 4800,
    },
  )) as { docId: string };
  return event.docId;
}

/** Live (deletedAt == null) rows in one table, filtered to one event. */
async function liveRowsFor(
  reader: Role,
  table:
    | "invoices"
    | "packLists"
    | "purchaseNeeds"
    | "eventStaffNeeds"
    | "productionBatches",
  eventId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = (await reader.run(async (ctx) =>
    ctx.db.query(table).collect(),
  )) as Array<Record<string, unknown>>;
  return rows.filter(
    (row) =>
      (row as { deletedAt?: number | null }).deletedAt == null &&
      (row as { eventId?: string }).eventId === eventId,
  );
}

async function readEventStage(actor: Role, eventId: string): Promise<string> {
  const row = (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as { stage: string };
  return row.stage;
}

async function seedDishComponentForEvent(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const { events, kitchen } = rolesFor(proof, tenantId);
  const component = (await proof.executeCommand(
    kitchen,
    M.Component_createViaDraft,
    {
      name: `Approved ensure rolls ${tenantId}`,
      yieldQuantity: 1,
      yieldUnit: "portion",
      batchMultiplier: 1,
    },
  )) as { docId: string };
  await proof.executeCommand(kitchen, M.Component_publishVersion, {
    docId: component.docId,
    version: 1,
  });
  const dish = (await proof.executeCommand(kitchen, M.Dish_createViaIntroduce, {
    name: `Approved ensure roll ${tenantId}`,
    portionSize: 1,
    portionUnit: "portion",
    category: "bread",
  })) as { docId: string };
  await proof.executeCommand(kitchen, M.DishComponent_createViaAttach, {
    dishId: dish.docId,
    componentId: component.docId,
    yieldQuantity: 1,
    batchMultiplier: 1,
  });
  await proof.executeCommand(events, M.EventDish_createViaAddToEvent, {
    eventId,
    dishId: dish.docId,
    quantityServings: S.headcount,
  });
}

async function seedEligibleDemandForEvent(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const { kitchen, inventory } = rolesFor(proof, tenantId);
  const ingredient = (await proof.executeCommand(
    kitchen,
    M.Ingredient_createViaIntroduce,
    {
      name: `Approved ensure flour ${tenantId}`,
      unit: "kilogram",
      costPerUnit: 2.5,
      allergens: [],
      category: "pantry",
    },
  )) as { docId: string };
  await proof.executeCommand(inventory, M.IngredientDemand_createViaCalculate, {
    eventId,
    ingredientId: ingredient.docId,
    requiredQuantity: 4.5,
    unit: "kilogram",
    servings: S.headcount,
  });
}

describe("runtime proof: Event.approve ensures the approved-stage §4.2 records (AC-399 approved-ensure slice)", () => {
  it("a bare approve ensures only the draft invoice and pack list", async () => {
    const proof = harness();
    const tenantId = "tenant-approved-ensure-bare";
    const { events, logistics } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Bare approve ensures invoice and pack only",
    );

    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventId,
      version: 1,
    });
    await proof.executeCommand(events, M.Event_approve, {
      docId: eventId,
      version: 2,
    });

    expect(await readEventStage(logistics, eventId)).toBe("approved");

    const invoices = await liveRowsFor(logistics, "invoices", eventId);
    expect(invoices).toHaveLength(1);
    const invoice = invoices[0] as { status?: string; sentAt?: number | null };
    expect(invoice.status).toBe("draft");
    expect(invoice.sentAt == null).toBe(true);

    const packLists = await liveRowsFor(logistics, "packLists", eventId);
    expect(packLists).toHaveLength(1);
    expect((packLists[0] as { status?: string }).status).toBe("draft");

    expect(await liveRowsFor(logistics, "purchaseNeeds", eventId)).toHaveLength(
      0,
    );
    expect(
      await liveRowsFor(logistics, "eventStaffNeeds", eventId),
    ).toHaveLength(0);
    expect(
      await liveRowsFor(logistics, "productionBatches", eventId),
    ).toHaveLength(0);
  });

  it("approve with a dish seed and calculated demand ensures the prep batch and purchase need", async () => {
    const proof = harness();
    const tenantId = "tenant-approved-ensure-seeded";
    const { events, logistics } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Seeded approve ensures batch and purchase need",
    );

    await seedDishComponentForEvent(proof, tenantId, eventId);
    await seedEligibleDemandForEvent(proof, tenantId, eventId);

    expect(
      await liveRowsFor(logistics, "productionBatches", eventId),
    ).toHaveLength(0);
    expect(await liveRowsFor(logistics, "purchaseNeeds", eventId)).toHaveLength(
      0,
    );

    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventId,
      version: 1,
    });
    await proof.executeCommand(events, M.Event_approve, {
      docId: eventId,
      version: 2,
    });

    expect(await readEventStage(logistics, eventId)).toBe("approved");

    const invoices = await liveRowsFor(logistics, "invoices", eventId);
    expect(invoices).toHaveLength(1);
    expect((invoices[0] as { status?: string }).status).toBe("draft");

    const packLists = await liveRowsFor(logistics, "packLists", eventId);
    expect(packLists).toHaveLength(1);
    expect((packLists[0] as { status?: string }).status).toBe("draft");

    const batches = await liveRowsFor(logistics, "productionBatches", eventId);
    expect(batches).toHaveLength(1);
    const batch = batches[0] as {
      status?: string;
      plannedYield?: number;
      yieldUnit?: string;
    };
    expect(batch.status).toBe("planned");
    expect(Number(batch.plannedYield)).toBe(S.headcount);
    expect(batch.yieldUnit).toBe("portion");

    const needs = await liveRowsFor(logistics, "purchaseNeeds", eventId);
    expect(needs).toHaveLength(1);
    const need = needs[0] as {
      status?: string;
      requiredQuantity?: number;
    };
    expect(need.status).toBe("open");
    expect(Number(need.requiredQuantity)).toBe(4.5);
  });

  it("a posted staff need survives approve and approve invents no extra roles", async () => {
    const proof = harness();
    const tenantId = "tenant-approved-ensure-staffing";
    const { events, workforce, logistics } = rolesFor(proof, tenantId);
    const eventId = await createEvent(
      proof,
      tenantId,
      "Posted staff need survives approve",
    );

    await proof.executeCommand(workforce, M.EventStaffNeed_createViaPostOpen, {
      eventId,
      role: "captain",
    });

    const before = await liveRowsFor(logistics, "eventStaffNeeds", eventId);
    expect(before).toHaveLength(1);
    expect((before[0] as { role?: string }).role).toBe("captain");

    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventId,
      version: 1,
    });
    await proof.executeCommand(events, M.Event_approve, {
      docId: eventId,
      version: 2,
    });

    expect(await readEventStage(logistics, eventId)).toBe("approved");

    const after = await liveRowsFor(logistics, "eventStaffNeeds", eventId);
    expect(after).toHaveLength(1);
    const staffNeed = after[0] as { role?: string; status?: string };
    expect(staffNeed.role).toBe("captain");
    expect(staffNeed.status).toBe("open");

    const invoices = await liveRowsFor(logistics, "invoices", eventId);
    expect(invoices).toHaveLength(1);
    expect((invoices[0] as { status?: string }).status).toBe("draft");

    const packLists = await liveRowsFor(logistics, "packLists", eventId);
    expect(packLists).toHaveLength(1);
    expect((packLists[0] as { status?: string }).status).toBe("draft");

    expect(await liveRowsFor(logistics, "purchaseNeeds", eventId)).toHaveLength(
      0,
    );
  });
});
