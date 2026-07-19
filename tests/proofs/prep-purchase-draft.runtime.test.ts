/**
 * Runtime proof: a buyer combines open prep-list purchase needs into one draft
 * order line, then submission—not draft creation—marks each need ordered.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  createManifestTestContext,
  type ManifestConvexTestHarness,
} from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

async function seedOpenNeeds(
  actor: ManifestConvexTestHarness,
  tenantId: string,
) {
  return actor.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      tenantId,
      clientType: "company",
      companyName: "Draft proof client",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 0,
    });
    const startsAt = Date.UTC(2026, 6, 20);
    const eventIds = await Promise.all(
      ["Monday service", "Tuesday service"].map((title, offset) =>
        ctx.db.insert("events", {
          tenantId,
          clientId,
          title,
          eventType: "catering",
          startsAt: startsAt + offset * 24 * 60 * 60 * 1000,
          expectedHeadcount: 20,
          budgetAmount: 1000,
          quotedPrice: 1200,
          stage: "approved",
          version: 0,
        }),
      ),
    );
    const ingredientId = await ctx.db.insert("ingredients", {
      tenantId,
      name: "Roma tomatoes",
      unit: "kilogram",
      costPerUnit: 2,
      status: "active",
      allergens: [],
      version: 0,
    });
    const vendorId = await ctx.db.insert("vendors", {
      tenantId,
      name: "Produce vendor",
      paymentTermsDays: 30,
      status: "active",
      onboardedAt: Date.now(),
      version: 0,
    });
    const needIds = await Promise.all(
      [2, 3].map(async (requiredQuantity, index) => {
        const ingredientDemandId = await ctx.db.insert("ingredientDemands", {
          tenantId,
          eventId: eventIds[index]!,
          ingredientId,
          requiredQuantity,
          unit: "kilogram",
          status: "confirmed",
          calculatedAt: Date.now(),
          confirmedAt: Date.now(),
          version: 0,
        });
        return ctx.db.insert("purchaseNeeds", {
          tenantId,
          eventId: eventIds[index]!,
          ingredientDemandId,
          ingredientId,
          requiredQuantity,
          unit: "kilogram",
          status: "open",
          openedAt: Date.now(),
          version: 0,
        });
      }),
    );
    return { eventIds, ingredientId, needIds, vendorId, startsAt };
  });
}

describe("runtime proof: prep-list range → combined purchase draft", () => {
  it("keeps contributing needs open until its combined draft is submitted", async () => {
    expect(api.mutations.PurchaseNeed_assignToDraft).toBeDefined();

    const proof = harness();
    const actor = proof.asRole({
      subject: "procurement-user",
      role: "procurement_staff",
      tenantId: "tenant-prep-purchase-draft",
    });
    const { ingredientId, needIds, vendorId, startsAt } = await seedOpenNeeds(
      actor,
      "tenant-prep-purchase-draft",
    );

    const order = (await proof.executeCommand(
      actor,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId,
        sourceRangeStart: startsAt,
        sourceRangeEnd: startsAt + 7 * 24 * 60 * 60 * 1000,
      },
    )) as { docId: string };
    const line = (await proof.executeCommand(
      actor,
      api.mutations.VendorOrderLine_createViaAddLine,
      {
        vendorOrderId: order.docId,
        ingredientId,
        orderedQuantity: 5,
        unit: "kilogram",
        unitCost: 0,
      },
    )) as { docId: string };

    for (const needId of needIds) {
      const need = await actor.run(async (ctx) => ctx.db.get(needId));
      await proof.executeCommand(
        actor,
        api.mutations.PurchaseNeed_assignToDraft,
        {
          docId: needId,
          version: need!.version,
          vendorOrderId: order.docId,
          vendorOrderLineId: line.docId,
        },
      );
    }

    const draftNeeds = await actor.run(async (ctx) =>
      Promise.all(needIds.map((id) => ctx.db.get(id))),
    );
    expect(draftNeeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "open",
          vendorOrderId: order.docId,
          vendorOrderLineId: line.docId,
        }),
      ]),
    );

    const draft = await actor.run(async (ctx) =>
      ctx.db.get(order.docId as never),
    );
    await proof.executeCommand(actor, api.mutations.VendorOrder_submit, {
      docId: order.docId,
      version: draft!.version,
    });

    const submittedNeeds = await actor.run(async (ctx) =>
      Promise.all(needIds.map((id) => ctx.db.get(id))),
    );
    expect(submittedNeeds.every((need) => need?.status === "ordered")).toBe(
      true,
    );
  });
});
