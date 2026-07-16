/**
 * Runtime proof: IngredientDemand_confirm → IngredientDemandConfirmed → PurchaseNeed.create
 * Executes the public generated mutation (not internals).
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  createManifestTestContext,
  type ManifestConvexTestHarness,
} from "@angriff36/manifest/proof-kit/convex-test";
import { DEMAND_CONFIRM_SCENARIO as S } from "../fixtures/demand-confirm-scenario";
import { modules } from "./convex-test-modules";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

async function seedCalculatedDemand(
  actor: ManifestConvexTestHarness,
  tenantId: string,
) {
  return actor.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      tenantId,
      clientType: "company",
      companyName: "Proof Client Co",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 0,
    });
    const eventId = await ctx.db.insert("events", {
      tenantId,
      clientId,
      title: S.eventTitle,
      eventType: "proof",
      expectedHeadcount: 10,
      budgetAmount: 1000,
      quotedPrice: 1200,
      stage: "approved",
      version: 0,
    });
    const ingredientId = await ctx.db.insert("ingredients", {
      tenantId,
      name: S.ingredientName,
      unit: S.unit,
      costPerUnit: 2.5,
      status: "active",
      allergens: [],
      version: 0,
    });
    const docId = await ctx.db.insert("ingredientDemands", {
      tenantId,
      eventId,
      ingredientId,
      requiredQuantity: S.requiredQuantity,
      unit: S.unit,
      status: "calculated",
      calculatedAt: Date.now(),
      version: 0,
    });
    return { docId, eventId, ingredientId };
  });
}

describe("runtime proof: IngredientDemand_confirm → PurchaseNeed", () => {
  it("allows inventory_staff, creates PurchaseNeed, emits event, bumps version", async () => {
    const proof = harness();
    const allowed = proof.asRole({
      subject: "user-allowed",
      role: S.allowedRole,
      tenantId: S.tenantA,
    });

    const { docId, eventId, ingredientId } = await seedCalculatedDemand(
      allowed,
      S.tenantA,
    );
    const before = await allowed.run(async (ctx) => ctx.db.get(docId));
    expect(before?.version).toBe(0);
    expect(before?.status).toBe("calculated");

    const result = (await proof.executeCommand(
      allowed,
      api.mutations.IngredientDemand_confirm,
      { docId, version: 0 },
    )) as { status: string; version: number; tenantId: string };

    expect(result.status).toBe("confirmed");
    expect(result.version).toBe(1);
    expect(result.tenantId).toBe(S.tenantA);

    const needs = await proof.expectDocuments(
      allowed,
      "purchaseNeeds",
      (doc) =>
        doc.tenantId === S.tenantA &&
        doc.ingredientDemandId === docId &&
        doc.eventId === eventId &&
        doc.ingredientId === ingredientId,
    );
    expect(needs).toHaveLength(1);
    expect(needs[0]!.status).toBe("open");
    expect(needs[0]!.requiredQuantity).toBe(S.requiredQuantity);
    expect(needs[0]!.unit).toBe(S.unit);
    expect(typeof needs[0]!.version).toBe("number");

    await proof.expectEvent(allowed, {
      type: "IngredientDemandConfirmed",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.ingredientDemandId === docId &&
        payload.eventId === eventId &&
        payload.requiredQuantity === S.requiredQuantity,
    });

    const listed = (await allowed.query(
      api.queries.listPurchaseNeed,
      {},
    )) as Array<Record<string, unknown>>;
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: S.tenantA,
          ingredientDemandId: docId,
          status: "open",
        }),
      ]),
    );
  });

  it("denies kitchen_staff without inventoryAccess", async () => {
    const proof = harness();
    const denied = proof.asRole({
      subject: "user-denied",
      role: S.deniedRole,
      tenantId: S.tenantA,
    });
    const allowed = proof.asRole({
      subject: "user-seed",
      role: S.allowedRole,
      tenantId: S.tenantA,
    });
    const { docId } = await seedCalculatedDemand(allowed, S.tenantA);

    await expect(
      proof.executeCommand(denied, api.mutations.IngredientDemand_confirm, {
        docId,
        version: 0,
      }),
    ).rejects.toThrow(/Inventory staff/i);
  });

  it("hides PurchaseNeed from another tenant via public list", async () => {
    const proof = harness();
    const tenantA = proof.asRole({
      subject: "user-a",
      role: S.allowedRole,
      tenantId: S.tenantA,
    });
    const tenantB = proof.asRole({
      subject: "user-b",
      role: S.allowedRole,
      tenantId: S.tenantB,
    });

    const { docId } = await seedCalculatedDemand(tenantA, S.tenantA);
    await proof.executeCommand(
      tenantA,
      api.mutations.IngredientDemand_confirm,
      {
        docId,
        version: 0,
      },
    );

    const foreign = (await tenantB.query(
      api.queries.listPurchaseNeed,
      {},
    )) as unknown[];
    expect(foreign).toEqual([]);

    const own = (await tenantA.query(
      api.queries.listPurchaseNeed,
      {},
    )) as Array<{ tenantId: string }>;
    expect(own.some((row) => row.tenantId === S.tenantA)).toBe(true);
  });
});
