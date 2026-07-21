/**
 * Runtime proof: PackList.open → startPacking → markPacked →
 * Delivery.schedule → startTransit → confirmDelivery.
 * Seeds every record through public generated createVia mutations.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { PackListOpenParamsSchema } from "../../schemas/manifest-schemas";

const S = {
  tenantA: "tenant-logistics-a",
  tenantB: "tenant-logistics-b",
  startsAt: Date.UTC(2026, 6, 22, 16, 0),
  endsAt: Date.UTC(2026, 6, 22, 22, 0),
  windowStartsAt: Date.UTC(2026, 6, 22, 14, 0),
  windowEndsAt: Date.UTC(2026, 6, 22, 15, 30),
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

async function seedEvent(proof: ReturnType<typeof harness>, tenantId: string) {
  const sales = proof.asRole({
    subject: `sales-${tenantId}`,
    role: "sales_manager",
    tenantId,
  });
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Logistics proof client ${tenantId}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Logistics packing proof event",
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 60,
      primaryContactName: "Logan Proof",
      budgetAmount: 5000,
      quotedPrice: 6200,
    },
  )) as { docId: string };
  return event.docId;
}

async function hireDriver(proof: ReturnType<typeof harness>, tenantId: string) {
  const manager = proof.asRole({
    subject: `workforce-manager-${tenantId}`,
    role: "workforce_manager",
    tenantId,
  });
  const result = (await proof.executeCommand(
    manager,
    api.mutations.Person_createViaHire,
    {
      givenName: "Dana",
      familyName: "Driver",
      email: `dana-${tenantId}@proof.example`,
      role: "driver",
      employmentType: "part_time",
    },
  )) as { docId: string };
  return result.docId;
}

describe("runtime proof: PackList → Delivery lifecycle", () => {
  it("opens a pack list, packs it, and confirms delivery with opaque ids", async () => {
    const proof = harness();
    const eventId = await seedEvent(proof, S.tenantA);
    const driverId = await hireDriver(proof, S.tenantA);
    const logistics = proof.asRole({
      subject: "logistics-manager-a",
      role: "logistics_manager",
      tenantId: S.tenantA,
    });

    // Regression: client Zod must accept Convex document ids for FK params.
    expect(() =>
      PackListOpenParamsSchema.parse({
        eventId,
        name: "Main load",
      }),
    ).not.toThrow();

    const pack = (await proof.executeCommand(
      logistics,
      api.mutations.PackList_createViaOpen,
      {
        eventId,
        name: "Main load",
        purpose: "Service",
      },
    )) as { docId: string };

    const opened = await logistics.run(async (ctx) =>
      ctx.db.get(pack.docId as never),
    );
    expect(opened).toMatchObject({
      tenantId: S.tenantA,
      eventId,
      status: "draft",
      name: "Main load",
    });

    await proof.executeCommand(
      logistics,
      api.mutations.PackListItem_createViaAddItem,
      {
        packListId: pack.docId,
        description: "Chafers",
        requiredQuantity: 4,
        unit: "each",
      },
    );

    await proof.executeCommand(logistics, api.mutations.PackList_startPacking, {
      docId: pack.docId,
      version: 1,
    });
    const packing = await logistics.run(async (ctx) =>
      ctx.db.get(pack.docId as never),
    );
    expect(packing).toMatchObject({ status: "packing", version: 2 });

    const packItems = (await logistics.query(
      api.queries.listPackListItem,
      {},
    )) as Array<{ _id: string; version: number }>;
    const item = packItems[0]!;
    expect(item).toBeDefined();
    await proof.executeCommand(
      logistics,
      api.mutations.PackListItem_markPacked,
      {
        docId: item._id,
        version: item.version,
        packedQuantity: 4,
      },
    );

    await proof.executeCommand(logistics, api.mutations.PackList_markPacked, {
      docId: pack.docId,
      version: 2,
    });
    const packed = await logistics.run(async (ctx) =>
      ctx.db.get(pack.docId as never),
    );
    expect(packed).toMatchObject({ status: "packed", version: 3 });

    // PackListPacked reaction match-else-creates Delivery.schedule.
    const autoDeliveries = await logistics.run(async (ctx) =>
      (await ctx.db.query("deliveries").collect()).filter(
        (row) =>
          (row as { deletedAt?: number | null }).deletedAt == null &&
          (row as { packListId?: string }).packListId === pack.docId,
      ),
    );
    expect(autoDeliveries).toHaveLength(1);
    const deliveryId = (autoDeliveries[0] as { _id: string })._id;
    const deliveryVersion = (autoDeliveries[0] as { version?: number }).version;

    // Attach driver for transit (cascade schedule leaves driver unset).
    const afterDriver = (await proof.executeCommand(
      logistics,
      api.mutations.Delivery_schedule,
      {
        docId: deliveryId,
        packListId: pack.docId,
        eventId,
        destination: "unused — keeps cascade destination",
        windowStartsAt: S.windowStartsAt,
        windowEndsAt: S.windowEndsAt,
        driverId,
        version: deliveryVersion,
      },
    )) as { version: number };

    await proof.executeCommand(logistics, api.mutations.Delivery_startTransit, {
      docId: deliveryId,
      version: afterDriver.version,
    });
    const confirmed = (await proof.executeCommand(
      logistics,
      api.mutations.Delivery_confirmDelivery,
      { docId: deliveryId, version: afterDriver.version + 1 },
    )) as { status: string; version: number };
    expect(confirmed).toMatchObject({
      status: "delivered",
      version: afterDriver.version + 2,
    });
  });

  it("denies kitchen staff and leaves no partial pack list", async () => {
    const proof = harness();
    const eventId = await seedEvent(proof, S.tenantA);
    const denied = proof.asRole({
      subject: "kitchen-staff",
      role: "kitchen_staff",
      tenantId: S.tenantA,
    });
    const logistics = proof.asRole({
      subject: "logistics-manager-a",
      role: "logistics_manager",
      tenantId: S.tenantA,
    });

    await expect(
      proof.executeCommand(denied, api.mutations.PackList_createViaOpen, {
        eventId,
        name: "Denied pack",
      }),
    ).rejects.toThrow(/Logistics staff|logisticsAccess|Guard/i);

    expect(await logistics.query(api.queries.listPackList, {})).toEqual([]);
  });

  it("isolates pack lists by tenant through the public list query", async () => {
    const proof = harness();
    const eventId = await seedEvent(proof, S.tenantA);
    const tenantA = proof.asRole({
      subject: "logistics-manager-a",
      role: "logistics_manager",
      tenantId: S.tenantA,
    });
    const tenantB = proof.asRole({
      subject: "logistics-manager-b",
      role: "logistics_manager",
      tenantId: S.tenantB,
    });

    await proof.executeCommand(tenantA, api.mutations.PackList_createViaOpen, {
      eventId,
      name: "Tenant A load",
    });

    expect(await tenantB.query(api.queries.listPackList, {})).toEqual([]);
    expect(await tenantA.query(api.queries.listPackList, {})).toEqual([
      expect.objectContaining({ tenantId: S.tenantA, name: "Tenant A load" }),
    ]);
  });
});
