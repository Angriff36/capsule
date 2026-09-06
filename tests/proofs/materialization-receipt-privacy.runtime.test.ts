import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { readMaterializationReceipt } from "../../convex/lib/materializationReceipt";

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

describe("runtime proof: private materialization receipts", () => {
  it("keeps exact and storage-unavailable head helper lookups tenant scoped", async () => {
    const proof = harness();
    const auth = proof.asRole({
      subject: "receipt-helper",
      role: "owner",
      tenantId: "tenant-a",
    });
    await auth.run(async (ctx) => {
      await ctx.db.insert("materializationReceipts", {
        tenantId: "tenant-b",
        receiptKey: "tenant-a:exact:pack:scope:one",
        family: "pack",
        operationKey: "scope:one",
        output: { leaked: "exact" },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("materializationReceipts", {
        tenantId: "tenant-b",
        receiptKey: "tenant-a:head:pack:scope",
        family: "pack",
        operationKey: "scope:old",
        output: { leaked: "head" },
        createdAt: 1,
        updatedAt: 1,
      });
      expect(
        await readMaterializationReceipt(
          ctx as never,
          "tenant-a",
          "pack",
          "scope:one",
          {},
        ),
      ).toBeUndefined();
      expect(
        await readMaterializationReceipt(
          ctx as never,
          "tenant-a",
          "pack",
          "scope:next:storage-unavailable",
          {},
        ),
      ).toBeUndefined();
    });
  });
  it("keeps operation outputs out of generated command replay storage", async () => {
    const proof = harness();
    const tenantId = "tenant-private-receipt";
    const logistics = proof.asRole({
      subject: "private-receipt-logistics",
      role: "logistics_manager",
      tenantId,
    });
    const sales = proof.asRole({
      subject: "private-receipt-sales",
      role: "sales_manager",
      tenantId,
    });
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Private receipt proof" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Private receipt event",
        eventType: "dinner",
        startsAt: Date.UTC(2026, 8, 20, 18),
        endsAt: Date.UTC(2026, 8, 20, 22),
        expectedHeadcount: 20,
        primaryContactName: "Avery Proof",
        budgetAmount: 1000,
        quotedPrice: 1200,
      },
    )) as { docId: string };
    const pack = (await proof.executeCommand(
      logistics,
      api.mutations.PackList_createViaOpen,
      { eventId: event.docId, name: "Private receipt load" },
    )) as { docId: string };

    await proof.executeCommand(
      logistics,
      (api.lib as any).safeMaterialization.applyPackTemplate,
      {
        packListId: pack.docId,
        operationKey: "pack-template:private:storage-unavailable",
        items: [{ description: "Chafers", requiredQuantity: 2, unit: "each" }],
      },
    );
    await proof.executeCommand(
      logistics,
      api.mutations.PackListItem_createViaAddItem,
      {
        packListId: pack.docId,
        description: "Independent generated command",
        requiredQuantity: 1,
        unit: "each",
        idempotencyKey:
          "tenant-private-receipt:pack-template:private:storage-unavailable:item:0",
      },
    );

    const stored = await logistics.run(async (ctx) => ({
      generated: await ctx.db.query("commandIdempotencyKeys").collect(),
      receipts: await ctx.db.query("materializationReceipts").collect(),
    }));
    expect(
      stored.generated.some((row) =>
        String(row.key).includes("safeMaterialization"),
      ),
    ).toBe(false);
    expect(stored.receipts).toHaveLength(2);
    expect(stored.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId,
          receiptKey:
            "tenant-private-receipt:exact:pack:pack-template:private:storage-unavailable",
          family: "pack",
          operationKey: "pack-template:private:storage-unavailable",
          output: { itemCount: 1 },
        }),
        expect.objectContaining({
          tenantId,
          receiptKey: "tenant-private-receipt:head:pack:pack-template:private",
          output: { itemCount: 1 },
        }),
      ]),
    );
    expect(
      await logistics.query(api.queries.listPackListItem, {}),
    ).toHaveLength(2);
  });

  it("denies generated receipt reads to staff and managers and isolates raw rows by tenant", async () => {
    const proof = harness();
    const tenantA = proof.asRole({
      subject: "receipt-manager-a",
      role: "manager",
      tenantId: "tenant-receipt-a",
    });
    const tenantB = proof.asRole({
      subject: "receipt-manager-b",
      role: "manager",
      tenantId: "tenant-receipt-b",
    });
    const staff = proof.asRole({
      subject: "receipt-staff-a",
      role: "staff",
      tenantId: "tenant-receipt-a",
    });
    const owner = proof.asRole({
      subject: "receipt-owner-a",
      role: "owner",
      tenantId: "tenant-receipt-a",
    });
    const admin = proof.asRole({
      subject: "receipt-admin-a",
      role: "admin",
      tenantId: "tenant-receipt-a",
    });
    const anonymous = convexTest(schema, modules);
    await tenantA.run(async (ctx) =>
      ctx.db.insert("materializationReceipts", {
        tenantId: "tenant-receipt-a",
        receiptKey: "tenant-receipt-a:exact:pack:private-key",
        family: "pack",
        operationKey: "private-key",
        output: { arbitrary: ["preserved", 7] },
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    expect(
      await tenantA.query((api.queries as any).listMaterializationReceipt, {}),
    ).toEqual([]);
    expect(
      await staff.query((api.queries as any).listMaterializationReceipt, {}),
    ).toEqual([]);
    expect(
      await owner.query((api.queries as any).listMaterializationReceipt, {}),
    ).toEqual([]);
    expect(
      await admin.query((api.queries as any).listMaterializationReceipt, {}),
    ).toEqual([]);
    expect(
      await anonymous.query(
        (api.queries as any).listMaterializationReceipt,
        {},
      ),
    ).toEqual([]);
    expect(
      await tenantB.run(async (ctx) =>
        (await ctx.db.query("materializationReceipts").collect()).filter(
          (row) => row.tenantId === "tenant-receipt-b",
        ),
      ),
    ).toEqual([]);
  });
});
