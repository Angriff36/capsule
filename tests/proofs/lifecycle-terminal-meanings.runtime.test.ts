/**
 * Runtime proof (AC-399 terminal-meanings slice): completed releases active
 * holds (consumed stays history); closed_out seeds one draft closeout and
 * refuses commercial edits and post-finalize recapture; cancelled stands
 * down the draft pack, voids the unpaid invoice and releases holds (§4.2).
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
  expectedHeadcount: 40,
  quotedPrice: 4500,
  budgetAmount: 3000,
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
type Cmd = Parameters<Proof["executeCommand"]>[1];

async function run<T = { docId: string }>(
  proof: Proof,
  role: Role,
  cmd: Cmd,
  args: Record<string, unknown>,
): Promise<T> {
  return (await proof.executeCommand(role, cmd, args as never)) as T;
}

function rolesFor(proof: Proof, tenantId: string) {
  const mk = (name: string, role: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role, tenantId });
  return {
    sales: mk("sales", "sales_manager"),
    events: mk("event-manager", "event_manager"),
    kitchen: mk("kitchen", "kitchen_manager"),
    inventory: mk("inventory", "inventory_staff"),
    finance: mk("finance", "finance_manager"),
  };
}

async function createEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<string> {
  const { sales } = rolesFor(proof, tenantId);
  const client = await run(proof, sales, M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Terminal client ${tenantId} ${title}`,
  });
  const event = await run(proof, sales, M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.expectedHeadcount,
    primaryContactName: "Casey Terminal",
    budgetAmount: S.budgetAmount,
    quotedPrice: S.quotedPrice,
  });
  return event.docId;
}

const LADDER = [
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "closed_out",
] as const;
type LadderStage = (typeof LADDER)[number];

/** Same walker as the final-actuals proof, extended with Event.complete and
 * Event.closeOut: create is version 1, each command bumps the version by one. */
async function walkToStage(
  proof: Proof,
  tenantId: string,
  target: LadderStage,
  title: string,
): Promise<{ eventId: string; version: number }> {
  const { sales, events } = rolesFor(proof, tenantId);
  const eventId = await createEvent(proof, tenantId, title);
  const plan: Array<readonly [Role, Cmd]> = [
    [events, M.Event_submitForApproval],
    [events, M.Event_approve],
    [sales, M.Event_lockForSales],
    [events, M.Event_beginExecution],
    [events, M.Event_finalizeEvent],
    [events, M.Event_complete],
    [events, M.Event_closeOut],
  ];
  let version = 1;
  for (const [i, [role, cmd]] of plan.entries()) {
    if (LADDER.indexOf(target) < i + 1) break;
    await run(proof, role, cmd, { docId: eventId, version });
    version = i + 2;
  }
  return { eventId, version };
}

let holdSeed = 0;

/** One active inventory reservation, seeded through the same governed
 * commands as the relation-guarded-creation proof. Reserve stops after
 * executing, so callers seed at approved before walking the ladder. */
async function seedActiveHold(
  proof: Proof,
  tenantId: string,
  eventId: string,
  quantity: number,
): Promise<{ reservationId: string }> {
  const { kitchen, inventory } = rolesFor(proof, tenantId);
  const mRes = M.InventoryReservation_createViaReserve;
  holdSeed += 1;
  const ing = await run(proof, kitchen, M.Ingredient_createViaIntroduce, {
    name: `Terminal hold ingredient ${tenantId} ${holdSeed}`,
    unit: "kilogram",
    costPerUnit: 3.5,
    allergens: [],
    category: "pantry",
  });
  const loc = await run(proof, inventory, M.StorageLocation_createViaRegister, {
    name: `Terminal hold storage ${tenantId} ${holdSeed}`,
    locationType: "dry",
  });
  const item = await run(proof, inventory, M.InventoryItem_createViaOpen, {
    ingredientId: ing.docId,
    locationId: loc.docId,
    unit: "kilogram",
    quantityOnHand: 30,
    parLevel: 10,
    reorderThreshold: 5,
    unitCost: 3.5,
  });
  const res = await run(proof, inventory, mRes, {
    inventoryItemId: item.docId,
    eventId,
    ingredientId: ing.docId,
    quantity,
  });
  return { reservationId: res.docId };
}

/** Live (deletedAt == null) rows in one table, filtered to one event. */
async function liveRowsFor(
  reader: Role,
  table: "invoices" | "packLists" | "eventCloseouts" | "inventoryReservations",
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

async function readRow(
  actor: Role,
  docId: string,
): Promise<Record<string, unknown>> {
  return (await actor.run(async (ctx) => ctx.db.get(docId as never))) as Record<
    string,
    unknown
  >;
}

async function statusOf(actor: Role, docId: string): Promise<string> {
  return (await readRow(actor, docId)).status as string;
}

describe("runtime proof: completed / closed_out / cancelled §4.2 meanings", () => {
  it("complete releases the active hold and leaves the consumed hold", async () => {
    const proof = harness();
    const tenantId = "tenant-terminal-complete";
    const { sales, events, kitchen, inventory } = rolesFor(proof, tenantId);
    // Seed holds at approved (reserve stops after executing), then finish.
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "approved",
      "Complete releases holds",
    );
    const args = { docId: eventId };
    const holdA = await seedActiveHold(proof, tenantId, eventId, 8);
    const holdB = await seedActiveHold(proof, tenantId, eventId, 4);
    await run(proof, inventory, M.InventoryReservation_consume, {
      docId: holdB.reservationId,
      version: 1,
    });
    await run(proof, sales, M.Event_lockForSales, { ...args, version: 3 });
    await run(proof, events, M.Event_beginExecution, { ...args, version: 4 });
    await run(proof, events, M.Event_finalizeEvent, { ...args, version: 5 });
    await run(proof, events, M.Event_complete, { ...args, version: 6 });

    expect(await statusOf(inventory, holdA.reservationId)).toBe("released");
    expect(await statusOf(inventory, holdB.reservationId)).toBe("consumed");
    const eventRow = await readRow(events, eventId);
    expect(eventRow).toMatchObject({
      stage: "completed",
      quotedPrice: 4500,
      budgetAmount: 3000,
      expectedHeadcount: 40,
      version: 7,
    });

    const dish = await run(proof, kitchen, M.Dish_createViaIntroduce, {
      name: `Terminal no-plan dish ${tenantId}`,
      portionSize: 1,
      portionUnit: "portion",
    });
    await expect(
      run(proof, events, M.EventDish_createViaAddToEvent, {
        eventId,
        dishId: dish.docId,
        quantityServings: 40,
        course: "main",
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    const untouched = await readRow(events, eventId);
    expect(untouched).toMatchObject({ stage: "completed", version: 7 });
  });

  it("closeOut seeds a draft closeout and finalize refuses another capture", async () => {
    const proof = harness();
    const tenantId = "tenant-terminal-closeout";
    const { events, finance } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "completed",
      "Closeout seeds draft",
    );
    const args = { docId: eventId, version: version + 1 };

    await run(proof, events, M.Event_closeOut, {
      docId: eventId,
      version,
    });
    expect((await readRow(events, eventId)).stage).toBe("closed_out");

    const closeouts = await liveRowsFor(finance, "eventCloseouts", eventId);
    expect(closeouts).toHaveLength(1);
    const draft = closeouts[0] as {
      _id: string;
      status: string;
      version: number;
      budgetedRevenue: number;
      actualRevenue: number;
      capturedAt: number;
    };
    expect(draft.status).toBe("draft");
    expect(draft.budgetedRevenue).toBe(4500);
    expect(draft.actualRevenue).toBe(0);
    expect(draft.capturedAt).toBeGreaterThan(0);
    const closeoutId = draft._id;

    const refused: Array<readonly [Cmd, Record<string, unknown>]> = [
      [M.Event_changePricing, { ...args, budgetAmount: 1, quotedPrice: 1 }],
      [M.Event_changeHeadcount, { ...args, newHeadcount: 99 }],
      [M.Event_cancel, { ...args, reason: "too late" }],
    ];
    for (const [cmd, attempt] of refused) {
      await expect(run(proof, events, cmd, attempt)).rejects.toThrow(
        /Guard|Invalid state transition/,
      );
    }
    const still = await readRow(events, eventId);
    expect(still).toMatchObject({
      stage: "closed_out",
      quotedPrice: 4500,
      budgetAmount: 3000,
      expectedHeadcount: 40,
      version: version + 1,
    });

    await run(proof, finance, M.EventCloseout_finalize, {
      docId: closeoutId,
      version: draft.version,
    });
    expect(await statusOf(finance, closeoutId)).toBe("finalized");

    await expect(
      run(proof, finance, M.EventCloseout_capture, {
        docId: closeoutId,
        eventId,
        actualRevenue: 0,
        budgetedRevenue: 4500,
        revenueVariance: 4500,
        actualIngredientCost: 0,
        actualWasteCost: 0,
        actualLaborCost: 0,
        actualVendorCost: 0,
        budgetedCost: 3000,
        totalActualCost: 0,
        costVariance: 3000,
        grossProfit: 0,
        expectedHeadcount: 40,
        actualHeadcount: 0,
        version: draft.version + 1,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    expect(await statusOf(finance, closeoutId)).toBe("finalized");
  });

  it("cancel from approved stands down draft pack and voids unpaid draft invoice", async () => {
    const proof = harness();
    const tenantId = "tenant-terminal-cancel";
    const { events, finance, inventory } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "approved",
      "Cancel stands down drafts",
    );
    const args = { docId: eventId };
    const hold = await seedActiveHold(proof, tenantId, eventId, 6);

    const invoicesBefore = await liveRowsFor(finance, "invoices", eventId);
    expect(invoicesBefore).toHaveLength(1);
    expect(invoicesBefore[0].status).toBe("draft");
    const packsBefore = await liveRowsFor(inventory, "packLists", eventId);
    expect(packsBefore).toHaveLength(1);
    expect(packsBefore[0].status).toBe("draft");

    await run(proof, events, M.Event_cancel, {
      ...args,
      version,
      reason: "Client withdrew",
    });

    const eventRow = await readRow(events, eventId);
    expect(eventRow).toMatchObject({
      stage: "cancelled",
      cancellationReason: "Client withdrew",
      quotedPrice: 4500,
      budgetAmount: 3000,
      expectedHeadcount: 40,
    });

    const packId = (packsBefore[0]._id as string) ?? "";
    const packAfter = await readRow(inventory, packId);
    expect(packAfter.status).toBe("cancelled");
    expect(packAfter.deletedAt == null).toBe(true);
    const invoiceId = (invoicesBefore[0]._id as string) ?? "";
    const invoiceAfter = await readRow(finance, invoiceId);
    expect(invoiceAfter.status).toBe("voided");
    expect(invoiceAfter.deletedAt == null).toBe(true);
    expect(await statusOf(inventory, hold.reservationId)).toBe("released");
  });
});
