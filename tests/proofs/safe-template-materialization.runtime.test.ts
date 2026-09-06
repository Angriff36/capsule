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
    const args = {
      packListId: pack.docId,
      operationKey: "pack-template:retry:one",
      items: [
        { description: "Chafers", requiredQuantity: 2, unit: "each" },
        { description: "Linens", requiredQuantity: 12, unit: "each" },
      ],
    };
    await proof.executeCommand(
      logistics,
      (api.lib as any).safeMaterialization.applyPackTemplate,
      args,
    );
    await proof.executeCommand(
      logistics,
      (api.lib as any).safeMaterialization.applyPackTemplate,
      args,
    );
    const rows = (await logistics.query(
      api.queries.listPackListItem,
      {},
    )) as unknown[];
    expect(rows).toHaveLength(2);
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
});
