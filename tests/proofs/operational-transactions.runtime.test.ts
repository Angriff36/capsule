import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const harness = () =>
  createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });

describe("operational transactions", () => {
  const seedStockOperation = async (
    proof: ReturnType<typeof harness>,
    options: { requiredQuantity?: number } = {},
  ) => {
    const owner = proof.asRole({
      subject: "stock-owner",
      role: "owner",
      tenantId: "stock-tenant",
    });
    const clientId = await proof.seedEntity(owner, "clients", {
      tenantId: "stock-tenant",
      clientType: "company",
      companyName: "Client",
      taxExempt: false,
      paymentTermsDays: 0,
      status: "active",
      version: 1,
    });
    const eventId = await proof.seedEntity(owner, "events", {
      tenantId: "stock-tenant",
      clientId,
      title: "Service",
      eventType: "wedding",
      expectedHeadcount: 10,
      budgetAmount: 0,
      quotedPrice: 0,
      stage: "approved",
      version: 1,
    });
    const otherEventId = await proof.seedEntity(owner, "events", {
      tenantId: "stock-tenant",
      clientId,
      title: "Other",
      eventType: "wedding",
      expectedHeadcount: 10,
      budgetAmount: 0,
      quotedPrice: 0,
      stage: "approved",
      version: 1,
    });
    const ingredientId = await proof.seedEntity(owner, "ingredients", {
      tenantId: "stock-tenant",
      name: "Flour",
      unit: "kilogram",
      costPerUnit: 1,
      status: "active",
      version: 1,
    });
    const otherIngredientId = await proof.seedEntity(owner, "ingredients", {
      tenantId: "stock-tenant",
      name: "Sugar",
      unit: "kilogram",
      costPerUnit: 1,
      status: "active",
      version: 1,
    });
    const locationId = await proof.seedEntity(owner, "storageLocations", {
      tenantId: "stock-tenant",
      name: "Dry store",
      status: "active",
      version: 1,
    });
    const itemId = await proof.seedEntity(owner, "inventoryItems", {
      tenantId: "stock-tenant",
      ingredientId,
      locationId,
      quantityOnHand: 20,
      unit: "kilogram",
      parLevel: 5,
      reorderThreshold: 2,
      unitCost: 1,
      stockedAt: 1,
      version: 1,
    });
    const mismatchedItemId = await proof.seedEntity(owner, "inventoryItems", {
      tenantId: "stock-tenant",
      ingredientId: otherIngredientId,
      locationId,
      quantityOnHand: 20,
      unit: "kilogram",
      parLevel: 5,
      reorderThreshold: 2,
      unitCost: 1,
      stockedAt: 1,
      version: 1,
    });
    const demandId = await proof.seedEntity(owner, "ingredientDemands", {
      tenantId: "stock-tenant",
      eventId,
      ingredientId,
      requiredQuantity: options.requiredQuantity ?? 10,
      unit: "kilogram",
      status: "calculated",
      calculatedAt: 1,
      version: 1,
    });
    const reservationId = await proof.seedEntity(
      owner,
      "inventoryReservations",
      {
        tenantId: "stock-tenant",
        inventoryItemId: itemId,
        eventId,
        ingredientId,
        quantity: 10,
        status: "active",
        reservedAt: 1,
        version: 1,
      },
    );
    const mismatchReservationId = await proof.seedEntity(
      owner,
      "inventoryReservations",
      {
        tenantId: "stock-tenant",
        inventoryItemId: mismatchedItemId,
        eventId,
        ingredientId,
        quantity: 1,
        status: "active",
        reservedAt: 1,
        version: 1,
      },
    );
    return {
      owner,
      eventId,
      otherEventId,
      itemId,
      demandId,
      reservationId,
      mismatchReservationId,
    };
  };

  it("rolls back every earlier timeline adjustment when a later version is stale", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "timeline-owner",
      role: "owner",
      tenantId: "ops-tenant",
    });
    const clientId = await proof.seedEntity(owner, "clients", {
      tenantId: "ops-tenant",
      clientType: "company",
      companyName: "Client",
      taxExempt: false,
      paymentTermsDays: 0,
      status: "active",
      version: 1,
    });
    const eventId = await proof.seedEntity(owner, "events", {
      tenantId: "ops-tenant",
      clientId,
      title: "Service",
      eventType: "wedding",
      startsAt: 1,
      endsAt: 2,
      expectedHeadcount: 10,
      budgetAmount: 0,
      quotedPrice: 0,
      stage: "planning",
      version: 1,
    });
    const first = await proof.seedEntity(owner, "eventTimelineActivities", {
      tenantId: "ops-tenant",
      eventId,
      name: "First",
      startsAt: 10,
      sortOrder: 0,
      scheduledAt: 1,
      version: 1,
    });
    const second = await proof.seedEntity(owner, "eventTimelineActivities", {
      tenantId: "ops-tenant",
      eventId,
      name: "Second",
      startsAt: 20,
      sortOrder: 1,
      scheduledAt: 1,
      version: 2,
    });
    await expect(
      owner.mutation(
        (api.lib as any).operationalTransactions.reorderEventTimeline,
        {
          eventId,
          rows: [
            { docId: first, startsAt: 20, sortOrder: 1, version: 1 },
            { docId: second, startsAt: 10, sortOrder: 0, version: 1 },
          ],
        },
      ),
    ).rejects.toThrow(/VERSION_MISMATCH/);
    expect(await owner.run((ctx) => ctx.db.get(first as never))).toMatchObject({
      startsAt: 10,
      sortOrder: 0,
      version: 1,
    });
  });

  it("rolls back reservation and stock when demand reconciliation fails after consume", async () => {
    const proof = harness();
    const seeded = await seedStockOperation(proof, { requiredQuantity: -1 });
    await expect(
      seeded.owner.mutation(
        (api.lib as any).operationalTransactions.issueEventStock,
        {
          eventId: seeded.eventId,
          reservationId: seeded.reservationId,
          reservationVersion: 1,
          operationKey: "stock-failure",
        },
      ),
    ).rejects.toThrow(/positive/i);
    expect(
      await seeded.owner.run((ctx) =>
        ctx.db.get(seeded.reservationId as never),
      ),
    ).toMatchObject({ status: "active", version: 1 });
    expect(
      await seeded.owner.run((ctx) => ctx.db.get(seeded.itemId as never)),
    ).toMatchObject({ quantityOnHand: 20, version: 1 });
  });

  it("atomically consumes, confirms, rereads the actual version, fulfills, and cannot consume twice", async () => {
    const proof = harness();
    const seeded = await seedStockOperation(proof);
    const args = {
      eventId: seeded.eventId,
      reservationId: seeded.reservationId,
      reservationVersion: 1,
      operationKey: "stock-success",
    };
    await seeded.owner.mutation(
      (api.lib as any).operationalTransactions.issueEventStock,
      args,
    );
    expect(
      await seeded.owner.run((ctx) => ctx.db.get(seeded.demandId as never)),
    ).toMatchObject({ status: "fulfilled", version: 4 });
    expect(
      await seeded.owner.run((ctx) => ctx.db.get(seeded.itemId as never)),
    ).toMatchObject({ quantityOnHand: 10, version: 2 });
    expect(
      await seeded.owner.mutation(
        (api.lib as any).operationalTransactions.issueEventStock,
        args,
      ),
    ).toMatchObject({ recovered: true, consumedQuantity: 10 });
    expect(
      await seeded.owner.run((ctx) => ctx.db.get(seeded.itemId as never)),
    ).toMatchObject({ quantityOnHand: 10, version: 2 });
  });

  it("rejects the wrong tenant, event, and ingredient before consuming", async () => {
    const proof = harness();
    const seeded = await seedStockOperation(proof);
    const outsider = proof.asRole({
      subject: "outsider",
      role: "owner",
      tenantId: "other-tenant",
    });
    await expect(
      outsider.mutation(
        (api.lib as any).operationalTransactions.issueEventStock,
        {
          eventId: seeded.eventId,
          reservationId: seeded.reservationId,
          reservationVersion: 1,
          operationKey: "wrong-tenant",
        },
      ),
    ).rejects.toThrow(/not found/i);
    await expect(
      seeded.owner.mutation(
        (api.lib as any).operationalTransactions.issueEventStock,
        {
          eventId: seeded.otherEventId,
          reservationId: seeded.reservationId,
          reservationVersion: 1,
          operationKey: "wrong-event",
        },
      ),
    ).rejects.toThrow(/not found/i);
    await expect(
      seeded.owner.mutation(
        (api.lib as any).operationalTransactions.issueEventStock,
        {
          eventId: seeded.eventId,
          reservationId: seeded.mismatchReservationId,
          reservationVersion: 1,
          operationKey: "wrong-ingredient",
        },
      ),
    ).rejects.toThrow(/does not match/i);
    expect(
      await seeded.owner.run((ctx) =>
        ctx.db.get(seeded.reservationId as never),
      ),
    ).toMatchObject({ status: "active", version: 1 });
  });
});
