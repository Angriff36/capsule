/**
 * Runtime proof (2026-09-29, governed writes): driver and vehicle assignment
 * on a Delivery go through the generated Delivery.assignDriver /
 * unassignDriver / assignVehicle / unassignVehicle commands. The authored
 * seams (convex/driverAssignment.ts, convex/vehicleAssignment.ts) keep their
 * pre-checks and call the commands; the events are emitted by the commands
 * with the same payload fields as before; the vehicle calendar-conflict check
 * also holds for a direct call to the generated mutation; authorization is
 * unchanged.
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
const TENANT = "tenant-delivery-assignment";
const W = {
  startsAt: Date.UTC(2026, 10, 3, 16, 0),
  endsAt: Date.UTC(2026, 10, 3, 22, 0),
  windowStartsAt: Date.UTC(2026, 10, 3, 14, 0),
  windowEndsAt: Date.UTC(2026, 10, 3, 15, 30),
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
  entity: string;
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
    sales: as("da-sales", "sales_manager"),
    workforce: as("da-workforce", "workforce_manager"),
    logistics: as("da-logistics", "logistics_manager"),
    kitchen: as("da-kitchen", "kitchen_staff"),
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

/** Planned event → packed pack list → scheduled Delivery (cascade). */
async function seedDelivery(
  proof: Proof,
  a: ReturnType<typeof actors>,
  eventId: string,
  name: string,
): Promise<string> {
  const pack = await run(proof, a.logistics, M.PackList_createViaOpen, {
    eventId,
    name,
    purpose: "Service",
  });
  await run(proof, a.logistics, M.PackListItem_createViaAddItem, {
    packListId: pack.docId,
    description: "Chafers",
    requiredQuantity: 1,
    unit: "each",
  });
  await run(proof, a.logistics, M.PackList_startPacking, {
    docId: pack.docId,
    version: 1,
  });
  const items = (await a.logistics.run(async (ctx) =>
    (await ctx.db.query("packListItems").collect()).filter(
      (row) => row.packListId === pack.docId,
    ),
  )) as unknown as Row[];
  await run(proof, a.logistics, M.PackListItem_markPacked, {
    docId: items[0]!._id,
    version: items[0]!.version,
    packedQuantity: 1,
  });
  await run(proof, a.logistics, M.PackList_markPacked, {
    docId: pack.docId,
    version: 2,
  });
  const delivery = (await a.logistics.run(async (ctx) =>
    (await ctx.db.query("deliveries").collect()).find(
      (row) => row.packListId === pack.docId,
    ),
  )) as unknown as Row;
  await run(proof, a.logistics, M.Delivery_schedule, {
    docId: delivery._id,
    version: delivery.version,
    packListId: pack.docId,
    eventId,
    destination: "Main hall",
    windowStartsAt: W.windowStartsAt,
    windowEndsAt: W.windowEndsAt,
  });
  return delivery._id;
}

async function seed(proof: Proof) {
  const a = actors(proof);
  const client = await run(proof, a.sales, M.Client_createViaRegister, {
    clientType: "company",
    companyName: "Delivery assignment client",
  });
  const event = await run(proof, a.sales, M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Delivery assignment proof",
    eventType: "corporate dinner",
    startsAt: W.startsAt,
    endsAt: W.endsAt,
    expectedHeadcount: 40,
    primaryContactName: "Dana Dispatch",
    budgetAmount: 1000,
    quotedPrice: 1500,
  });
  const driver = await run(proof, a.workforce, M.Person_createViaHire, {
    givenName: "Dana",
    familyName: "Driver",
    email: "dana@delivery-assignment.example",
    role: "driver",
    employmentType: "part_time",
  });
  const vehicle = await run(proof, a.logistics, M.Vehicle_createViaRegister, {
    make: "Ford",
    model: "Transit",
    registration: "VAN-001",
    ownership: "owned",
    payloadCapacityKg: 1200,
    operationalStatus: "available",
  });
  const first = await seedDelivery(proof, a, event.docId, "Load A");
  const second = await seedDelivery(proof, a, event.docId, "Load B");
  return {
    a,
    eventId: event.docId,
    driverId: driver.docId,
    vehicleId: vehicle.docId,
    first,
    second,
  };
}

describe("runtime proof: delivery driver assignment is a generated command", () => {
  it("assigns and unassigns through the seam; the commands emit the events", async () => {
    const proof = harness();
    const s = await seed(proof);
    const before = await read(s.a.logistics, s.first);

    await s.a.logistics.mutation(api.driverAssignment.assign, {
      deliveryId: s.first,
      driverId: s.driverId,
      version: before.version,
    });
    const assigned = await read(s.a.logistics, s.first);
    expect(assigned).toMatchObject({
      driverId: s.driverId,
      version: before.version + 1,
    });
    const [assignedEvent] = await ledger(
      s.a.logistics,
      "DeliveryDriverAssigned",
    );
    expect(assignedEvent).toMatchObject({
      entity: "Delivery",
      entityId: s.first,
      payload: {
        deliveryId: s.first,
        tenantId: TENANT,
        driverId: s.driverId,
        eventId: s.eventId,
      },
    });

    await s.a.logistics.mutation(api.driverAssignment.unassign, {
      deliveryId: s.first,
    });
    expect(await read(s.a.logistics, s.first)).toMatchObject({
      driverId: null,
      version: before.version + 2,
    });
    const unassigned = await ledger(s.a.logistics, "DeliveryDriverUnassigned");
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0]!.payload).toEqual({
      deliveryId: s.first,
      tenantId: TENANT,
      driverId: s.driverId,
      eventId: s.eventId,
    });

    // Retry of an unassign on an empty slot: no write, no second event.
    await s.a.logistics.mutation(api.driverAssignment.unassign, {
      deliveryId: s.first,
    });
    expect(
      await ledger(s.a.logistics, "DeliveryDriverUnassigned"),
    ).toHaveLength(1);
    expect((await read(s.a.logistics, s.first)).version).toBe(
      before.version + 2,
    );
  });

  it("refuses roles outside the Delivery policy on the seam and the generated command", async () => {
    const proof = harness();
    const s = await seed(proof);
    await expect(
      s.a.kitchen.mutation(api.driverAssignment.assign, {
        deliveryId: s.first,
        driverId: s.driverId,
      }),
    ).rejects.toThrow(/Logistics or manager access/);
    await expect(
      run(proof, s.a.kitchen, M.Delivery_assignDriver, {
        docId: s.first,
        driverId: s.driverId,
      }),
    ).rejects.toThrow();
    expect((await read(s.a.logistics, s.first)).driverId ?? null).toBeNull();
  });

  it("the generated command itself refuses a driver that is not an active person here", async () => {
    const proof = harness();
    const s = await seed(proof);
    await expect(
      run(proof, s.a.logistics, M.Delivery_assignDriver, {
        docId: s.first,
        driverId: s.vehicleId,
      }),
    ).rejects.toThrow(/active person/);
    const other = proof.asRole({
      subject: "da-other",
      role: "logistics_manager",
      tenantId: "tenant-delivery-assignment-other",
    });
    await expect(
      run(proof, other, M.Delivery_assignDriver, {
        docId: s.first,
        driverId: s.driverId,
      }),
    ).rejects.toThrow();
    expect(await ledger(s.a.logistics, "DeliveryDriverAssigned")).toHaveLength(
      0,
    );
  });
});

describe("runtime proof: delivery vehicle assignment is a generated command", () => {
  it("assigns and unassigns through the seam with the same event payloads", async () => {
    const proof = harness();
    const s = await seed(proof);
    const before = await read(s.a.logistics, s.first);
    await s.a.logistics.mutation(api.vehicleAssignment.assign, {
      deliveryId: s.first,
      vehicleId: s.vehicleId,
    });
    expect(await read(s.a.logistics, s.first)).toMatchObject({
      vehicleId: s.vehicleId,
      version: before.version + 1,
    });
    const [assigned] = await ledger(s.a.logistics, "DeliveryVehicleAssigned");
    expect(assigned!.payload).toEqual({
      deliveryId: s.first,
      tenantId: TENANT,
      vehicleId: s.vehicleId,
      eventId: s.eventId,
      windowStartsAt: before.windowStartsAt,
      windowEndsAt: before.windowEndsAt,
    });

    await s.a.logistics.mutation(api.vehicleAssignment.unassign, {
      deliveryId: s.first,
    });
    const [unassigned] = await ledger(
      s.a.logistics,
      "DeliveryVehicleUnassigned",
    );
    expect(unassigned!.payload).toEqual({
      deliveryId: s.first,
      tenantId: TENANT,
      vehicleId: s.vehicleId,
      eventId: s.eventId,
    });
    expect((await read(s.a.logistics, s.first)).vehicleId).toBeNull();
  });

  it("a direct call to the generated mutation cannot double-book the vehicle", async () => {
    const proof = harness();
    const s = await seed(proof);
    await s.a.logistics.mutation(api.vehicleAssignment.assign, {
      deliveryId: s.first,
      vehicleId: s.vehicleId,
    });
    const second = await read(s.a.logistics, s.second);

    await expect(
      s.a.logistics.mutation(api.vehicleAssignment.assign, {
        deliveryId: s.second,
        vehicleId: s.vehicleId,
      }),
    ).rejects.toThrow(/already booked/);
    await expect(
      run(proof, s.a.logistics, M.Delivery_assignVehicle, {
        docId: s.second,
        vehicleId: s.vehicleId,
      }),
    ).rejects.toThrow(/already booked/);

    // The refused command rolled back: no vehicle, no version bump, one event.
    expect(await read(s.a.logistics, s.second)).toMatchObject({
      version: second.version,
    });
    expect((await read(s.a.logistics, s.second)).vehicleId ?? null).toBeNull();
    expect(await ledger(s.a.logistics, "DeliveryVehicleAssigned")).toHaveLength(
      1,
    );
  });

  it("refuses kitchen staff and a retired vehicle", async () => {
    const proof = harness();
    const s = await seed(proof);
    await expect(
      s.a.kitchen.mutation(api.vehicleAssignment.assign, {
        deliveryId: s.first,
        vehicleId: s.vehicleId,
      }),
    ).rejects.toThrow(/Logistics or manager access/);
    await expect(
      run(proof, s.a.kitchen, M.Delivery_assignVehicle, {
        docId: s.first,
        vehicleId: s.vehicleId,
      }),
    ).rejects.toThrow();

    const retired = await run(
      proof,
      s.a.logistics,
      M.Vehicle_createViaRegister,
      {
        make: "Ford",
        model: "Transit",
        registration: "VAN-OLD",
        ownership: "owned",
        payloadCapacityKg: 1200,
        operationalStatus: "retired",
      },
    );
    await expect(
      run(proof, s.a.logistics, M.Delivery_assignVehicle, {
        docId: s.first,
        vehicleId: retired.docId,
      }),
    ).rejects.toThrow(/not retired/);
    expect(await ledger(s.a.logistics, "DeliveryVehicleAssigned")).toHaveLength(
      0,
    );
  });
});
