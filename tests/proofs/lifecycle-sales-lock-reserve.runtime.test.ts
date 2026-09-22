/**
 * Runtime proof (AC-399 sales_lock slice): InventoryReservation.reserve is
 * allowed on sales_lock — a stock hold is an operations action, not a price
 * edit — while cancelled and final still refuse it (backend §4.2).
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
    companyName: `Sales-lock reserve client ${tenantId} ${title}`,
  });
  const event = await run(proof, sales, M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.expectedHeadcount,
    primaryContactName: "Casey SalesLockReserve",
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
] as const;
type LadderStage = (typeof LADDER)[number];

/** Same walker as the sales_lock event-dish proof, extended with
 * beginExecution + finalizeEvent so `final` is reachable: create is version
 * 1, each command bumps the version by one. */
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
  ];
  let version = 1;
  for (const [i, [role, cmd]] of plan.entries()) {
    if (LADDER.indexOf(target) < i + 1) break;
    await run(proof, role, cmd, { docId: eventId, version });
    version = i + 2;
  }
  return { eventId, version };
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

describe("runtime proof: InventoryReservation.reserve allowed on sales_lock", () => {
  it("reserve succeeds on sales_lock and leaves Event price untouched", async () => {
    const proof = harness();
    const tenantId = "tenant-slock-reserve-ok";
    const { events, kitchen, inventory } = rolesFor(proof, tenantId);
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Reserve on sales lock",
    );

    const ing = await run(proof, kitchen, M.Ingredient_createViaIntroduce, {
      name: `Sales-lock reserve ingredient ${tenantId}`,
      unit: "kilogram",
      costPerUnit: 3.5,
      allergens: [],
      category: "pantry",
    });
    const loc = await run(
      proof,
      inventory,
      M.StorageLocation_createViaRegister,
      {
        name: `Sales-lock reserve storage ${tenantId}`,
        locationType: "dry",
      },
    );
    const item = await run(proof, inventory, M.InventoryItem_createViaOpen, {
      ingredientId: ing.docId,
      locationId: loc.docId,
      unit: "kilogram",
      quantityOnHand: 30,
      parLevel: 10,
      reorderThreshold: 5,
      unitCost: 3.5,
    });

    const res = await run(
      proof,
      inventory,
      M.InventoryReservation_createViaReserve,
      {
        inventoryItemId: item.docId,
        eventId,
        ingredientId: ing.docId,
        quantity: 8,
      },
    );
    const row = await readRow(inventory, res.docId);
    expect(row.status).toBe("active");
    expect(row.quantity).toBe(8);
    expect(row.eventId).toBe(eventId);
    expect(row.reservedAt).toEqual(expect.any(Number));

    const eventRow = await readRow(events, eventId);
    expect(eventRow.stage).toBe("sales_lock");
    expect(eventRow.quotedPrice).toBe(4500);
    expect(eventRow.budgetAmount).toBe(3000);
    expect(eventRow.expectedHeadcount).toBe(40);
  });

  it("cancelled and final still refuse reserve", async () => {
    const proof = harness();
    const tenantId = "tenant-slock-reserve-no";
    const { events, kitchen, inventory } = rolesFor(proof, tenantId);

    const cancelled = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "Cancelled refuses reserve",
    );
    await run(proof, events, M.Event_cancel, {
      docId: cancelled.eventId,
      version: cancelled.version,
      reason: "Client postponed the event",
    });
    expect((await readRow(events, cancelled.eventId)).stage).toBe("cancelled");
    const cancelledStock = await seedStock(proof, tenantId, kitchen, inventory);
    await expect(
      run(proof, inventory, M.InventoryReservation_createViaReserve, {
        inventoryItemId: cancelledStock.itemId,
        eventId: cancelled.eventId,
        ingredientId: cancelledStock.ingredientId,
        quantity: 8,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);

    const final = await walkToStage(
      proof,
      tenantId,
      "final",
      "Final refuses reserve",
    );
    const finalStock = await seedStock(proof, tenantId, kitchen, inventory);
    await expect(
      run(proof, inventory, M.InventoryReservation_createViaReserve, {
        inventoryItemId: finalStock.itemId,
        eventId: final.eventId,
        ingredientId: finalStock.ingredientId,
        quantity: 8,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    expect((await readRow(events, final.eventId)).stage).toBe("final");
  });
});

/** One ingredient + one storage location + one stocked item
 * (quantityOnHand 30), seeded through the same governed commands as the
 * terminal-meanings proof; names are unique per call so seeds never collide. */
let seedCounter = 0;
async function seedStock(
  proof: Proof,
  tenantId: string,
  kitchen: Role,
  inventory: Role,
): Promise<{ ingredientId: string; itemId: string }> {
  seedCounter += 1;
  const ing = await run(proof, kitchen, M.Ingredient_createViaIntroduce, {
    name: `Sales-lock refuse ingredient ${tenantId} ${seedCounter}`,
    unit: "kilogram",
    costPerUnit: 3.5,
    allergens: [],
    category: "pantry",
  });
  const loc = await run(proof, inventory, M.StorageLocation_createViaRegister, {
    name: `Sales-lock refuse storage ${tenantId} ${seedCounter}`,
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
  return { ingredientId: ing.docId, itemId: item.docId };
}
