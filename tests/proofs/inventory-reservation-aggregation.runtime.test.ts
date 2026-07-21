/**
 * S1 proof: InventoryItem reservation aggregation behavior.
 * Verifies: totalReserved, availableQuantity, and consume/release semantics.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

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

describe("S1 proof: inventory reservation aggregation", () => {
  it("totalReserved aggregates multiple active reservations; availableQuantity reflects on-hand minus reserved; consume decrements on-hand; release is status-only", async () => {
    const proof = harness();
    const tenantId = "tenant-s1-inventory-test";
    const kitchen = proof.asRole({
      subject: "kitchen-s1",
      role: "kitchen_staff",
      tenantId,
    });
    const sales = proof.asRole({
      subject: "sales-s1",
      role: "sales_manager",
      tenantId,
    });
    const events = proof.asRole({
      subject: "events-s1",
      role: "event_manager",
      tenantId,
    });
    const inventory = proof.asRole({
      subject: "inventory-s1",
      role: "inventory_staff",
      tenantId,
    });

    // Create client (required for events)
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "S1 Test Client",
      },
    )) as { docId: string };

    // Seed ingredient
    const ingredient = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "S1 Test Ingredient",
        unit: "each",
        costPerUnit: 5,
        allergens: [],
        category: "pantry",
      },
    )) as { docId: string };

    // Seed location
    const location = (await proof.executeCommand(
      inventory,
      api.mutations.StorageLocation_createViaRegister,
      { name: "S1 Test Location", locationType: "dry" },
    )) as { docId: string };

    // Create event
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "S1 Test Event",
        eventType: "corporate dinner",
        startsAt: Date.now(),
        endsAt: Date.now() + 3600000,
        expectedHeadcount: 10,
        primaryContactName: "S1 Test",
        budgetAmount: 1000,
        quotedPrice: 1500,
      },
    )) as { docId: string };

    // Open stock item with 100 on-hand
    const item = (await proof.executeCommand(
      inventory,
      api.mutations.InventoryItem_createViaOpen,
      {
        ingredientId: ingredient.docId,
        locationId: location.docId,
        unit: "each",
        quantityOnHand: 100,
        parLevel: 50,
        reorderThreshold: 20,
        unitCost: 5,
      },
    )) as { docId: string };

    // Verify initial state: on-hand 100, no reservations
    const initial = await inventory.run(async (ctx) => {
      const itemRows = await ctx.db.query("inventoryItems").collect();
      const reservationRows = await ctx.db
        .query("inventoryReservations")
        .collect();
      const itemRow = itemRows.find((r: any) => r._id === item.docId) ?? null;
      const activeReservations = reservationRows.filter(
        (r: any) => r.inventoryItemId === item.docId && r.status === "active",
      );
      const totalReserved = activeReservations.reduce(
        (sum: number, r: any) => sum + Number(r.quantity),
        0,
      );
      return {
        quantityOnHand: itemRow?.quantityOnHand,
        _totalReserved: totalReserved,
        _availableQuantity:
          Number(itemRow?.quantityOnHand ?? 0) - totalReserved,
      };
    });
    expect(initial).not.toBeNull();
    expect(Number(initial?.quantityOnHand)).toBe(100);
    expect(initial?._totalReserved).toBe(0);
    expect(initial?._availableQuantity).toBe(100);

    // Create and execute first reservation: 30 units (via HTTP dispatcher)
    const res1Result = (await (inventory as any)
      .fetch(`/api/manifest/InventoryReservation/commands/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: item.docId,
          eventId: event.docId,
          ingredientId: ingredient.docId,
          quantity: 30,
        }),
      })
      .then((r: Response) => r.json())) as { data: { docId: string } };
    const res1Id = res1Result.data.docId;

    // Get the created reservation and verify it's active
    const res1 = await inventory.run(async (ctx) => {
      const rows = await ctx.db.query("inventoryReservations").collect();
      return rows.find((r: any) => r._id === res1Id) ?? null;
    });
    expect(res1).toBeDefined();
    expect((res1 as any)?.status).toBe("active");

    // Verify: on-hand unchanged (100), reservations aggregate (30), available computed (70)
    const afterFirst = await inventory.run(async (ctx) => {
      const itemRows = await ctx.db.query("inventoryItems").collect();
      const reservationRows = await ctx.db
        .query("inventoryReservations")
        .collect();
      const itemRow = itemRows.find((r: any) => r._id === item.docId) ?? null;
      const activeReservations = reservationRows.filter(
        (r: any) => r.inventoryItemId === item.docId && r.status === "active",
      );
      const totalReserved = activeReservations.reduce(
        (sum: number, r: any) => sum + Number(r.quantity),
        0,
      );
      return {
        quantityOnHand: itemRow?.quantityOnHand,
        _totalReserved: totalReserved,
        _availableQuantity:
          Number(itemRow?.quantityOnHand ?? 0) - totalReserved,
      };
    });
    expect(Number(afterFirst?.quantityOnHand)).toBe(100); // on-hand unchanged
    expect(afterFirst?._totalReserved).toBe(30); // totalReserved aggregates active reservations
    expect(afterFirst?._availableQuantity).toBe(70); // available = on-hand - totalReserved

    // Create and execute second reservation: 20 units (via HTTP dispatcher)
    const res2Result = (await (inventory as any)
      .fetch(`/api/manifest/InventoryReservation/commands/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: item.docId,
          eventId: event.docId,
          ingredientId: ingredient.docId,
          quantity: 20,
        }),
      })
      .then((r: Response) => r.json())) as { data: { docId: string } };
    const res2Id = res2Result.data.docId;

    // Verify: totalReserved = 50 (30 + 20), availableQuantity = 50
    const afterSecond = await inventory.run(async (ctx) => {
      const itemRows = await ctx.db.query("inventoryItems").collect();
      const reservationRows = await ctx.db
        .query("inventoryReservations")
        .collect();
      const itemRow = itemRows.find((r: any) => r._id === item.docId) ?? null;
      const activeReservations = reservationRows.filter(
        (r: any) => r.inventoryItemId === item.docId && r.status === "active",
      );
      const totalReserved = activeReservations.reduce(
        (sum: number, r: any) => sum + Number(r.quantity),
        0,
      );
      return {
        quantityOnHand: itemRow?.quantityOnHand,
        _totalReserved: totalReserved,
        _availableQuantity:
          Number(itemRow?.quantityOnHand ?? 0) - totalReserved,
      };
    });
    expect(Number(afterSecond?.quantityOnHand)).toBe(100); // still unchanged
    expect(afterSecond?._totalReserved).toBe(50); // aggregates both reservations
    expect(afterSecond?._availableQuantity).toBe(50); // 100 - 50

    // Consume first reservation (30 units)
    await proof.executeCommand(
      inventory,
      api.mutations.InventoryReservation_consume,
      {
        docId: res1!._id,
        version: (res1 as any).version,
      },
    );

    // Verify: on-hand decremented by 30, totalReserved reduced to 20, availableQuantity = 50
    const afterConsume = await inventory.run(async (ctx) => {
      const itemRows = await ctx.db.query("inventoryItems").collect();
      const reservationRows = await ctx.db
        .query("inventoryReservations")
        .collect();
      const itemRow = itemRows.find((r: any) => r._id === item.docId) ?? null;
      const activeReservations = reservationRows.filter(
        (r: any) => r.inventoryItemId === item.docId && r.status === "active",
      );
      const totalReserved = activeReservations.reduce(
        (sum: number, r: any) => sum + Number(r.quantity),
        0,
      );
      return {
        quantityOnHand: itemRow?.quantityOnHand,
        _totalReserved: totalReserved,
        _availableQuantity:
          Number(itemRow?.quantityOnHand ?? 0) - totalReserved,
      };
    });
    expect(Number(afterConsume?.quantityOnHand)).toBe(70); // decremented by consumed amount (reaction fired)
    expect(afterConsume?._totalReserved).toBe(20); // only second reservation active
    expect(afterConsume?._availableQuantity).toBe(50); // 70 - 20

    // Get second reservation for release
    const res2 = await inventory.run(async (ctx) => {
      const rows = await ctx.db.query("inventoryReservations").collect();
      return rows.find((r: any) => r._id === res2Id) ?? null;
    });
    expect(res2).toBeDefined();

    // Release second reservation (20 units) - should NOT restore stock
    await proof.executeCommand(
      inventory,
      api.mutations.InventoryReservation_release,
      {
        docId: res2!._id,
        version: (res2 as any).version,
        reason: "S1 test release",
      },
    );

    // Verify: on-hand unchanged (70), totalReserved = 0, availableQuantity = 70
    const afterRelease = await inventory.run(async (ctx) => {
      const itemRows = await ctx.db.query("inventoryItems").collect();
      const reservationRows = await ctx.db
        .query("inventoryReservations")
        .collect();
      const itemRow = itemRows.find((r: any) => r._id === item.docId) ?? null;
      const activeReservations = reservationRows.filter(
        (r: any) => r.inventoryItemId === item.docId && r.status === "active",
      );
      const totalReserved = activeReservations.reduce(
        (sum: number, r: any) => sum + Number(r.quantity),
        0,
      );
      return {
        quantityOnHand: itemRow?.quantityOnHand,
        _totalReserved: totalReserved,
        _availableQuantity:
          Number(itemRow?.quantityOnHand ?? 0) - totalReserved,
      };
    });
    expect(Number(afterRelease?.quantityOnHand)).toBe(70); // NOT restored by release (status-only)
    expect(afterRelease?._totalReserved).toBe(0); // no active reservations
    expect(afterRelease?._availableQuantity).toBe(70); // 70 - 0

    // Verify reservation statuses
    const consumedRes = await inventory.run(async (ctx) => {
      const rows = await ctx.db.query("inventoryReservations").collect();
      return rows.find((r: any) => r._id === res1!._id) ?? null;
    });
    expect((consumedRes as any)?.status).toBe("consumed");

    const releasedRes = await inventory.run(async (ctx) => {
      const rows = await ctx.db.query("inventoryReservations").collect();
      return rows.find((r: any) => r._id === res2!._id) ?? null;
    });
    expect((releasedRes as any)?.status).toBe("released");
  });
});
