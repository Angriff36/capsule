/**
 * Runtime proof (2026-09-29, governed writes):
 * - equipment reservation creation is the generated
 *   EquipmentReservation_createViaReserve, which emits EquipmentReserved; the
 *   pooled-quantity check also holds for a direct call to it;
 * - rental reconciliation moves a reserved hold through
 *   EquipmentReservation.moveWindow (tenant system runner) when event staff —
 *   who hold no equipment policy — reschedule, and only that path may run it;
 * - booking a built-in service style materializes it through the generated
 *   ServiceStyle commands (system runner) for booking roles, idempotently.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

beforeAll(ensureTestFieldEncryptionKey);

const M = api.mutations;
const TENANT = "tenant-equipment-style";
const S = {
  startsAt: Date.UTC(2026, 10, 10, 17, 0),
  endsAt: Date.UTC(2026, 10, 10, 22, 0),
} as const;
const R = {
  startsAt: Date.UTC(2026, 10, 11, 17, 0),
  endsAt: Date.UTC(2026, 10, 11, 22, 0),
} as const;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}
type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;
type Row = Record<string, unknown> & { _id: string; version: number };
type LedgerRow = {
  type: string;
  entityId: string;
  payload: Record<string, unknown>;
};

async function run(proof: Proof, actor: Actor, fn: unknown, args: object) {
  return (await proof.executeCommand(actor, fn as never, args as never)) as {
    docId: string;
  };
}

function actors(proof: Proof) {
  const as = (subject: string, role: string) =>
    proof.asRole({ subject, role, tenantId: TENANT });
  return {
    sales: as("es-sales", "sales_manager"),
    salesStaff: as("es-sales-staff", "sales_staff"),
    eventStaff: as("es-event-staff", "event_staff"),
    eventManager: as("es-event-manager", "event_manager"),
    inventory: as("es-inventory", "inventory_staff"),
    kitchen: as("es-kitchen", "kitchen_staff"),
  };
}

async function read(actor: Actor, id: string): Promise<Row> {
  return (await actor.run(async (ctx) => ctx.db.get(id as never))) as Row;
}

async function ledger(actor: Actor, type: string): Promise<LedgerRow[]> {
  return (await actor.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).filter(
      (row) => row.type === type,
    ),
  )) as unknown as LedgerRow[];
}

async function seed(proof: Proof) {
  const a = actors(proof);
  const client = await run(proof, a.sales, M.Client_createViaRegister, {
    clientType: "company",
    companyName: "Equipment proof client",
  });
  const event = await run(proof, a.sales, M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Equipment proof",
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: 40,
    primaryContactName: "Rene Rental",
    budgetAmount: 1000,
    quotedPrice: 1500,
  });
  const equipment = await run(
    proof,
    a.inventory,
    M.Equipment_createViaRegister,
    {
      name: "Round tables",
      assetTag: "tables-proof",
      category: "furniture",
      ownership: "owned",
      quantity: 2,
    },
  );
  return { a, eventId: event.docId, equipmentId: equipment.docId };
}

function reserve(
  actor: Actor,
  s: { eventId: string; equipmentId: string },
  quantity: number,
) {
  return actor.mutation(api.equipmentCheckout.reserve, {
    equipmentId: s.equipmentId,
    eventId: s.eventId,
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    quantity,
  }) as Promise<{ equipmentReservationId: string }>;
}

describe("runtime proof: equipment reservation is a generated command", () => {
  it("the seam creates the hold through createViaReserve, which emits EquipmentReserved", async () => {
    const proof = harness();
    const s = await seed(proof);
    const { equipmentReservationId } = await reserve(s.a.inventory, s, 1);
    expect(await read(s.a.inventory, equipmentReservationId)).toMatchObject({
      tenantId: TENANT,
      equipmentId: s.equipmentId,
      eventId: s.eventId,
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      quantity: 1,
      status: "reserved",
      version: 1,
    });
    const events = await ledger(s.a.inventory, "EquipmentReserved");
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({
      equipmentReservationId,
      equipmentId: s.equipmentId,
      eventId: s.eventId,
      tenantId: TENANT,
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      quantity: 1,
    });
  });

  it("keeps the audience: event managers and kitchen staff are refused on both paths", async () => {
    const proof = harness();
    const s = await seed(proof);
    for (const actor of [s.a.eventManager, s.a.kitchen]) {
      await expect(reserve(actor, s, 1)).rejects.toThrow(
        /Inventory or logistics access/,
      );
      await expect(
        run(proof, actor, M.EquipmentReservation_createViaReserve, {
          equipmentId: s.equipmentId,
          eventId: s.eventId,
          startsAt: S.startsAt,
          endsAt: S.endsAt,
          quantity: 1,
        }),
      ).rejects.toThrow();
    }
    expect(await ledger(s.a.inventory, "EquipmentReserved")).toHaveLength(0);
  });

  it("a direct call to the generated mutation cannot overbook the lot", async () => {
    const proof = harness();
    const s = await seed(proof);
    await reserve(s.a.inventory, s, 2);
    await expect(reserve(s.a.inventory, s, 1)).rejects.toThrow(
      /has 0 available/,
    );
    await expect(
      run(proof, s.a.inventory, M.EquipmentReservation_createViaReserve, {
        equipmentId: s.equipmentId,
        eventId: s.eventId,
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        quantity: 1,
      }),
    ).rejects.toThrow(/has 0 available/);
    const rows = (await s.a.inventory.run(async (ctx) =>
      ctx.db.query("equipmentReservations").collect(),
    )) as unknown[];
    expect(rows).toHaveLength(1);
    expect(await ledger(s.a.inventory, "EquipmentReserved")).toHaveLength(1);
  });
});

describe("runtime proof: rental reconciliation moves holds through moveWindow", () => {
  it("event staff reschedule moves the reserved hold; the command emits the event", async () => {
    const proof = harness();
    const s = await seed(proof);
    const { equipmentReservationId } = await reserve(s.a.inventory, s, 1);
    const event = await read(s.a.eventStaff, s.eventId);

    await run(proof, s.a.eventStaff, M.Event_reschedule, {
      docId: s.eventId,
      version: event.version,
      startsAt: R.startsAt,
      endsAt: R.endsAt,
    });

    expect(await read(s.a.inventory, equipmentReservationId)).toMatchObject({
      startsAt: R.startsAt,
      endsAt: R.endsAt,
      status: "reserved",
      version: 2,
    });
    const moved = await ledger(
      s.a.inventory,
      "EquipmentReservationRescheduled",
    );
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({
      entityId: equipmentReservationId,
      payload: {
        equipmentReservationId,
        tenantId: TENANT,
        previousStartsAt: S.startsAt,
        previousEndsAt: S.endsAt,
        startsAt: R.startsAt,
        endsAt: R.endsAt,
      },
    });
  });

  it("only the reconciliation path may run moveWindow", async () => {
    const proof = harness();
    const s = await seed(proof);
    const { equipmentReservationId } = await reserve(s.a.inventory, s, 1);
    await expect(
      run(proof, s.a.inventory, M.EquipmentReservation_moveWindow, {
        docId: equipmentReservationId,
        startsAt: R.startsAt,
        endsAt: R.endsAt,
      }),
    ).rejects.toThrow();
    expect((await read(s.a.inventory, equipmentReservationId)).startsAt).toBe(
      S.startsAt,
    );
  });
});

describe("runtime proof: booking materializes built-in service styles by command", () => {
  const pick = { name: "Plated", code: "plated", sortOrder: 3 };

  async function styles(actor: Actor): Promise<Row[]> {
    return (await actor.run(async (ctx) =>
      (await ctx.db.query("serviceStyles").collect()).filter(
        (row) => row.code === "plated",
      ),
    )) as unknown as Row[];
  }

  it("creates once through ServiceStyle_createViaRegister for sales staff, then reuses", async () => {
    const proof = harness();
    const a = actors(proof);
    const first = (await a.salesStaff.mutation(
      api.eventCreateCatalog.ensureBuiltInServiceStyle,
      pick,
    )) as { docId: string };
    const again = (await a.salesStaff.mutation(
      api.eventCreateCatalog.ensureBuiltInServiceStyle,
      pick,
    )) as { docId: string };
    expect(again.docId).toBe(first.docId);
    const rows = await styles(a.salesStaff);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "active",
      name: "Plated",
      sortOrder: 3,
    });
    expect(rows[0]!.registeredAt).toEqual(expect.any(Number));
    const registered = await ledger(a.salesStaff, "ServiceStyleRegistered");
    expect(registered).toHaveLength(1);
    expect(registered[0]!.payload).toMatchObject({
      serviceStyleId: first.docId,
      tenantId: TENANT,
      code: "plated",
    });
  });

  it("reactivates an inactive built-in through ServiceStyle_activate", async () => {
    const proof = harness();
    const a = actors(proof);
    const { docId } = (await a.eventStaff.mutation(
      api.eventCreateCatalog.ensureBuiltInServiceStyle,
      pick,
    )) as { docId: string };
    const row = await read(a.eventManager, docId);
    await run(proof, a.eventManager, M.ServiceStyle_deactivate, {
      docId,
      version: row.version,
      reason: "Seasonal",
    });
    await a.salesStaff.mutation(
      api.eventCreateCatalog.ensureBuiltInServiceStyle,
      pick,
    );
    expect(await read(a.eventManager, docId)).toMatchObject({
      status: "active",
    });
    expect(await ledger(a.eventManager, "ServiceStyleActivated")).toHaveLength(
      1,
    );
  });

  it("refuses non-booking roles, and booking roles still cannot call the generated command", async () => {
    const proof = harness();
    const a = actors(proof);
    await expect(
      a.kitchen.mutation(
        api.eventCreateCatalog.ensureBuiltInServiceStyle,
        pick,
      ),
    ).rejects.toThrow(/Sales or event access/);
    await expect(
      run(proof, a.salesStaff, M.ServiceStyle_createViaRegister, pick),
    ).rejects.toThrow();
    expect(await styles(a.eventManager)).toHaveLength(0);
  });
});
