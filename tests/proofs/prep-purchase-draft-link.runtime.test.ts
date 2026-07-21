/**
 * Runtime proof: prep-list draft generate links VendorOrderLineDemand with
 * denormalized vendorOrderId (one-hop draft guard) for multiple ingredients.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  createManifestTestContext,
  type ManifestConvexTestHarness,
} from "@angriff36/manifest/proof-kit/convex-test";
import { PrepPurchaseDraftCoordinator } from "../../src/features/inventory/PrepPurchaseDraftCoordinator";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-prep-draft-link";
const DAY = 24 * 60 * 60 * 1000;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

async function seedMultiIngredientNeeds(
  actor: ManifestConvexTestHarness,
  tenantId: string,
) {
  return actor.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      tenantId,
      clientType: "company",
      companyName: "Link proof client",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 0,
    });
    const startsAt = Date.UTC(2026, 6, 20);
    const eventId = await ctx.db.insert("events", {
      tenantId,
      clientId,
      title: "UI Purchasing Test Event",
      eventType: "catering",
      startsAt,
      expectedHeadcount: 20,
      budgetAmount: 1000,
      quotedPrice: 1200,
      stage: "approved",
      version: 0,
    });
    const onionId = await ctx.db.insert("ingredients", {
      tenantId,
      name: "UI Inventory Demo Onion",
      unit: "each",
      costPerUnit: 1,
      status: "active",
      allergens: [],
      version: 0,
    });
    const chickenId = await ctx.db.insert("ingredients", {
      tenantId,
      name: "UI Inventory Demo Chicken",
      unit: "each",
      costPerUnit: 4,
      status: "active",
      allergens: [],
      version: 0,
    });
    const vendorId = await ctx.db.insert("vendors", {
      tenantId,
      name: "UI Test Produce Vendor",
      paymentTermsDays: 30,
      status: "active",
      onboardedAt: Date.now(),
      version: 0,
    });

    async function openNeed(
      ingredientId: string,
      requiredQuantity: number,
    ): Promise<{ needId: string; demandId: string }> {
      const demandId = String(
        await ctx.db.insert("ingredientDemands", {
          tenantId,
          eventId,
          ingredientId,
          requiredQuantity,
          unit: "each",
          status: "confirmed",
          calculatedAt: Date.now(),
          confirmedAt: Date.now(),
          version: 0,
        }),
      );
      const needId = String(
        await ctx.db.insert("purchaseNeeds", {
          tenantId,
          eventId,
          ingredientDemandId: demandId,
          ingredientId,
          requiredQuantity,
          unit: "each",
          status: "open",
          openedAt: Date.now(),
          version: 0,
        }),
      );
      return { needId, demandId };
    }

    const onion = await openNeed(String(onionId), 5);
    const chicken = await openNeed(String(chickenId), 20);
    return {
      startsAt,
      eventId: String(eventId),
      vendorId: String(vendorId),
      onionId: String(onionId),
      chickenId: String(chickenId),
      onion,
      chicken,
    };
  });
}

describe("runtime proof: prep-list draft line demand links", () => {
  it("generates a shared draft with onion + chicken links and no Guard 2 failure", async () => {
    const proof = harness();
    const actor = proof.asRole({
      subject: "procurement-link",
      role: "procurement_staff",
      tenantId: TENANT,
    });
    const seeded = await seedMultiIngredientNeeds(actor, TENANT);
    const rangeStart = seeded.startsAt;
    const rangeEnd = seeded.startsAt + 7 * DAY;

    const coordinator = new PrepPurchaseDraftCoordinator({
      openOrder: (input) =>
        proof.executeCommand(
          actor,
          api.mutations.VendorOrder_createViaOpen,
          input,
        ) as Promise<{ docId: string }>,
      addLine: (input) =>
        proof.executeCommand(
          actor,
          api.mutations.VendorOrderLine_createViaAddLine,
          input,
        ) as Promise<{ docId: string }>,
      linkDemand: (input) =>
        proof.executeCommand(
          actor,
          api.mutations.VendorOrderLineDemand_createViaLink,
          input,
        ) as Promise<{ docId: string }>,
      assignNeedToDraft: (input) =>
        proof.executeCommand(
          actor,
          api.mutations.PurchaseNeed_assignToDraft,
          input,
        ),
      cancelOrder: (input) =>
        proof.executeCommand(actor, api.mutations.VendorOrder_cancel, input),
      cancelLine: (input) =>
        proof.executeCommand(
          actor,
          api.mutations.VendorOrderLine_cancelLine,
          input,
        ),
      retireDemandLink: (input) =>
        proof.executeCommand(
          actor,
          api.mutations.VendorOrderLineDemand_retire,
          input,
        ),
    });

    const onionNeed = await actor.run(async (ctx) =>
      ctx.db.get(seeded.onion.needId as never),
    );
    const chickenNeed = await actor.run(async (ctx) =>
      ctx.db.get(seeded.chicken.needId as never),
    );

    const result = await coordinator.generate({
      vendorId: seeded.vendorId,
      rangeStart,
      rangeEnd,
      needs: [
        {
          id: seeded.onion.needId,
          version: Number(onionNeed!.version),
          eventId: seeded.eventId,
          ingredientDemandId: seeded.onion.demandId,
          ingredientId: seeded.onionId,
          requiredQuantity: 5,
          unit: "each",
          status: "open",
        },
        {
          id: seeded.chicken.needId,
          version: Number(chickenNeed!.version),
          eventId: seeded.eventId,
          ingredientDemandId: seeded.chicken.demandId,
          ingredientId: seeded.chickenId,
          requiredQuantity: 20,
          unit: "each",
          status: "open",
        },
      ],
      events: [{ id: seeded.eventId, startsAt: seeded.startsAt }],
    });

    expect(result.lineCount).toBe(2);
    expect(result.needCount).toBe(2);

    const links = await actor.run(async (ctx) =>
      ctx.db.query("vendorOrderLineDemands").collect(),
    );
    expect(links).toHaveLength(2);
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientDemandId: seeded.onion.demandId,
          vendorOrderId: result.orderId,
          contributionQuantity: 5,
        }),
        expect.objectContaining({
          ingredientDemandId: seeded.chicken.demandId,
          vendorOrderId: result.orderId,
          contributionQuantity: 20,
        }),
      ]),
    );

    const order = await actor.run(async (ctx) =>
      ctx.db.get(result.orderId as never),
    );
    expect(order).toMatchObject({ status: "draft" });

    const assigned = await actor.run(async (ctx) =>
      Promise.all([
        ctx.db.get(seeded.onion.needId),
        ctx.db.get(seeded.chicken.needId),
      ]),
    );
    expect(assigned.every((row) => row?.vendorOrderId === result.orderId)).toBe(
      true,
    );
    expect(assigned.every((row) => row?.status === "open")).toBe(true);
  });

  it("cancels a newly opened order when link creation fails mid-generate", async () => {
    const proof = harness();
    const actor = proof.asRole({
      subject: "procurement-rollback",
      role: "procurement_staff",
      tenantId: `${TENANT}-rollback`,
    });
    const seeded = await seedMultiIngredientNeeds(actor, `${TENANT}-rollback`);
    let linkCalls = 0;

    const coordinator = new PrepPurchaseDraftCoordinator({
      openOrder: (input) =>
        proof.executeCommand(
          actor,
          api.mutations.VendorOrder_createViaOpen,
          input,
        ) as Promise<{ docId: string }>,
      addLine: (input) =>
        proof.executeCommand(
          actor,
          api.mutations.VendorOrderLine_createViaAddLine,
          input,
        ) as Promise<{ docId: string }>,
      linkDemand: async (input) => {
        linkCalls += 1;
        if (linkCalls === 1) {
          return (await proof.executeCommand(
            actor,
            api.mutations.VendorOrderLineDemand_createViaLink,
            input,
          )) as { docId: string };
        }
        throw new Error("Guard 2 failed");
      },
      assignNeedToDraft: (input) =>
        proof.executeCommand(
          actor,
          api.mutations.PurchaseNeed_assignToDraft,
          input,
        ),
      cancelOrder: (input) =>
        proof.executeCommand(actor, api.mutations.VendorOrder_cancel, input),
      retireDemandLink: (input) =>
        proof.executeCommand(
          actor,
          api.mutations.VendorOrderLineDemand_retire,
          input,
        ),
    });

    const onionNeed = await actor.run(async (ctx) =>
      ctx.db.get(seeded.onion.needId as never),
    );
    const chickenNeed = await actor.run(async (ctx) =>
      ctx.db.get(seeded.chicken.needId as never),
    );

    await expect(
      coordinator.generate({
        vendorId: seeded.vendorId,
        rangeStart: seeded.startsAt,
        rangeEnd: seeded.startsAt + 7 * DAY,
        needs: [
          {
            id: seeded.onion.needId,
            version: Number(onionNeed!.version),
            eventId: seeded.eventId,
            ingredientDemandId: seeded.onion.demandId,
            ingredientId: seeded.onionId,
            requiredQuantity: 5,
            unit: "each",
            status: "open",
          },
          {
            id: seeded.chicken.needId,
            version: Number(chickenNeed!.version),
            eventId: seeded.eventId,
            ingredientDemandId: seeded.chicken.demandId,
            ingredientId: seeded.chickenId,
            requiredQuantity: 20,
            unit: "each",
            status: "open",
          },
        ],
        events: [{ id: seeded.eventId, startsAt: seeded.startsAt }],
      }),
    ).rejects.toThrow("Guard 2 failed");

    const orders = await actor.run(async (ctx) =>
      ctx.db.query("vendorOrders").collect(),
    );
    expect(orders.every((order) => order.status === "cancelled")).toBe(true);
    expect(orders.some((order) => order.status === "draft")).toBe(false);

    const links = await actor.run(async (ctx) =>
      ctx.db.query("vendorOrderLineDemands").collect(),
    );
    expect(links.every((link) => link.deletedAt != null)).toBe(true);

    const needs = await actor.run(async (ctx) =>
      Promise.all([
        ctx.db.get(seeded.onion.needId as never),
        ctx.db.get(seeded.chicken.needId as never),
      ]),
    );
    expect(needs.every((need) => need?.vendorOrderId == null)).toBe(true);
    expect(needs.every((need) => need?.status === "open")).toBe(true);
  });
});
