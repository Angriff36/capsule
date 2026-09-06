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
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
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
      companyName: "Atomic materialization proof",
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Atomic materialization",
      eventType: "dinner",
      startsAt: Date.UTC(2026, 8, 20, 18),
      endsAt: Date.UTC(2026, 8, 20, 22),
      expectedHeadcount: 20,
      primaryContactName: "Avery Proof",
      budgetAmount: 1000,
      quotedPrice: 1200,
    },
  )) as { docId: string };
  return event.docId;
}

describe("runtime proof: safe template materialization", () => {
  it("rolls back every pack item when a later generated command rejects", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-atomic";
    const eventId = await seedEvent(proof, tenantId);
    const logistics = proof.asRole({
      subject: "pack-manager",
      role: "logistics_manager",
      tenantId,
    });
    const pack = (await proof.executeCommand(
      logistics,
      api.mutations.PackList_createViaOpen,
      {
        eventId,
        name: "Main load",
      },
    )) as { docId: string };

    await expect(
      proof.executeCommand(
        logistics,
        (api.lib as any).safeMaterialization.applyPackTemplate,
        {
          packListId: pack.docId,
          operationKey: "pack-template:main:one",
          items: [
            { description: "Chafers", requiredQuantity: 2, unit: "each" },
            { description: "Invalid", requiredQuantity: -1, unit: "each" },
          ],
        },
      ),
    ).rejects.toThrow();

    const rows = (await logistics.query(
      api.queries.listPackListItem,
      {},
    )) as unknown[];
    expect(rows).toEqual([]);
  });

  it("retries a confirmed pack-template operation without duplicate rows", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-retry";
    const eventId = await seedEvent(proof, tenantId);
    const logistics = proof.asRole({
      subject: "pack-retry-manager",
      role: "logistics_manager",
      tenantId,
    });
    const pack = (await proof.executeCommand(
      logistics,
      api.mutations.PackList_createViaOpen,
      { eventId, name: "Retry load" },
    )) as { docId: string };
    const original = {
      packListId: pack.docId,
      items: [
        { description: "Chafers", requiredQuantity: 2, unit: "each" },
        { description: "Linens", requiredQuantity: 12, unit: "each" },
      ],
    };
    const first = {
      key: "runtime-pack:storage-unavailable",
      payload: original,
    };
    const firstResult = await proof.executeCommand(
      logistics,
      (api.lib as any).safeMaterialization.applyPackTemplate,
      { ...first.payload, operationKey: first.key },
    );
    const changed = {
      ...original,
      items: [
        { description: "New source row", requiredQuantity: 1, unit: "each" },
        ...original.items,
      ],
    };
    const retryResult = await proof.executeCommand(
      logistics,
      (api.lib as any).safeMaterialization.applyPackTemplate,
      { ...original, operationKey: first.key },
    );
    expect(firstResult).toEqual({ itemCount: 2, recovered: false });
    expect(retryResult).toEqual({ itemCount: 2, recovered: true });
    const secondResult = await proof.executeCommand(
      logistics,
      (api.lib as any).safeMaterialization.applyPackTemplate,
      { ...original, operationKey: "runtime-pack:second" },
    );
    expect(secondResult).toEqual({ itemCount: 2, recovered: false });
    const afterAmbiguousRefresh = await proof.executeCommand(
      logistics,
      (api.lib as any).safeMaterialization.applyPackTemplate,
      {
        ...changed,
        operationKey: "runtime-pack:storage-unavailable",
      },
    );
    expect(afterAmbiguousRefresh).toEqual({ itemCount: 2, recovered: true });
    const rows = (await logistics.query(
      api.queries.listPackListItem,
      {},
    )) as unknown[];
    expect(rows).toHaveLength(4);
  });

  it("rejects foreign-tenant parents before replaying generated idempotency keys", async () => {
    const proof = harness();
    const eventId = await seedEvent(proof, "tenant-parent-owner");
    const owner = proof.asRole({
      subject: "parent-owner",
      role: "logistics_manager",
      tenantId: "tenant-parent-owner",
    });
    const outsider = proof.asRole({
      subject: "parent-outsider",
      role: "logistics_manager",
      tenantId: "tenant-parent-outsider",
    });
    const pack = (await proof.executeCommand(
      owner,
      api.mutations.PackList_createViaOpen,
      { eventId, name: "Owned load" },
    )) as { docId: string };
    const args = {
      packListId: pack.docId,
      operationKey: "shared-key",
      items: [{ description: "Owned", requiredQuantity: 1, unit: "each" }],
    };
    await proof.executeCommand(
      owner,
      (api.lib as any).safeMaterialization.applyPackTemplate,
      args,
    );
    await expect(
      proof.executeCommand(
        outsider,
        (api.lib as any).safeMaterialization.applyPackTemplate,
        args,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it("rechecks the generated command role before returning a cached replay", async () => {
    const proof = harness();
    const tenantId = "tenant-role-replay";
    const eventId = await seedEvent(proof, tenantId);
    const logistics = proof.asRole({
      subject: "role-logistics",
      role: "logistics_manager",
      tenantId,
    });
    const unrelated = proof.asRole({
      subject: "role-unrelated",
      role: "staff",
      tenantId,
    });
    const pack = (await proof.executeCommand(
      logistics,
      api.mutations.PackList_createViaOpen,
      { eventId, name: "Role load" },
    )) as { docId: string };
    const args = {
      packListId: pack.docId,
      operationKey: "role-replay",
      items: [{ description: "Owned", requiredQuantity: 1, unit: "each" }],
    };
    await proof.executeCommand(
      logistics,
      (api.lib as any).safeMaterialization.applyPackTemplate,
      args,
    );
    await expect(
      proof.executeCommand(
        unrelated,
        (api.lib as any).safeMaterialization.applyPackTemplate,
        args,
      ),
    ).rejects.toThrow(/logistics/i);
  });

  it("atomically copies layout sections and makes confirmed retries idempotent", async () => {
    const proof = harness();
    const tenantId = "tenant-layout-atomic";
    const eventId = await seedEvent(proof, tenantId);
    const manager = proof.asRole({
      subject: "layout-manager",
      role: "event_manager",
      tenantId,
    });
    const args = {
      eventId,
      operationKey: "layout-template:event:one",
      baseSortOrder: 0,
      sections: [
        { type: "Buffet", instructions: "North wall" },
        { type: "Bar", instructions: "Patio" },
      ],
    };
    await proof.executeCommand(
      manager,
      (api.lib as any).safeMaterialization.applyLayoutTemplate,
      args,
    );
    await proof.executeCommand(
      manager,
      (api.lib as any).safeMaterialization.applyLayoutTemplate,
      args,
    );
    const rows = (await manager.query(
      api.queries.listEventLayoutSection,
      {},
    )) as unknown[];
    expect(rows).toHaveLength(2);
  });

  it("rejects a same-tenant id from the wrong parent table at validation", async () => {
    const proof = harness();
    const tenantId = "tenant-wrong-table";
    const sales = proof.asRole({
      subject: "wrong-table-sales",
      role: "sales_manager",
      tenantId,
    });
    const events = proof.asRole({
      subject: "wrong-table-events",
      role: "event_manager",
      tenantId,
    });
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Not an event" },
    )) as { docId: string };
    await expect(
      proof.executeCommand(
        events,
        (api.lib as any).safeMaterialization.applyLayoutTemplate,
        {
          eventId: client.docId,
          operationKey: "wrong-table",
          baseSortOrder: 0,
          sections: [{ type: "Bar" }],
        },
      ),
    ).rejects.toThrow(/Validator/);
  });

  it("rolls back a draft order and its first line when a later line rejects", async () => {
    const proof = harness();
    const tenantId = "tenant-po-atomic";
    const eventId = await seedEvent(proof, tenantId);
    const buyer = proof.asRole({
      subject: "po-buyer",
      role: "procurement_staff",
      tenantId,
    });
    const kitchen = proof.asRole({
      subject: "po-kitchen",
      role: "kitchen_manager",
      tenantId,
    });
    const vendor = (await proof.executeCommand(
      buyer,
      api.mutations.Vendor_createViaOnboard,
      {
        name: "Atomic Produce",
        paymentTermsDays: 14,
      },
    )) as { docId: string };
    const ingredient = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Atomic tomatoes",
        unit: "kilogram",
        costPerUnit: 2,
        allergens: [],
        category: "produce",
      },
    )) as { docId: string };
    const demandA = await proof.seedEntity(buyer, "ingredientDemands", {
      tenantId,
      eventId,
      ingredientId: ingredient.docId,
      requiredQuantity: 4,
      unit: "kilogram",
      status: "calculated",
      version: 1,
    });
    const demandB = await proof.seedEntity(buyer, "ingredientDemands", {
      tenantId,
      eventId,
      ingredientId: ingredient.docId,
      requiredQuantity: 2,
      unit: "kilogram",
      status: "calculated",
      version: 1,
    });
    await expect(
      proof.executeCommand(
        buyer,
        (api.lib as any).safeMaterialization.draftPurchaseOrder,
        {
          eventId,
          vendorId: vendor.docId,
          operationKey: "draft-po:rollback",
          lines: [
            {
              ingredientId: ingredient.docId,
              ingredientDemandId: demandA,
              orderedQuantity: 4,
              unit: "kilogram",
              unitCost: 2,
            },
            {
              ingredientId: ingredient.docId,
              ingredientDemandId: demandB,
              orderedQuantity: -1,
              unit: "kilogram",
              unitCost: 2,
            },
          ],
        },
      ),
    ).rejects.toThrow(/positive/);
    expect(await buyer.query(api.queries.listVendorOrder, {})).toEqual([]);
    expect(await buyer.query(api.queries.listVendorOrderLine, {})).toEqual([]);
  });

  it("retries a confirmed draft-PO operation without duplicating its order or demand line", async () => {
    const proof = harness();
    const tenantId = "tenant-po-retry";
    const eventId = await seedEvent(proof, tenantId);
    const buyer = proof.asRole({
      subject: "po-retry-buyer",
      role: "procurement_staff",
      tenantId,
    });
    const kitchen = proof.asRole({
      subject: "po-retry-kitchen",
      role: "kitchen_manager",
      tenantId,
    });
    const vendor = (await proof.executeCommand(
      buyer,
      api.mutations.Vendor_createViaOnboard,
      { name: "Retry Produce", paymentTermsDays: 14 },
    )) as { docId: string };
    const ingredient = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Retry onions",
        unit: "kilogram",
        costPerUnit: 1,
        allergens: [],
        category: "produce",
      },
    )) as { docId: string };
    const demandId = await proof.seedEntity(buyer, "ingredientDemands", {
      tenantId,
      eventId,
      ingredientId: ingredient.docId,
      requiredQuantity: 3,
      unit: "kilogram",
      status: "calculated",
      version: 1,
    });
    const args = {
      eventId,
      vendorId: vendor.docId,
      operationKey: "draft-po:retry",
      lines: [
        {
          ingredientId: ingredient.docId,
          ingredientDemandId: demandId,
          orderedQuantity: 3,
          unit: "kilogram",
          unitCost: 1,
        },
      ],
    };
    await proof.executeCommand(
      buyer,
      (api.lib as any).safeMaterialization.draftPurchaseOrder,
      args,
    );
    await proof.executeCommand(
      buyer,
      (api.lib as any).safeMaterialization.draftPurchaseOrder,
      args,
    );
    expect(await buyer.query(api.queries.listVendorOrder, {})).toHaveLength(1);
    expect(await buyer.query(api.queries.listVendorOrderLine, {})).toHaveLength(
      1,
    );
  });

  it("enforces live event stage and demand/event/order ownership at the PO seam", async () => {
    const proof = harness();
    const tenantId = "tenant-po-ownership";
    const eventId = await seedEvent(proof, tenantId);
    const otherEventId = await seedEvent(proof, tenantId);
    const buyer = proof.asRole({
      subject: "po-owner-buyer",
      role: "procurement_staff",
      tenantId,
    });
    const kitchen = proof.asRole({
      subject: "po-owner-kitchen",
      role: "kitchen_manager",
      tenantId,
    });
    const vendor = (await proof.executeCommand(
      buyer,
      api.mutations.Vendor_createViaOnboard,
      { name: "Ownership Produce", paymentTermsDays: 14 },
    )) as { docId: string };
    const ingredient = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Ownership herbs",
        unit: "kilogram",
        costPerUnit: 1,
        allergens: [],
        category: "produce",
      },
    )) as { docId: string };
    const demandId = await proof.seedEntity(buyer, "ingredientDemands", {
      tenantId,
      eventId: otherEventId,
      ingredientId: ingredient.docId,
      requiredQuantity: 1,
      unit: "kilogram",
      status: "calculated",
      version: 1,
    });
    const line = {
      ingredientId: ingredient.docId,
      ingredientDemandId: demandId,
      orderedQuantity: 1,
      unit: "kilogram",
      unitCost: 1,
    };
    await expect(
      proof.executeCommand(
        buyer,
        (api.lib as any).safeMaterialization.draftPurchaseOrder,
        {
          eventId,
          vendorId: vendor.docId,
          operationKey: "wrong-demand",
          lines: [line],
        },
      ),
    ).rejects.toThrow(/does not belong/);

    const otherOrder = (await proof.executeCommand(
      buyer,
      api.mutations.VendorOrder_createViaOpen,
      { vendorId: vendor.docId, eventId: otherEventId },
    )) as { docId: string };
    await expect(
      proof.executeCommand(
        buyer,
        (api.lib as any).safeMaterialization.draftPurchaseOrder,
        {
          eventId,
          vendorId: vendor.docId,
          existingOrderId: otherOrder.docId,
          operationKey: "wrong-order",
          lines: [],
        },
      ),
    ).rejects.toThrow(/matching draft/);

    await buyer.run(async (ctx) =>
      ctx.db.patch(eventId as never, { stage: "approved" }),
    );
    await expect(
      proof.executeCommand(
        buyer,
        (api.lib as any).safeMaterialization.draftPurchaseOrder,
        {
          eventId,
          vendorId: vendor.docId,
          operationKey: "wrong-stage",
          lines: [],
        },
      ),
    ).rejects.toThrow(/approved/);
  });

  it("preserves generated procurementAccess OR manageAccess capability semantics", async () => {
    const proof = harness();
    const tenantId = "tenant-po-disabled-capability";
    const eventId = await seedEvent(proof, tenantId);
    const manager = proof.asRole({
      subject: "po-event-manager",
      role: "event_manager",
      tenantId,
    });
    const procurement = proof.asRole({
      subject: "po-disabled-procurement",
      role: "procurement_staff",
      tenantId,
    });
    const owner = proof.asRole({
      subject: "po-cap-owner",
      role: "owner",
      tenantId,
    });
    const vendor = (await proof.executeCommand(
      owner,
      api.mutations.Vendor_createViaOnboard,
      { name: "Disabled capability vendor", paymentTermsDays: 14 },
    )) as { docId: string };
    await proof.seedEntity(owner, "organizationCapabilitySettings", {
      tenantId,
      capability: "procurement",
      enabled: false,
      version: 1,
    });
    await expect(
      proof.executeCommand(
        manager,
        (api.lib as any).safeMaterialization.draftPurchaseOrder,
        {
          eventId,
          vendorId: vendor.docId,
          operationKey: "manager-allowed",
          lines: [],
        },
      ),
    ).resolves.toMatchObject({ recovered: false });
    await expect(
      proof.executeCommand(
        procurement,
        (api.lib as any).safeMaterialization.draftPurchaseOrder,
        {
          eventId,
          vendorId: vendor.docId,
          operationKey: "procurement-denied",
          lines: [],
        },
      ),
    ).rejects.toThrow(/procurement/i);
  });
});
